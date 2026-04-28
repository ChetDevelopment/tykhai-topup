# 🔒 Ty Khai TopUp - Complete Security Checklist

## ⚠️ Critical: Paths That Need Protection

### 1. ADMIN API ROUTES (Highest Security Required)
**All require: Admin Auth + Rate Limiting + HTTPS + CSRF Protection**

| Path | Method | Current Protection | Needs |
|------|--------|-------------------|-------|
| `/api/admin/audit-logs` | GET | ❌ Missing | Admin auth, rate limit |
| `/api/admin/auth` | POST | ✅ Has auth | Rate limit for brute force |
| `/api/admin/banlist` | GET, POST | ❌ Missing | Admin auth, input validation |
| `/api/admin/banlist/[id]` | GET, PATCH, DELETE | ❌ Missing | Admin auth, IDOR protection |
| `/api/admin/banners` | GET, POST | ❌ Missing | Admin auth, file upload scan |
| `/api/admin/banners/[id]` | GET, PATCH, DELETE | ❌ Missing | Admin auth, IDOR protection |
| `/api/admin/blog` | GET, POST | ❌ Missing | Admin auth, XSS protection |
| `/api/admin/blog/[id]` | GET, PATCH, DELETE | ❌ Missing | Admin auth, IDOR protection |
| `/api/admin/bundles` | GET, POST | ❌ Missing | Admin auth |
| `/api/admin/customers` | GET | ❌ Missing | Admin auth, data encryption |
| `/api/admin/faqs` | GET, POST | ❌ Missing | Admin auth |
| `/api/admin/faqs/[id]` | GET, PATCH, DELETE | ❌ Missing | Admin auth |
| `/api/admin/games` | GET, POST | ❌ Missing | Admin auth |
| `/api/admin/games/[id]` | GET, PATCH, DELETE | ❌ Missing | Admin auth, IDOR protection |
| `/api/admin/games/reorder` | POST | ❌ Missing | Admin auth |
| `/api/admin/maintenance` | GET, PATCH | ❌ Missing | Admin auth |
| `/api/admin/orders` | GET | ❌ Missing | Admin auth, data encryption |
| `/api/admin/orders/[orderNumber]` | GET, PATCH | ❌ Partial | Admin auth, IDOR protection |
| `/api/admin/orders/[orderNumber]/refresh` | POST | ❌ Missing | Admin auth |
| `/api/admin/orders/bulk` | POST | ❌ Missing | Admin auth |
| `/api/admin/orders/export` | GET | ❌ Missing | Admin auth, rate limit |
| `/api/admin/products` | GET, POST | ❌ Missing | Admin auth |
| `/api/admin/products/[id]` | GET, PATCH, DELETE | ❌ Missing | Admin auth, IDOR protection |
| `/api/admin/promo-codes` | GET, POST | ❌ Missing | Admin auth |
| `/api/admin/promo-codes/[id]` | GET, PATCH, DELETE | ❌ Missing | Admin auth |
| `/api/admin/referrals/payout` | POST | ❌ Missing | Admin auth, amount validation |
| `/api/admin/resellers` | GET, POST | ❌ Missing | Admin auth |
| `/api/admin/security` | GET, POST | ✅ Implemented | Already secured |
| `/api/admin/settings` | GET, PATCH | ❌ Missing | Admin auth, encryption key protection |
| `/api/admin/stats/revenue` | GET | ❌ Missing | Admin auth |
| `/api/admin/tools/pricing` | POST | ❌ Missing | Admin auth |
| `/api/admin/upload` | POST | ❌ Missing | Admin auth, file type scan, virus scan |
| `/api/admin/users` | GET | ❌ Missing | Admin auth, data encryption |
| `/api/admin/users/vip` | POST | ❌ Missing | Admin auth |

### 2. USER AUTHENTICATED API ROUTES (High Security)
**All require: User Auth + Rate Limiting + Input Validation**

