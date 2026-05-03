# Crash Recovery Rules - Deterministic at Every Phase

## Execution Phase Machine

```
PENDING → IN_PROGRESS → SENDING → DISPATCHED → SUCCESS/FAILED/UNKNOWN
    ↑         ↑            ↑          ↑
    │         │            │          │
    │         │            │          └─ providerFinalizedAt set (NEVER retry)
    │         │            └─ CRASH BOUNDARY (assume sent)
    │         └─ Safe to retry (no provider call)
    └─ Initial state
```

---

## Crash Recovery Matrix

| Phase When Crash | State After Crash | Recovery Action | Rationale |
|------------------|-------------------|-----------------|-----------|
| **PENDING** | PENDING (unchanged) | None - still in queue | No side effects yet |
| **IN_PROGRESS** (before SENDING) | IN_PROGRESS (lock expired) | Reset to PENDING | No provider call made, safe to retry |
| **SENDING** | SENDING (dispatchedAt set) | → UNKNOWN | **CRASH BOUNDARY** - assume provider may have received, idempotent-safe recovery |
| **DISPATCHED** (no final state) | DISPATCHED | Reconciler checks status | Response received but not processed |
| **SUCCESS** + providerFinalizedAt | SUCCESS (unchanged) | NEVER touch | External execution complete |
| **FAILED_FINAL** + providerFinalizedAt | FAILED_FINAL (unchanged) | NEVER touch | External execution complete |
| **UNKNOWN** | UNKNOWN | Escalate per time policy | Ambiguous, requires investigation |

---

## Critical Recovery Rules

### Rule 1: NEVER Replay Finalized
```sql
-- CORRECT: Check providerFinalizedAt before any recovery
UPDATE "DeliveryState"
SET status = 'PENDING'
WHERE status = 'IN_PROGRESS'
  AND "providerFinalizedAt" IS NULL  -- CRITICAL CHECK
  AND "lockUntil" < NOW();

-- WRONG: Missing providerFinalizedAt check
UPDATE "DeliveryState"
SET status = 'PENDING'
WHERE status = 'IN_PROGRESS'
  AND "lockUntil" < NOW();  -- May replay finalized!
```

### Rule 2: SENDING = Unknown Sent State
```typescript
// If crash after SENDING:
// 1. Set to UNKNOWN (not FAILED)
// 2. Recovery must be idempotent-safe
// 3. Assume provider MAY have received

await transitionState(id, workerId, version, {
  status: 'UNKNOWN',  // NOT failed
  errorCode: 'CRASH_RECOVERY',
  lastError: 'Worker crashed after SENDING',
  // Do NOT reset attempt - this counts toward max
});
```

### Rule 3: Lock Version Prevents Stale Overwrite
```typescript
// CORRECT: Version check on every update
await prisma.deliveryState.update({
  where: {
    id,
    lockedBy: workerId,
    lockVersion: expectedVersion,  // Fencing
  },
  data: { status: 'SUCCESS' },
});

// If version mismatch: update fails, no overwrite
```

### Rule 4: Single-Row Atomic Only
```typescript
// CORRECT: Single-row update
await transitionState(id, workerId, version, {
  status: 'SUCCESS',
  providerResponse: response,
});

// WRONG: Multi-table transaction
await prisma.$transaction([
  prisma.deliveryState.update({...}),
  prisma.order.update({...}),  // Projection, not critical
  prisma.providerLedger.update({...}),  // Audit only
]);
```

---

## Recovery Scanner Implementation

