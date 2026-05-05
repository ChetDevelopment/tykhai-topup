# 🚀 Ty Khai TopUp - Automated Testing Framework

## Complete Testing Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TESTING PYRAMID                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                         ╱╲                                       │
│                        ╱  ╲                                      │
│                       ╱ E2E ╲     15 tests                       │
│                      ╱ Tests ╲    (User flows)                   │
│                     ╱────────╲                                   │
│                    ╱          ╲                                  │
│                   ╱ Integration ╲  20 tests                      │
│                  ╱     Tests      ╲ (Component integration)       │
│                 ╱──────────────────╲                             │
│                ╱                    ╲                            │
│               ╱     API Tests        ╲   35 tests                │
│              ╱  (Orders, Payment,     ╲  (Endpoint validation)    │
│             ╱       Admin)             ╲                         │
│            ╱────────────────────────────╲                        │
│           ╱                              ╲                       │
│          ╱     Database Integrity Tests   ╲  15 tests            │
│         ╱      (Consistency, Duplicates)    ╲ (Data validation)   │
│        ╱────────────────────────────────────╲                    │
│                                                                  │
│                    TOTAL: ~85 Automated Tests                    │
│                    Execution Time: < 5 minutes                   │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Complete Folder Structure

```
tykhai-topup/
├── tests/
│   ├── api/
│   │   ├── orders.test.ts          # Order CRUD, validation, idempotency
│   │   ├── payment.test.ts         # QR generation, payment flows
│   │   └── admin.test.ts           # Admin APIs, dashboard, refunds
│   ├── e2e/
│   │   ├── user-flow.test.ts       # Browse → Order → Pay → Deliver
│   │   ├── payment-flow.test.ts    # Complete payment lifecycle
│   │   └── admin-flow.test.ts      # Admin panel workflows
│   ├── integration/
│   │   ├── order-payment-delivery.test.ts  # Component integration
│   │   └── db-integrity.test.ts    # Data consistency checks
│   ├── utils/
│   │   ├── test-client.ts          # API test client (typed)
│   │   ├── mock-data.ts            # Test data generators
│   │   └── test-reporter.ts        # HTML/JSON report generator
│   ├── reports/
│   │   ├── api-orders-report.html
│   │   ├── api-payment-report.html
│   │   ├── api-admin-report.html
│   │   ├── e2e-user-flow-report.html
│   │   ├── e2e-payment-flow-report.html
│   │   ├── e2e-admin-flow-report.html
│   │   ├── integration-order-payment-delivery-report.html
│   │   ├── db-integrity-report.html
│   │   └── test-summary.json       # Combined summary
│   ├── .env.example                # Environment template
│   ├── run-all.ts                  # Master test runner
│   ├── open-report.ps1             # Open latest report
│   └── README.md                   # This documentation
│
├── .github/
│   └── workflows/
│       └── tests.yml               # GitHub Actions CI/CD
│
└── package.json                    # Updated with test scripts
```

## 🎯 Test Coverage Matrix

| Category | Test File | Tests | Coverage |
|----------|-----------|-------|----------|
| **API - Orders** | `api/orders.test.ts` | 12 | Order creation, validation, retrieval, idempotency |
| **API - Payment** | `api/payment.test.ts` | 15 | QR generation, simulation, verification, state transitions |
| **API - Admin** | `api/admin.test.ts` | 12 | Auth, dashboard, orders, refunds, audit logs |
| **E2E - User** | `e2e/user-flow.test.ts` | 12 | Browse, select, order, pay, deliver flow |
| **E2E - Payment** | `e2e/payment-flow.test.ts` | 10 | Payment lifecycle, QR validation, duplicates |
| **E2E - Admin** | `e2e/admin-flow.test.ts` | 15 | Login, dashboard, orders, refunds, audit |
| **Integration** | `order-payment-delivery.test.ts` | 10 | Component integration, idempotency |
| **Database** | `db-integrity.test.ts` | 12 | Duplicates, orphans, consistency, FK integrity |
| **TOTAL** | **8 files** | **~88** | **Full platform coverage** |

## 🧪 Test Scenarios Covered

### User Flow Tests
```
✓ Browse games catalog
✓ Select product from game
✓ Create order with player details
✓ QR generation (<2 seconds SLA)
✓ QR format validation (EMV-compliant KHQR)
✓ Payment simulation
✓ Order status update (PENDING → PAID)
✓ Delivery trigger
✓ Currency support (USD/KHR)
✓ Error handling (invalid email, UID)
✓ Rapid order creation (stress test)
✓ Input sanitization (XSS prevention)
```

### Admin Panel Tests
```
✓ Admin authentication
✓ Dashboard statistics
✓ Order list with pagination
✓ Filter by status (PENDING, PAID, DELIVERED)
✓ Search by order number
✓ Search by customer email
✓ Order details view
✓ Refund processing
✓ Audit log viewing
✓ Game management
✓ Product management
✓ Fraud flag system
✓ Maintenance mode handling
```

### Payment System Tests
```
✓ QR generation (never null/empty)
✓ QR format validation (EMV KHQR)
✓ Payment reference generation
✓ Expiration time setting
✓ Payment simulation
✓ Duplicate payment prevention
✓ Payment verification
✓ State transitions (PENDING→PAID→DELIVERED)
✓ Payment timeout handling
✓ Invalid hash handling
✓ Currency conversion (USD↔KHR)
✓ Performance (<500ms QR generation)
```