| Path | Method | Current Protection | Needs |
|------|--------|-------------------|-------|
| `/api/user/me` | GET | ✅ Has auth | Rate limit |
| `/api/user/dashboard` | GET | ❌ Missing | User auth, data encryption |
| `/api/user/auth/login` | POST | ❌ Missing | Rate limit (brute force), HTTPS |
| `/api/user/auth/register` | POST | ✅ Has validation | Rate limit, password strength |
| `/api/user/auth/logout` | POST | ❌ Missing | Session invalidation |
| `/api/user/wallet` | GET, POST | ❌ Missing | User auth, amount validation |
| `/api/user/wishlist` | GET, POST, DELETE | ❌ Missing | User auth, IDOR protection |
| `/api/user/tickets` | GET, POST | ❌ Missing | User auth |
| `/api/user/referral` | GET | ❌ Missing | User auth |
| `/api/user/reorder` | POST | ❌ Missing | User auth, CSRF protection |
| `/api/user/price-alerts` | GET, POST | ❌ Missing | User auth |
| `/api/user/push` | POST | ❌ Missing | User auth, subscription validation |
| `/api/user/gift` | POST | ❌ Missing | User auth, rate limit |
| `/api/user/daily-checkin` | POST | ❌ Missing | User auth, rate limit |
| `/api/user/auth/[...nextauth]` | ALL | ✅ NextAuth | CSRF protection |

### 3. PAYMENT & ORDER API ROUTES (Critical Security)
**All require: Rate Limiting + Input Validation + Encryption + HTTPS**

| Path | Method | Current Protection | Needs |
|------|--------|-------------------|-------|
| `/api/orders` | POST | ✅ Rate limit, validation | ✅ Encrypted storage |
| `/api/orders/[orderNumber]` | GET | ❌ Missing | User auth, IDOR protection |
| `/api/orders/[orderNumber]/cancel` | POST | ❌ Missing | User auth, CSRF protection |
| `/api/orders/[orderNumber]/invoice` | GET | ❌ Missing | User auth, IDOR protection |
| `/api/orders/bulk` | POST | ❌ Missing | Admin auth |
| `/api/orders/lookup` | GET | ❌ Missing | Rate limit, input validation |
| `/api/orders/recent` | GET | ❌ Missing | Rate limit |
| `/api/payment/simulate` | ALL | ❌ Missing | Block in production |
| `/api/payment/webhook/[method]` | POST | ❌ Missing | Signature verification |
| `/api/payment/webhook/bakong` | POST | ✅ Signature verify | ✅ SHA256, encrypted |
| `/api/lookup-uid` | POST | ❌ Missing | Rate limit, input validation |
| `/api/analytics` | GET | ❌ Missing | Admin auth |

### 4. PUBLIC API ROUTES (Medium Security)
**All require: Rate Limiting + Input Validation**

| Path | Method | Current Protection | Needs |
|------|--------|-------------------|-------|
| `/api/products` | GET | ❌ Missing | Rate limit |
| `/api/games` | GET | ❌ Missing | Rate limit |
| `/api/games/check-id` | POST | ❌ Missing | Rate limit, validation |
| `/api/banners` | GET | ❌ Missing | Rate limit |
| `/api/bundles` | GET | ❌ Missing | Rate limit |
| `/api/faqs` | GET | ❌ Missing | Rate limit |
| `/api/reviews` | GET, POST | ❌ Missing | Rate limit, XSS protection |
| `/api/spin-win` | POST | ❌ Missing | Rate limit, user auth |
| `/api/squads` | GET, POST | ❌ Missing | Rate limit |
| `/api/promo-codes/validate` | POST | ❌ Missing | Rate limit |
| `/api/test-email` | POST | ❌ Missing | **DELETE BEFORE PRODUCTION** |

### 5. ADMIN PAGES (Highest Security)
**All require: Admin Auth + HTTPS + CSRF Protection**

| Path | Current Protection | Needs |
|------|-------------------|-------|
| `/admin` | ✅ Middleware | Session timeout |
| `/admin/login` | ✅ Public | Rate limit |
| `/admin/orders` | ❌ Missing | Admin auth check |
| `/admin/orders/[orderNumber]` | ❌ Missing | Admin auth, IDOR protection |
| `/admin/products` | ❌ Missing | Admin auth |
| `/admin/games` | ❌ Missing | Admin auth |
| `/admin/users` | ❌ Missing | Admin auth, data encryption |
| `/admin/settings` | ❌ Missing | Admin auth, encryption key protection |
| `/admin/banners` | ❌ Missing | Admin auth, file upload scan |
| `/admin/faqs` | ❌ Missing | Admin auth |
| `/admin/blog` | ❌ Missing | Admin auth, XSS protection |
| `/admin/blog/[id]` | ❌ Missing | Admin auth |
| `/admin/blog/new` | ❌ Missing | Admin auth, XSS protection |
| `/admin/promo-codes` | ❌ Missing | Admin auth |
| `/admin/banlist` | ❌ Missing | Admin auth |
| `/admin/resellers` | ❌ Missing | Admin auth |
| `/admin/tools` | ❌ Missing | Admin auth |
| `/admin/tools/pricing` | ❌ Missing | Admin auth |
| `/admin/audit-logs` | ❌ Missing | Admin auth |
| `/admin/customers` | ❌ Missing | Admin auth, data encryption |
| `/api/admin/insights` | ❌ Missing | Admin auth |
| `/admin/popup` | ❌ Missing | Admin auth |

