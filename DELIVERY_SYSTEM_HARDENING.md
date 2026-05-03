# Payment Delivery System - Hardened Architecture

## Overview

This document describes the hardened payment delivery system with crash-safe, idempotent, and auditable external provider integrations.

## Core Principles

1. **Write-Ahead Logging**: All external API calls are logged BEFORE dispatch
2. **Explicit Ambiguity**: UNKNOWN state is first-class, not implicit failure
3. **Safe Retries**: Never retry ambiguous states without verification
4. **Atomic Commits**: Status + response written together or not at all
5. **Payload Binding**: Idempotency keys include payload hash to prevent drift
6. **Manual Fallback**: Unresolvable cases escalate to human operators

## Architecture Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Payment Webhook                                                 │
│       ↓                                                          │
│  markOrderPaid()                                                 │
│       ↓                                                          │
│  [ATOMIC] Create DeliveryJob + ProviderLedger (UNKNOWN)         │
│       ↓                                                          │
│  Worker claims job (fencing: workerId + lockUntil)              │
│       ↓                                                          │
│  Pre-flight lease validation                                     │
│       ↓                                                          │
│  [BEFORE HTTP] Update ProviderLedger (DISPATCHED)               │
│       ↓                                                          │
│  Call Provider API (GameDrop / G2Bulk)                          │
│       ↓                                                          │
│  ┌──────────────┬─────────────────┬────────────────────┐        │
│  │ SUCCESS      │ TIMEOUT/NETWORK │ EXPLICIT FAILURE   │        │
│  │              │ (AMBIGUOUS)     │                    │        │
│  │ Atomic:      │ → UNKNOWN       │ → FAILED           │        │
│  │ - Job SUCCESS│ - Reconciler    │ - Safe retry if    │        │
│  │ - Ledger     │ - Manual review │   attempt < max    │        │
│  │   SUCCESS    │                 │                    │        │
│  └──────────────┴─────────────────┴────────────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Database Schema

### ProviderLedger (Write-Ahead Log)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Unique ledger entry ID |
| deliveryJobId | FK | Reference to DeliveryJob |
| provider | TEXT | GAMEDROP | G2BULK |
| idempotencyKey | TEXT | Unique per payload |
| payloadHash | TEXT | SHA256 of request body |
| requestPayload | JSONB | Full request sent |
| dispatchedAt | TIMESTAMP | When sent to provider |
| dispatchedBy | TEXT | Worker ID that dispatched |
| providerTransactionId | TEXT | Provider's transaction ID |
| providerResponse | JSONB | Full response from provider |
| externalState | TEXT | UNKNOWN | DISPATCHED | SUCCESS | FAILED | AMBIGUOUS |
| resolvedAt | TIMESTAMP | When resolved |
| resolutionSource | TEXT | API_RESPONSE | RECONCILIATION | MANUAL |

### DeliveryJob (Updated States)

| State | Description | Retry? |
|-------|-------------|--------|
| PENDING | Awaiting worker claim | Yes |
| DISPATCHED | Sent to provider, awaiting response | No |
| SUCCESS | Provider confirmed success | No |
| FAILED | Provider confirmed failure | Yes (if attempts < max) |
| UNKNOWN_EXTERNAL_STATE | Timeout/network error, ambiguous | No (reconciler only) |
| MANUAL_REVIEW | Requires human intervention | No |
| RETRYING | Scheduled for retry | Yes |

### ManualReviewQueue

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Unique review ID |
| deliveryJobId | FK | Reference to DeliveryJob |
| reason | TEXT | NO_STATUS_API | AMBIGUOUS | PAYLOAD_DRIFT |
| status | TEXT | PENDING | ASSIGNED | RESOLVED | ESCALATED |
| priority | TEXT | NORMAL | HIGH | CRITICAL |
| notes | TEXT | Operator notes |
| resolution | TEXT | Final resolution description |

## State Machine

```
                    ┌─────────────┐
                    │   PENDING   │
                    └──────┬──────┘
                           │ Worker claims
                           ↓
                    ┌─────────────┐
                    │  DISPATCHED │←──────────────┐
                    └──────┬──────┘               │
                           │                      │
              ┌────────────┼────────────┐         │
              │            │            │         │
              ↓            ↓            ↓         │
       ┌──────────┐ ┌──────────┐ ┌──────────┐    │
       │ SUCCESS  │ │  FAILED  │ │ UNKNOWN  │    │
       └──────────┘ └────┬─────┘ └────┬─────┘    │
                         │            │          │
                         │ retry?     │ reconciler
                         │            │          │
                         ↓            ↓          │
                    ┌──────────┐ ┌──────────┐    │
                    │ RETRYING │ │  MANUAL  │    │
                    └────┬─────┘ │  REVIEW  │    │
                         │       └──────────┘    │
                         └───────────────────────┘
```

## Failure Handling

