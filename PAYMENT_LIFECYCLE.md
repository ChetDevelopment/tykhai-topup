# Production Payment Lifecycle System

## 🎯 Overview

This document describes the **production-grade payment lifecycle system** that handles:
- Payment tracking from QR → PAID → DELIVERED
- No duplicate orders or deliveries
- Async processing with retries
- Provider failure handling
- Full traceability

---

## 📊 Payment State Machine

### States

```
PENDING ──→ PAID ──→ PROCESSING ──→ DELIVERED
   ↓           ↓            ↓
EXPIRED    FAILED       MANUAL_REVIEW
   ↓           ↓            ↓
CANCELLED    └─────────────┘
```

### State Transitions

| From | To | Trigger |
|------|-----|---------|
| PENDING | PAID | Payment confirmed (webhook/polling) |
| PENDING | EXPIRED | Payment window expired |
| PENDING | CANCELLED | User cancelled |
| PAID | PROCESSING | Delivery started |
| PAID | FAILED | Delivery failed |
| PROCESSING | DELIVERED | Delivery successful |
| PROCESSING | FAILED | Delivery failed |
| PROCESSING | MANUAL_REVIEW | Provider timeout/unknown state |
| FAILED | MANUAL_REVIEW | Manual intervention required |
| MANUAL_REVIEW | DELIVERED | Manual fulfillment |
| MANUAL_REVIEW | FAILED | Manual rejection |

### Terminal States

- **DELIVERED** - Success (final)
- **EXPIRED** - Payment window expired (final)
- **CANCELLED** - User cancelled (final)
- **FAILED** - Irrecoverable failure (final)

---

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND                              │
│  - Display QR code                                       │
│  - Poll /api/payment/status every 3-5s                  │
│  - Show status updates                                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    API LAYER (Fast Path)                 │
│  POST /api/orders                                        │
│  - Validate input (light)                               │
│  - Check idempotency                                    │
│  - Create order                                         │
│  - Generate QR                                          │
│  - Return response (<2s)                                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  BACKGROUND WORKER                       │
│  - Poll pending orders for payment                      │
│  - Process paid orders (delivery)                       │
│  - Handle retries with backoff                          │
│  - Expire old orders                                    │
│  - Reconciliation                                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  EXTERNAL PROVIDERS                      │
│  - Bakong (payment verification)                        │
│  - GameDrop (delivery)                                  │
│  - G2Bulk (delivery)                                    │
└─────────────────────────────────────────────────────────┘
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/orders` | POST | Create order + generate QR |
| `/api/payment/status` | GET | Check payment status |
| `/api/payment/webhook/bakong` | POST | Bakong payment webhook |
| `/api/orders/[orderNumber]` | GET | Get order details |
| `/api/orders/[orderNumber]/verify` | POST | Verify payment (read-only) |

---

## 🔐 Idempotency Protection

### How It Works

1. **Generate idempotency key** from request payload:
   ```typescript
   const key = generateIdempotencyKey({
     payload: {
       gameId,
       productId,
       playerUid,
       serverId,
       paymentMethod,
       amount,
     },
   });
   ```

2. **Check for duplicate**:
   ```typescript
   const { isFirst, existingOrder } = await checkIdempotency(key, orderNumber);
   
   if (!isFirst) {
     // Return cached response
     return cachedResponse;
   }
   ```

3. **Record completion**:
   ```typescript
   await completeIdempotency(key, responseData);
   ```

### Benefits

- ✅ Prevents duplicate orders
- ✅ Prevents duplicate delivery
- ✅ Safe retry on network failures
- ✅ Cached responses for duplicates

---

## ⚙️ Async Worker

### What It Does

The worker runs **outside the API request path** and handles:

1. **Payment Verification**
   - Polls pending orders
   - Checks Bakong API
   - Updates order status

2. **Delivery Processing**
   - Calls GameDrop/G2Bulk APIs
   - Handles success/failure
   - Updates order status

3. **Retry Logic**
   - Exponential backoff (30s, 1m, 2m, 4m, 8m)
   - Max 3-5 retries
   - Marks as FAILED after max retries

4. **Expiration Handling**
   - Marks unpaid orders as EXPIRED
   - Runs every 5 minutes

5. **Reconciliation**
   - Handles unknown states
   - Escalates to manual review

### Running the Worker

```bash
# Development
npm run worker:dev