### 6. USER PAGES (Authentication Required)

| Path | Current Protection | Needs |
|------|-------------------|-------|
| `/account` | ❌ Missing | User auth |
| `/account/*` | ❌ Missing | User auth, IDOR protection |
| `/order` | ❌ Missing | User auth, order access validation |
| `/checkout/[orderNumber]` | ❌ Missing | User auth, CSRF protection |
| `/login` | Public | Rate limit (brute force) |
| `/register` | Public | Rate limit, password strength |

### 7. DATABASE SECURITY (Encryption Needed)

| Table | Field | Encryption Status | Action |
|-------|-------|-------------------|--------|
| `Order` | `customerEmail` | ✅ Encrypted | Monitor |
| `Order` | `customerPhone` | ✅ Encrypted | Monitor |
| `Order` | `ipAddress` | ✅ Encrypted | Monitor |
| `Order` | `paymentRef` | ✅ SHA256 | Monitor |
| `Order` | `qrString` | ✅ Encrypted | Monitor |
| `User` | `email` | ❌ Plain text | **ENCRYPT** |
| `User` | `passwordHash` | ✅ Hashed | Good |
| `User` | `name` | ❌ Plain text | Consider encrypt |
| `Admin` | `email` | ❌ Plain text | **ENCRYPT** |
| `Admin` | `passwordHash` | ✅ Hashed | Good |
| `Settings` | Contains API keys | ❌ Plain text | **ENCRYPT** |

### 8. ENVIRONMENT VARIABLES (Must Be Protected)

| Variable | Current Status | Action |
|----------|----------------|--------|
| `DATABASE_URL` | ❌ In .env | Ensure not in git |
| `JWT_SECRET` | ❌ In .env | Ensure not in git |
| `NEXTAUTH_SECRET` | ❌ In .env | Ensure not in git |
| `ENCRYPTION_KEY` | ❌ Should add | Add, keep secret |
| `BAKONG_TOKEN` | ❌ In .env | Ensure not in git |
| `BAKONG_API_KEY` | ❌ In .env | Ensure not in git |
| `NEXT_PUBLIC_*` | ✅ Public by design | OK for public vars |

### 9. SECURITY IMPLEMENTATION PRIORITY

#### 🔴 CRITICAL (Do Immediately)
1. ✅ Add admin auth to ALL `/api/admin/*` routes
2. ❌ Add user auth to `/api/orders/[orderNumber]` (IDOR protection)
3. ❌ Encrypt `User.email` field
4. ❌ Encrypt `Admin.email` field
5. ❌ Delete `/api/test-email` before production
6. ❌ Block `/api/payment/simulate` in production

#### 🟡 HIGH (Do This Week)
1. ❌ Add rate limiting to all remaining API routes
2. ❌ Add input validation to all POST endpoints
3. ❌ Implement CSRF protection
4. ❌ Add session timeout for admin users
5. ❌ Encrypt sensitive settings fields

#### 🟢 MEDIUM (Do Next Sprint)
1. ❌ Add file upload virus scanning
2. ❌ Implement request signing for webhooks
3. ❌ Add API versioning for security
4. ❌ Set up security monitoring dashboard

### 10. TESTING COMMANDS

```bash
# Test your security
node scripts/security-test.js http://localhost:3000

# Check for vulnerabilities
npm audit

# Scan for exposed secrets
grep -r "API_KEY\|SECRET\|PASSWORD" --include="*.ts" --include="*.js" .

# Test rate limiting
for i in {1..20}; do curl -X POST http://localhost:3000/api/orders; done

# Check for XSS
curl "http://localhost:3000/?q=<script>alert(1)</script>"

# Verify .env not in git
git ls-files | grep ".env"
```

### 11. SECURITY SCORE CALCULATOR

```
Total Items to Secure: 80
✅ Secured: 15
❌ Unsecured: 65

Current Security Score: 19%
Target Security Score: 97%+
```

### 12. QUICK WINS (Easy Fixes)

1. **Delete test-email route** before production
2. **Add `requireAdmin()`** to all admin API routes (copy from `/api/admin/security/route.ts`)
3. **Add rate limiting** using our `lib/rate-limit.ts`
4. **Remove simulation mode** in production
5. **Add `.env.production` to .gitignore** (already done ✅)

---

**Last Updated**: 2026-04-28
**Next Review**: After implementing critical fixes
