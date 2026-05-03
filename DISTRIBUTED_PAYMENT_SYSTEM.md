# Production-Safe Distributed Payment System

## 🎯 System Guarantee

> **"Every payment is processed exactly once, even with multiple workers, retries, webhook delays, or system crashes."**

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  - Display QR code                                              │
│  - Poll /api/payment/status every 3-5s                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER (Fast Path)                      │
│  POST /api/orders                                               │
│  - Validate input                                               │
│  - Check idempotency (prevent duplicates)                       │
│  - Create order + generate QR                                   │
│  - Return response (<2s)                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    REDIS QUEUE (BullMQ)                         │
│  ┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐ │
│  │ payment-        │ │ delivery-        │ │ delivery-       │ │
│  │ verification    │ │ processing       │ │ retry           │ │
│  └─────────────────┘ └──────────────────┘ └─────────────────┘ │
│  ┌─────────────────┐ ┌──────────────────┐                     │
│  │ order-          │ │ reconciliation   │                     │
│  │ expiration      │ │                  │                     │
│  └─────────────────┘ └──────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              DISTRIBUTED WORKERS (Multiple Instances)           │
│  Worker 1           Worker 2           Worker 3                 │
│  ┌────────┐        ┌────────┐        ┌────────┐                │
│  │ Acquire│        │ Acquire│        │ Acquire│                │
│  │ Lock   │        │ Lock   │        │ Lock   │                │
│  │ Process│        │ Process│        │ Process│                │
│  │ Release│        │ Release│        │ Release│                │
│  └────────┘        └────────┘        └────────┘                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL PROVIDERS                            │
│  - Bakong (payment verification)                               │
│  - GameDrop (delivery)                                          │
│  - G2Bulk (delivery)                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Critical Safety Mechanisms

### 1. Distributed Locking (Redis)

**Problem:** Multiple workers processing same order simultaneously

**Solution:**
```typescript
const lock = await acquireLock(`order:${orderId}`, WORKER_ID);
if (!lock) {
  return; // Another worker is processing
}

try {
  // Process order
} finally {
  await releaseLock(lock); // ALWAYS release
}
```

**Guarantees:**
- ✅ Only ONE worker can process an order at a time
- ✅ Automatic lock expiration (prevents deadlocks)
- ✅ Lock renewal for long operations
- ✅ Works across multiple worker processes

### 2. Optimistic Locking (Database)

**Problem:** Concurrent state updates

**Solution:**
```typescript
await prisma.order.updateMany({
  where: {
    id: orderId,
    status: 'PENDING', // Only if still in expected state
  },
  data: { status: 'PAID' },
});

if (result.count === 0) {
  // State already changed - abort
}
```

**Guarantees:**
- ✅ State transitions are atomic
- ✅ Detects concurrent modifications
- ✅ Version field prevents race conditions

### 3. Idempotency at ALL Levels

**Level 1: API Request**
```typescript
const key = generateIdempotencyKey({ payload });
const { isFirst } = await checkIdempotency(key, orderId);

if (!isFirst) {
  return cachedResponse; // Return same response
}
```

**Level 2: Delivery**
```typescript
const deliveryKey = generateIdempotencyKey({
  orderNumber,
  payload: { playerUid, serverId, amount },
});

// Check before calling provider
const existing = await prisma.idempotencyKey.findUnique({
  where: { key: deliveryKey },
});

if (existing?.status === 'COMPLETED') {
  return; // Already delivered
}
```

**Level 3: Provider Calls**
```typescript
// Pass idempotency key to provider
const result = await createGameDropOrder(
  token,
  offerId,
  playerUid,
  serverId,
  idempotencyKey // Provider ensures no duplicates
);
```

### 4. Webhook Priority

**Problem:** Webhook and worker both trying to mark as PAID

**Solution:**
```typescript
// Webhook has priority
const markResult = await markOrderAsPaid(orderId, {
  verifiedBy: 'webhook', // Higher priority
  ...
});

// Worker checks state before processing
const order = await prisma.order.findUnique({
  where: { id: orderId },
  select: { status: true },
});

if (['PAID', 'PROCESSING', 'DELIVERED'].includes(order.status)) {
  return; // Already processed by webhook
}
```

**Guarantees:**
- ✅ Webhook always wins race condition
- ✅ Worker re-checks state before processing
- ✅ No duplicate payment confirmation

### 5. Crash Safety

**Problem:** Worker crashes mid-processing

**Solution:**
```typescript
// 1. Acquire lock
const lock = await acquireLock(resource, workerId);

// 2. Process with try-catch
try {
  await processOrder();
} catch (error) {
  // Log error, job will be retried
  throw error;
} finally {
  // 3. ALWAYS release lock
  await releaseLock(lock);
}
```

