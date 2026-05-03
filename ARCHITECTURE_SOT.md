# Single Source of Truth Architecture

## Core Principle

**DeliveryState is the ONLY authoritative execution state.**

All other tables (Order, ProviderLedger, ManualReviewQueue, DeadLetterQueue) are **projections** or **audit logs** only. They are NEVER used for execution decisions.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SINGLE SOURCE OF TRUTH                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐                                                   │
│  │  DeliveryState   │ ← THE ONLY EXECUTION STATE                       │
│  │  - status        │                                                   │
│  │  - attempt       │                                                   │
│  │  - lockedBy      │                                                   │
│  │  - lockVersion   │                                                   │
│  │  - errorCode     │                                                   │
│  └────────┬─────────┘                                                   │
│           │                                                             │
│           │ Atomic Updates                                              │
│           │                                                             │
│           ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PROJECTIONS (Async, Not Critical)             │   │
│  │  - Order.status (derived from DeliveryState.status)             │   │
│  │  - ProviderLedger (audit trail only)                            │   │
│  │  - Analytics (metrics)                                          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    SYSTEM CONTROL (DB-Stored)                    │   │
│  │  - BackpressureState (singleton, cross-worker sync)             │   │
│  │  - CircuitBreaker (per-provider, DB-stored)                     │   │
│  │  - ProviderHealthMetric (append-only log)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## State Machine

```
                    ┌─────────────┐
                    │   PENDING   │
                    └──────┬──────┘
                           │ Atomic Claim (SELECT FOR UPDATE SKIP LOCKED)
                           ↓
                    ┌─────────────┐
                    │ IN_PROGRESS │
                    └──────┬──────┘
                           │ Validate Lease (DB NOW())
                           ↓
                    ┌─────────────┐
                    │ DISPATCHED  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ↓            ↓            ↓
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ SUCCESS  │ │  FAILED  │ │ UNKNOWN  │
       └──────────┘ └────┬─────┘ └────┬─────┘
                         │ retry?     │ escalate
                         │ safe?      │
                         ↓            ↓
                    ┌──────────┐ ┌──────────────┐
                    │ PENDING  │ │ MANUAL_REVIEW│
                    └──────────┘ └──────┬───────┘
                                        │
                                        ↓
                                   ┌──────────┐
                                   │DEAD_LETTER│
                                   └──────────┘
```

---

## Key Invariants

### 1. Single Write Rule
```typescript
// ✅ CORRECT: Single-row update
await prisma.deliveryState.update({
  where: { id, lockedBy: workerId },
  data: { status: 'SUCCESS', providerResponse },
});

// ❌ WRONG: Multi-table transaction
await prisma.$transaction([
  prisma.deliveryState.update({...}),
  prisma.order.update({...}),
  prisma.providerLedger.update({...}),
]);
```

### 2. Atomic Job Claiming
```typescript
// Uses SELECT FOR UPDATE SKIP LOCKED
const claimed = await tx.$queryRaw`
  UPDATE "DeliveryState" ds
  SET status = 'IN_PROGRESS', "lockedBy" = ${workerId}
  WHERE ds.id = (
    SELECT id FROM "DeliveryState"
    WHERE status IN ('PENDING', 'FAILED')
      AND "nextAttemptAt" <= NOW()
    ORDER BY "createdAt" ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *
`;
```

### 3. Idempotency Immutability
```typescript
// ✅ CORRECT: New attempt = new key
if (payloadChanged) {
  await prisma.deliveryState.update({
    where: { id },
    data: {
      attempt: attempt + 1,
      idempotencyKey: generateNewKey(newPayload),
    },
  });
}

// ❌ WRONG: Mutate key in-place
await prisma.deliveryState.update({
  where: { id },
  data: { idempotencyKey: newKey }, // Same attempt!
});
```

### 4. Crash Safety
```typescript
// ✅ CORRECT: Single-row atomic
await transitionState(id, workerId, version, {
  status: 'SUCCESS',
  providerResponse,
});
// If crash: state unchanged, safe to retry

// ❌ WRONG: Partial multi-table
await prisma.$transaction([
  updateDeliveryState(), // Committed
  updateProviderLedger(), // Crash here
]);
// State divergence!
```

---

## Failure Mode Elimination

| Original Issue | SOT Solution |
|----------------|--------------|
| Ledger-Job divergence | DeliveryState is ONLY state |
| Circuit breaker race | DB-stored, checked during claim |
| Idempotency key mutation | Immutable per attempt |
| Backpressure staleness | Singleton DB row |
| DLQ replay duplicate | Check state != SUCCESS |
| Audit false positives | Separate admin edit log |
| Clock drift | DB NOW() everywhere |

---

## Execution Flow

```
1. Worker polls for jobs
   ↓
2. Atomic claim (SELECT FOR UPDATE SKIP LOCKED)
   - Checks backpressure (DB)
   - Checks circuit breaker (DB)
   - Sets lockedBy, lockUntil, lockVersion
   ↓
3. Validate lease before API call
   - WHERE lockedBy = workerId AND lockUntil > NOW()
   ↓
4. Transition to DISPATCHED (single-row)
   ↓
5. Call provider API
   ↓
6. Transition to final state (single-row)
   - SUCCESS / FAILED / UNKNOWN
   - Includes providerResponse
   ↓
7. Update projections (async, best-effort)
   - Order.status
   - ProviderLedger
```

---

## Guarantee Model

| Guarantee | Mechanism |
|-----------|-----------|
| No duplicate charges | Idempotency key immutable per attempt |
| No double delivery | Single-row atomic transitions |
| No infinite UNKNOWN | Time-based escalation to MANUAL_REVIEW |
| No worker race | SELECT FOR UPDATE SKIP LOCKED |
| Deterministic recovery | DeliveryState always reflects reality |
| 100% resolvability | All states converge to SUCCESS/FAILED/DEAD_LETTER |

---

## Migration Strategy

### Phase 1: Schema (Week 1)
- Create DeliveryState table
- Create BackpressureState singleton
- Add deliveryStateId to ProviderLedger

### Phase 2: Data Migration (Week 2)
- Migrate DeliveryJob → DeliveryState
- Update foreign keys
- Verify state consistency

### Phase 3: Worker Rewrite (Week 3)
- Deploy delivery-worker-sot.ts
- Switch cron jobs to new worker
- Monitor for 48 hours

### Phase 4: Deprecation (Week 4)
- Remove old payment.ts worker logic
- Remove reconciler as primary correctness
- Keep for audit only

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| State divergence incidents | 0 | Audit checker |
| Duplicate provider calls | 0 | Provider logs |
| UNKNOWN > 24 hours | < 1% | DeliveryState query |
| Worker race conditions | 0 | lockVersion conflicts |
| Crash recovery time | < 1 min | Stuck job scan |

---

**This architecture guarantees: No dual-source-of-truth, no in-memory critical state, no eventual consistency as primary correctness.**