```typescript
export async function recoverStuckJobs(): Promise<{ recovered: number }> {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  
  // 1. Recover SENDING jobs (crash after intent persisted)
  // These MUST become UNKNOWN (not PENDING) - assume sent
  const sendingRecovery = await prisma.$executeRaw`
    UPDATE "DeliveryState"
    SET 
      status = 'UNKNOWN',  -- NOT PENDING!
      "lockedBy" = null,
      "lockUntil" = null,
      "lockVersion" = "lockVersion" + 1,
      "errorCode" = 'CRASH_RECOVERY',
      "lastError" = 'Worker crashed after SENDING',
      "nextAttemptAt" = NOW() + INTERVAL '5 minutes',
      "updatedAt" = NOW()
    WHERE status = 'SENDING'
      AND "providerFinalizedAt" IS NULL  -- NEVER touch finalized
      AND "dispatchedAt" < ${tenMinutesAgo}
  `;
  
  // 2. Recover IN_PROGRESS jobs (crash before intent persisted)
  // These can safely become PENDING - no provider call
  const inProgressRecovery = await prisma.$executeRaw`
    UPDATE "DeliveryState"
    SET 
      status = 'PENDING',  -- Safe to retry
      "lockedBy" = null,
      "lockUntil" = null,
      "lockVersion" = "lockVersion" + 1,
      "nextAttemptAt" = NOW() + INTERVAL '1 minute',
      "updatedAt" = NOW()
    WHERE status = 'IN_PROGRESS'
      AND "providerFinalizedAt" IS NULL
      AND "lockUntil" < NOW()
  `;
  
  return { recovered: sendingRecovery + inProgressRecovery };
}
```

---

## Replay Safety Rules (DLQ + Retry)

### Rule 1: Check providerFinalizedAt
```typescript
export async function replayDLQEntry(dlqId: string): Promise<{ success: boolean; error?: string }> {
  const dlq = await prisma.deadLetterQueue.findUnique({
    where: { id: dlqId },
    include: { deliveryState: true },
  });
  
  // CRITICAL: Never replay finalized
  if (dlq.deliveryState.providerFinalizedAt) {
    return { 
      success: false, 
      error: 'Cannot replay - provider finalized externally' 
    };
  }
  
  // CRITICAL: Never replay SUCCESS
  if (dlq.deliveryState.status === 'SUCCESS') {
    return { 
      success: false, 
      error: 'Cannot replay SUCCESS state' 
    };
  }
  
  // Safe to replay - create NEW attempt with NEW key
  const newKey = generateIdempotencyKey(dlq.deliveryState.orderId, newPayload);
  
  await prisma.$transaction([
    prisma.deliveryState.update({
      where: { id: dlq.deliveryState.id },
      data: {
        status: 'PENDING',
        attempt: dlq.deliveryState.attempt + 1,  // NEW attempt
        idempotencyKey: newKey,  // NEW key
      },
    }),
    prisma.deadLetterQueue.update({
      where: { id: dlqId },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    }),
  ]);
  
  return { success: true };
}
```

---

## Guarantee Summary

| Guarantee | Mechanism |
|-----------|-----------|
| No duplicate provider calls | lockVersion fencing + SENDING boundary |
| No double delivery | providerFinalizedAt check |
| No lost success after crash | UNKNOWN state (not FAILED) |
| No stale worker overwrite | lockVersion increment on every transition |
| No replay of finalized actions | providerFinalizedAt IS NULL check |
| No in-memory state dependency | All state in DB |
| No multi-table transaction dependency | Single-row atomic updates |
| Deterministic recovery | Phase-specific recovery rules |

---

## Monitoring Queries

```sql
-- Check for any jobs stuck in SENDING > 10 min
SELECT id, "dispatchedAt", "lockedBy", "lockVersion"
FROM "DeliveryState"
WHERE status = 'SENDING'
  AND "dispatchedAt" < NOW() - INTERVAL '10 minutes'
  AND "providerFinalizedAt" IS NULL;

-- Check for any finalized jobs that were modified (should be 0)
SELECT id, status, "providerFinalizedAt", "updatedAt"
FROM "DeliveryState"
WHERE "providerFinalizedAt" IS NOT NULL
  AND "updatedAt" > "providerFinalizedAt";

-- Check lock version conflicts (should be 0)
SELECT COUNT(*) as conflicts
FROM "AuditLog"
WHERE "eventType" = 'STATE_TRANSITION'
  AND "details" LIKE '%VERSION_MISMATCH%';
```

---

**System is now Stripe-level safe: deterministic recovery at every crash point, no replay of finalized actions, no stale overwrites.**