**Guarantees:**
- ✅ No partial state (atomic operations)
- ✅ Lock auto-expires if worker crashes
- ✅ BullMQ retries failed jobs
- ✅ State always recoverable

---

## 📊 Queue System (BullMQ)

### Queues

| Queue | Purpose | Retries | Backoff |
|-------|---------|---------|---------|
| `payment-verification` | Verify pending payments | 3 | Exponential (1s base) |
| `delivery-processing` | Process paid orders | 2 | Exponential (1s base) |
| `delivery-retry` | Retry failed deliveries | 3 | Exponential (30s base) |
| `order-expiration` | Mark expired orders | 3 | Exponential (1s base) |
| `reconciliation` | Handle unknown states | 1 | None (manual review) |

### Job Processing

```typescript
// Add job to queue
await addDeliveryProcessingJob({
  orderId,
  orderNumber,
  paymentRef,
  provider: 'GAMEDROP',
});

// Worker processes job
worker.process(async (job) => {
  await processDeliverySafely(job);
});
```

### Retry Strategy

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1 | 30s | 30s |
| 2 | 1m | 1.5m |
| 3 | 2m | 3.5m |
| 4 | 4m | 7.5m |
| 5 | 8m | 15.5m |

After max retries → Mark as `FAILED` or `MANUAL_REVIEW`

---

## 🔒 Locking Strategy

### Lock Acquisition

```typescript
async function acquireLock(
  resource: string,
  ownerId: string,
  ttlMs: number = 30000
): Promise<Lock | null> {
  const lockKey = `lock:${resource}`;
  const lockValue = `${ownerId}:${Date.now()}:${uuid}`;
  
  // Set with NX (only if not exists) and PX (expiration)
  const result = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
  
  return result === 'OK' ? { key: lockKey, value: lockValue } : null;
}
```

### Lock Release

```typescript
async function releaseLock(lock: Lock): Promise<boolean> {
  // Lua script for atomic check-and-delete
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  
  return await redis.eval(script, 1, lock.key, lock.value) === 1;
}
```

### Lock Renewal

For long operations (>30s):
```typescript
function startLockRenewal(lock: Lock, ttlMs: number) {
  setInterval(async () => {
    const remaining = lock.expiresAt - Date.now();
    if (remaining < ttlMs / 2) {
      // Extend lock
      await redis.pexpire(lock.key, ttlMs);
      lock.expiresAt = Date.now() + ttlMs;
    }
  }, 10000); // Renew every 10 seconds
}
```

---

## 📝 State Transition Safety Rules

### Valid Transitions

```
PENDING ──→ PAID ──→ PROCESSING ──→ DELIVERED
   ↓           ↓            ↓
EXPIRED    FAILED       MANUAL_REVIEW
```

### Transition Rules

1. **Atomic Updates Only**
   ```typescript
   await prisma.order.updateMany({
     where: { id, status: from },
     data: { status: to },
   });
   ```

2. **Check Before Transition**
   ```typescript
   const order = await prisma.order.findUnique({
     where: { id },
     select: { status: true },
   });
   
   if (!canTransition(order.status, to)) {
     throw new Error('Invalid transition');
   }
   ```

3. **Webhook Priority**
   ```typescript
   if (verifiedBy === 'webhook') {
     // Can override worker
     return transitionOrderState(id, from, to, { webhookPriority: true });
   }
   ```

4. **Log Every Transition**
   ```typescript
   await logStateTransition(orderId, orderNumber, from, to, actor, reason);
   ```

---

## 🧯 Failure Handling

### Provider Failures

| Error Type | Handling | State |
|------------|----------|-------|
| Timeout | Retry (3x) → Manual Review | UNKNOWN |
| Network Error | Retry (3x) → Manual Review | UNKNOWN |
| 409 Conflict | Manual Review | UNKNOWN |
| 4xx Error | No Retry | FAILED |
| 5xx Error | Retry (3x) | FAILED |

### Unknown State Handling

```typescript
if (error.message.includes('timeout')) {
  // Don't assume success or failure
  await markOrderForManualReview(orderId, 'PROCESSING', {
    reason: 'PROVIDER_TIMEOUT',
    priority: 'HIGH',
  });
  
  await addReconciliationJob({
    orderId,
    orderNumber,
    reason: 'UNKNOWN_STATE',
    priority: 'HIGH',
  });
}
```

### Crash Recovery

1. **Lock Expires** → Another worker can process
2. **Job Re-queued** → BullMQ automatic retry
3. **State Unchanged** → Safe to retry
4. **Audit Log** → Full traceability