# Production
npm run worker

# Or directly
npx tsx scripts/run-worker.ts
```

### Worker Stats

```typescript
{
  processed: 150,
  succeeded: 145,
  failed: 3,
  retried: 12,
  expired: 5,
  manualReview: 2,
  lastRun: "2026-05-03T12:00:00Z"
}
```

---

## 🔄 Retry System

### Exponential Backoff

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1 | 30s | 30s |
| 2 | 1m | 1.5m |
| 3 | 2m | 3.5m |
| 4 | 4m | 7.5m |
| 5 | 8m | 15.5m |

### Retry Logic

```typescript
const delay = Math.min(
  BASE_RETRY_DELAY_MS * Math.pow(2, attempt),
  MAX_RETRY_DELAY_MS
);
```

### When to Retry

- ✅ Network timeouts
- ✅ Provider errors (5xx)
- ✅ Temporary failures

### When NOT to Retry

- ❌ Invalid request (4xx)
- ❌ Insufficient balance
- ❌ Permanent failures

---

## 🧯 Provider Failure Safety

### Failure Types

| Type | Handling | State |
|------|----------|-------|
| Timeout | Mark as UNKNOWN | MANUAL_REVIEW |
| Network Error | Retry (3x) | FAILED or MANUAL_REVIEW |
| 409 Conflict | Mark as UNKNOWN | MANUAL_REVIEW |
| 4xx Error | No retry | FAILED |
| 5xx Error | Retry (3x) | FAILED |

### Unknown State Handling

When provider response is unclear:

1. **Don't assume success or failure**
2. **Mark as UNKNOWN_EXTERNAL_STATE**
3. **Escalate to MANUAL_REVIEW**
4. **Allow reconciliation later**

```typescript
if (error.message.includes("timeout")) {
  await prisma.deliveryJob.update({
    data: { status: "UNKNOWN_EXTERNAL_STATE" },
  });
  
  await markOrderForManualReview(orderId, "PROCESSING", {
    reason: "PROVIDER_TIMEOUT",
    priority: "HIGH",
  });
}
```

---

## 📝 Logging & Traceability

### Payment Logs

Every payment event is logged:

```typescript
await prisma.paymentLog.create({
  data: {
    orderId,
    event: "PAYMENT_CONFIRMED",
    status: "PAID",
    metadata: {
      paymentRef,
      amount,
      currency,
      verifiedBy: "webhook",
    },
  },
});
```

### Delivery Logs

Every delivery attempt is logged:

```typescript
await prisma.deliveryLog.create({
  data: {
    orderId,
    attemptNumber: 1,
    status: "SUCCESS",
    deliveryMethod: "GAMEDROP",
    requestPayload: JSON.stringify(payload),
    responsePayload: JSON.stringify(response),
    durationMs: 234,
  },
});
```

### State Transition Logs

Every state change is logged:

```typescript
await prisma.paymentLog.create({
  data: {
    orderId,
    event: "STATE_TRANSITION",
    status: "PAID",
    metadata: { from: "PENDING", to: "PAID" },
  },
});
```

---

## 🧪 Testing

### Validate Payment Flow

```bash
npm run validate:payment
```

Tests:
- ✅ Response time <2s
- ✅ QR code exists
- ✅ QR code format (KHQR)
- ✅ Payment reference
- ✅ MD5 hash
- ✅ No 503 errors

### Test Idempotency

```bash
# Send same request twice
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{...}'

# Second request should return cached response
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{...}'
```

### Test Worker

```bash
# Start worker
npm run worker:dev

# Create order
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{...}'