### Database Integrity Tests
```
✓ No duplicate order numbers
✓ No duplicate payment references
✓ No orphan payment logs
✓ Revenue calculation accuracy
✓ Order state consistency
✓ paidAt timestamp on payment
✓ Idempotency key enforcement
✓ Email encryption
✓ UID sanitization
✓ Foreign key integrity (game, product)
✓ Audit trail creation
```

## 🚀 How to Run

### One Command - All Tests
```bash
npm run test:all
```

### By Category
```bash
# API Tests
npm run test:api           # All API tests
npm run test:api:orders    # Orders only
npm run test:api:payment   # Payment only
npm run test:api:admin     # Admin only

# E2E Tests
npm run test:e2e           # All E2E tests
npm run test:e2e:user      # User flow
npm run test:e2e:payment   # Payment flow
npm run test:e2e:admin     # Admin flow

# Integration Tests
npm run test:integration   # All integration
npm run test:db            # Database integrity
```

### With Filter
```bash
npm run test:all -- Payment    # Tests with "Payment" in name
npm run test:all -- Order      # Tests with "Order" in name
```

### View Reports
```bash
npm run test:report            # Open latest HTML report
```

## 📊 Sample Output

```
╔══════════════════════════════════════════════════════════╗
║     Ty Khai TopUp - Automated Testing Framework          ║
╚══════════════════════════════════════════════════════════╝

📅 Started: 5/5/2026, 9:00:00 AM
🌐 Base URL: http://localhost:3000

📋 Running 7 test suite(s):

   • API - Orders
   • API - Payment
   • API - Admin
   • E2E - User Flow
   • E2E - Payment Flow
   • Integration - Order/Payment/Delivery
   • Integration - DB Integrity

────────────────────────────────────────────────────────────
🧪 Running: API - Orders
────────────────────────────────────────────────────────────
✅ API - Orders passed (12.45s)

────────────────────────────────────────────────────────────
🧪 Running: API - Payment
────────────────────────────────────────────────────────────
✅ API - Payment passed (15.32s)

...

════════════════════════════════════════════════════════════
📊 FINAL SUMMARY
════════════════════════════════════════════════════════════
Total Suites:  7
Passed:        7 (100.0%)
Failed:        0
Total Time:    78.45s
════════════════════════════════════════════════════════════

📁 Reports saved to: tests/reports/
════════════════════════════════════════════════════════════
```

## 🔧 Configuration

### Environment Setup

Create `tests/.env`:

```bash
# Test Environment
NODE_ENV=test
TEST_BASE_URL=http://localhost:3000

# Admin Credentials
TEST_ADMIN_EMAIL=admin@tykhai.com
TEST_ADMIN_PASSWORD=admin123

# Payment (Simulation Mode for Testing)
PAYMENT_SIMULATION_MODE=true
ENABLE_DEV_BAKONG=true

# Database (Test DB - Separate from Production)
DATABASE_URL=postgresql://user:pass@localhost:5432/tykhai_test

# Redis
REDIS_URL=redis://localhost:6379

# Security
NEXTAUTH_SECRET=test-secret-key-for-testing-only
NEXTAUTH_URL=http://localhost:3000
```

### Safety Features

- ✅ **Simulation Mode**: No real money transactions
- ✅ **Test Database**: Separate from production
- ✅ **Test Emails**: Unique test emails per run
- ✅ **Idempotency**: No duplicate orders
- ✅ **Cleanup**: Tests don't corrupt data

## 📈 CI/CD Integration

### GitHub Actions

The workflow (`.github/workflows/tests.yml`) provides:

1. **PostgreSQL & Redis** services
2. **Database migrations**
3. **Application build**
4. **Test execution**
5. **Report artifacts**

### Pipeline Flow

```
Push/PR → Checkout → Install → Migrate → Build → Start → Test → Reports
                                                      ↓
                                         ┌────────────┴────────────┐
                                         ↓                         ↓
                                   HTML Reports              JSON Summary
                                   (Visual)                  (CI parsing)
```

## ✅ Validation Rules

Every test validates:

| Check | Description |
|-------|-------------|
| ✓ HTTP Status | Correct response codes |
| ✓ Response Schema | Expected fields present |
| ✓ Database State | Changes persisted correctly |
| ✓ No Duplicates | Idempotency enforced |
| ✓ Final State | Correct order status |

## 🎯 Production Trust Checklist

Before deploying to production:

- [ ] `npm run test:all` passes 100%
- [ ] API tests verify all endpoints
- [ ] E2E tests verify user flows
- [ ] Integration tests verify components
- [ ] DB tests verify data integrity
- [ ] Payment tests verify QR generation
- [ ] Admin tests verify management
- [ ] Reports show no failures

## 📞 Quick Reference

```bash
# Before deploy
npm run build && npm run test:all

# After deploy (production smoke test)
TEST_BASE_URL=https://tykhai.com npm run test:api:orders

# Debug specific test
npm run test:api:payment

# View latest report
npm run test:report

# CI/CD (automatic on push)
# See .github/workflows/tests.yml
```

## 🏆 Goals Achieved

✅ **Zero Manual Testing** - All flows automated  
✅ **CI/CD Ready** - Run with one command  
✅ **Production Safe** - Test DB + simulation mode  
✅ **Comprehensive** - API + E2E + Integration + DB  
✅ **Fast Feedback** - Complete in <5 minutes  
✅ **Clear Reports** - HTML + JSON output  
✅ **Trust Production** - Deploy with confidence  

---

**"I deploy code → run one command → everything is tested automatically → I trust production"**