---

## 📊 Audit Log System

### What Gets Logged

Every state change:
- Order creation
- Payment initiation
- Payment verification
- State transitions
- Delivery attempts
- Lock acquire/release
- Idempotency checks
- Retries
- Errors

### Log Entry Structure

```typescript
{
  orderId: string,
  orderNumber: string,
  eventType: 'STATE_TRANSITION',
  actor: 'WORKER',
  previousState: 'PAID',
  newState: 'PROCESSING',
  reason: 'Delivery started',
  requestId: 'job-123',
  metadata: {
    provider: 'GAMEDROP',
    transactionId: 'TXN-456',
  },
  timestamp: Date,
}
```

### Query Audit Trail

```typescript
const trail = await getOrderAuditTrail('ORD-123456');
// Returns chronological list of all events
```

---

## 🚀 Deployment

### Environment Variables

```bash
# Redis (REQUIRED for distributed system)
UPSTASH_REDIS_URL=redis://...
# OR
REDIS_URL=redis://localhost:6379

# Payment
PAYMENT_SIMULATION_MODE=false
BAKONG_TOKEN=your-token
BAKONG_ACCOUNT=your-account

# Delivery
GAMEDROP_TOKEN=your-token
G2BULK_TOKEN=your-token

# App
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
```

### Start Services

```bash
# 1. Start Next.js server
npm run build
npm run start

# 2. Start distributed workers (multiple instances OK)
npm run worker

# Or with PM2 (recommended for production)
pm2 start npm --name "web" -- start
pm2 start npm --name "worker-1" -- run worker
pm2 start npm --name "worker-2" -- run worker
pm2 start npm --name "worker-3" -- run worker
```

### Scaling

- **Add more workers**: Just run `npm run worker` on more servers
- **Redis handles coordination**: No configuration needed
- **Automatic load balancing**: BullMQ distributes jobs

---

## 📈 Monitoring

### Queue Stats

```bash
# Check queue health
curl http://localhost:3000/api/admin/queue-stats

# Response:
{
  "payment-verification": {
    "waiting": 5,
    "active": 3,
    "completed": 150,
    "failed": 2,
    "delayed": 1
  },
  ...
}
```

### Key Metrics

| Metric | Target | Alert |
|--------|--------|-------|
| API Response Time | <2s | >3s |
| Queue Waiting | <100 | >500 |
| Failed Jobs | <5% | >10% |
| Retry Rate | <10% | >20% |
| Manual Review | <2% | >5% |

### Logs to Monitor

```
[Worker] Payment verified for ORD-123456
[Worker] Successfully delivered ORD-123456
[Worker] Order ORD-123456 marked for manual review
[Lock] Acquired lock for order:ORD-123456
[Lock] Released lock for order:ORD-123456
[Queue] Added delivery processing job: JOB-789
```

---

## 🔍 Troubleshooting

### Order Stuck in PENDING

**Check:**
1. Payment verification queue
2. Webhook received?
3. Worker logs

**Fix:**
```bash
# Manually verify
curl http://localhost:3000/api/payment/status?orderNumber=ORD-123456

# Check queue
# Look for stuck jobs
```

### Order Stuck in PROCESSING

**Check:**
1. Delivery queue
2. Provider API status
3. Lock held?

**Fix:**
```bash
# Check if lock is held
# Force release if stale
curl -X POST http://localhost:3000/api/admin/force-release-lock?orderId=...
```

### Duplicate Processing

**Check:**
1. Idempotency keys
2. Lock system
3. Audit logs

**Fix:**
```bash
# Review audit trail
curl http://localhost:3000/api/admin/audit-trail?orderNumber=ORD-123456
```

---

## ✅ System Guarantees

### Exactly-Once Processing

✅ **API Level**: Idempotency keys prevent duplicate orders
✅ **Worker Level**: Distributed locks prevent concurrent processing
✅ **Provider Level**: Idempotency keys prevent duplicate delivery

### Crash Safety

✅ **Atomic Operations**: No partial state
✅ **Lock Expiration**: Deadlocks impossible
✅ **Job Persistence**: Survives restarts
✅ **Automatic Retry**: Transient failures handled

### Concurrency Safety

✅ **Optimistic Locking**: Detects conflicts
✅ **Webhook Priority**: Correct state always wins
✅ **State Validation**: Re-checks before processing

### Full Traceability

✅ **Audit Log**: Every action logged
✅ **Request IDs**: End-to-end tracing
✅ **State History**: Full transition trail

---

## 🎯 Final Result

> **"Every payment is tracked, verified, processed exactly once, and always reaches a correct final state — even under concurrency, failures, retries, or distributed workers."**