# Watch worker logs
# Should see: processing, delivery, success
```

---

## 🚀 Deployment

### Environment Variables

```bash
# Payment
PAYMENT_SIMULATION_MODE=false  # true for testing
BAKONG_TOKEN=your-token
BAKONG_ACCOUNT=your-account
BAKONG_MERCHANT_NAME=Your Business
BAKONG_MERCHANT_CITY=Phnom Penh

# Delivery
GAMEDROP_TOKEN=your-token
G2BULK_TOKEN=your-token

# App
NEXT_PUBLIC_BASE_URL=https://yourdomain.com
PUBLIC_APP_URL=https://yourdomain.com

# Database
DATABASE_URL=postgresql://...
```

### Start Services

```bash
# 1. Start Next.js server
npm run build
npm run start

# 2. Start payment worker (separate process)
npm run worker

# Or use process manager (PM2)
pm2 start npm --name "web" -- start
pm2 start npm --name "worker" -- run worker
```

### Health Checks

```bash
# Check API
curl http://localhost:3000/api/health

# Check worker (via logs)
# Look for: "[Worker] Batch completed"

# Check database
# Look for recent orders in expected states
```

---

## 📊 Monitoring

### Key Metrics

1. **API Response Time**
   - Target: <2s
   - Alert: >3s

2. **Payment Success Rate**
   - Target: >95%
   - Alert: <90%

3. **Delivery Success Rate**
   - Target: >98%
   - Alert: <95%

4. **Worker Processing Time**
   - Target: <5s per batch
   - Alert: >10s

5. **Retry Rate**
   - Target: <10%
   - Alert: >20%

### Logs to Watch

```
[Worker] Processing batch...
[Worker] Payment confirmed via polling for ORD-123456
[Worker] GameDrop delivery successful for ORD-123456
[Worker] Order ORD-123456 marked as expired
[Worker] Scheduled retry for job JOB-123 (attempt 2)
```

### Alerts

Set up alerts for:
- ❌ High 503 error rate
- ❌ Worker not running (no logs for 10m)
- ❌ High retry rate
- ❌ Many orders in MANUAL_REVIEW
- ❌ Payment success rate <90%

---

## 🔍 Troubleshooting

### Order Stuck in PENDING

**Check:**
1. Payment webhook received?
2. Bakong API working?
3. Worker running?

**Fix:**
```bash
# Manually verify payment
curl http://localhost:3000/api/payment/status?orderNumber=ORD-123456

# Check worker logs
# Look for payment verification errors
```

### Order Stuck in PROCESSING

**Check:**
1. Provider API working?
2. Delivery job status?
3. Retry count?

**Fix:**
```bash
# Check delivery job
SELECT * FROM "DeliveryJob" WHERE "orderId" = '...';

# Manually retry
# Or mark for manual review
```

### Duplicate Orders

**Check:**
1. Idempotency key generated?
2. Idempotency check working?

**Fix:**
```bash
# Check idempotency keys
SELECT * FROM "IdempotencyKey" WHERE "key" = '...';

# Verify duplicate detection
```

### Worker Not Processing

**Check:**
1. Worker running?
2. Database connection?
3. Logs for errors?

**Fix:**
```bash
# Restart worker
pm2 restart worker

# Check logs
pm2 logs worker
```

---

## 📋 Checklist

### Pre-Deployment

- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Worker script tested
- [ ] Idempotency tested
- [ ] Webhook tested
- [ ] Monitoring set up

### Post-Deployment

- [ ] API responding <2s
- [ ] Worker processing orders
- [ ] Payments confirming
- [ ] Deliveries succeeding
- [ ] Logs appearing
- [ ] Alerts configured

### Ongoing

- [ ] Monitor success rates
- [ ] Review MANUAL_REVIEW queue
- [ ] Clean up old idempotency keys
- [ ] Update retry limits if needed
- [ ] Review worker stats

---

## 🎯 Final Result

**"Every payment is tracked, verified, processed exactly once, and always reaches a final state."**

✅ **Tracked** - Every state change logged
✅ **Verified** - Payment confirmed before delivery
✅ **Once** - Idempotency prevents duplicates
✅ **Final State** - All orders reach terminal state