### Timeout / Network Error

**BEFORE (BROKEN):**
```typescript
catch (timeout) {
  job.status = 'FAILED';  // WRONG - timeout is AMBIGUITY
  retry();                // May duplicate if provider succeeded
}
```

**AFTER (CORRECT):**
```typescript
catch (timeout) {
  job.status = 'UNKNOWN_EXTERNAL_STATE';
  ledger.externalState = 'AMBIGUOUS';
  // Reconciler will check provider status API
  // If no API → Manual review queue
}
```

### Idempotency Conflict (409)

**BEFORE (BROKEN):**
```typescript
if (response.status === 409) {
  job.status = 'FAILED';  // WRONG - 409 may mean SUCCESS
  retry();                // Will fail again
}
```

**AFTER (CORRECT):**
```typescript
if (response.status === 409) {
  job.status = 'UNKNOWN_EXTERNAL_STATE';
  ledger.externalState = 'AMBIGUOUS';
  // May have succeeded on previous attempt
  // Requires manual verification
}
```

### Payload Drift (Admin Edit)

**BEFORE (BROKEN):**
```typescript
// Admin changes UID between retry
retryWithSameIdempotencyKey();  // May deliver to wrong player
```

**AFTER (CORRECT):**
```typescript
if (!verifyPayloadHash(ledger.payloadHash, currentPayload)) {
  createManualReview('PAYLOAD_DRIFT_DETECTED', 'HIGH');
  // Human must verify correct recipient
}
```

## Guarantees

### Strong (Provable)

| Guarantee | Mechanism |
|-----------|-----------|
| No duplicate ledger entries | UNIQUE constraint on idempotencyKey |
| COMPLETED ⇒ response captured | Atomic transaction |
| No zombie side-effects | Pre-flight lease validation |
| Payload drift detected | Payload hash verification |
| All dispatches logged | Ledger created BEFORE API call |

### Best Effort (Provider Dependent)

| Guarantee | Mechanism | Limitation |
|-----------|-----------|------------|
| No double delivery | Idempotency key | Provider must honor it |
| Recovery from crash | Ledger + UNKNOWN | Requires status API |
| Investigation capability | Full logging | Provider must return consistent data |

### NOT Guaranteed (Business Process Required)

| Gap | Reason | Mitigation |
|-----|--------|------------|
| External consistency (blind providers) | No status API | Manual review queue |
| Reversal of charges | No refund API | Compensation policy |
| Real-time confirmation | Async providers | Customer communication |
| 100% automated recovery | Fundamental ambiguity | ~1-5% manual review rate |

## Operational Runbook

### Monitoring Alerts

```typescript
// Alert thresholds
- UNKNOWN_EXTERNAL_STATE > 2% of orders → Investigate provider
- Manual review queue age > 4hr → Add staff
- Provider API latency p99 > 10s → Escalate to provider
- Idempotency conflict rate > 1% → Provider may have bug
```

### Manual Review Process

1. **Triage**: Review queue ordered by priority + age
2. **Investigate**: Check provider dashboard, transaction logs
3. **Verify**: Contact player if needed
4. **Resolve**: Update review status + notes
5. **Learn**: Track patterns for provider evaluation

### Recovery Commands

```bash
# Run reconciliation manually
curl -X POST https://api.tykhai.com/api/cron/process-deliveries \
  -H "Authorization: Bearer $CRON_SECRET"

# Check pending manual reviews
psql -c "SELECT * FROM \"ManualReviewQueue\" WHERE status = 'PENDING' ORDER BY createdAt"

# Check ambiguous ledger entries
psql -c "SELECT * FROM \"ProviderLedger\" WHERE \"externalState\" = 'AMBIGUOUS'"
```

## Migration Guide

### Phase 1: Schema (Week 1)
```bash
npx prisma migrate dev --name add_provider_ledger_and_manual_review
npx prisma generate
```

### Phase 2: Backfill (Week 2)
```typescript
// Backfill existing DeliveryJobs with ledger entries
// Run once in production console
```

### Phase 3: Deploy (Week 3)
- Deploy updated payment.ts
- Deploy new reconciler.ts
- Monitor UNKNOWN state rate

### Phase 4: Tune (Week 4)
- Adjust reconciliation frequency
- Set up monitoring dashboards
- Train support team on manual review

## Known Limitations

1. **GameDrop has no status API**: All GameDrop ambiguities require manual review
2. **G2Bulk status requires orderId**: Must persist transactionId for reconciliation
3. **Provider bugs are unfixable**: If provider's internal state ≠ API, only manual escalation works
4. **~1-5% manual review rate is normal**: Industry standard for external provider integrations

## Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Automated recovery rate | >95% | TBD |
| Manual review rate | <5% | TBD |
| UNKNOWN resolution time | <24hr | TBD |
| Customer complaint rate | <1% | TBD |
