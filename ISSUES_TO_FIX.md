# 🔧 Critical Issues to Fix

## Issue 1: Payment API Returning 404 ❌

**Problem:** `/api/payment/status` returns 404 Not Found

**Test:**
```bash
curl -I "https://tykhai.vercel.app/api/payment/status?orderNumber=TEST"
# Returns: HTTP/1.1 404 Not Found
```

**Possible Causes:**
1. Route file not built correctly
2. Middleware blocking the route
3. Route export incorrect

**Files to Check:**
- `app/api/payment/status/route.ts`
- `app/api/orders/[orderNumber]/verify/route.ts`
- `app/api/payment/webhook/bakong/route.ts`

---

## Issue 2: Menu Items Not Working ❌

### Whales (Leaderboard)
- **Route:** `/leaderboard`
- **Status:** Exists in Header nav
- **Issue:** Need to check if page exists and loads

### Daily Mission
- **Route:** `/daily-mission`
- **Page:** `app/daily-mission/page.tsx` ✅ Exists
- **Issue:** DailyCheckin component might not be working

### Refer & Earn
- **Route:** `/refer-and-earn`
- **Page:** `app/refer-and-earn/page.tsx` ✅ Exists
- **Issue:** ReferralCard component might not be working

---

## Action Plan

### Priority 1: Fix Payment Verification API

1. Check if payment route files exist
2. Verify route exports (GET/POST)
3. Check Vercel build logs for route errors
4. Add error logging to payment routes
5. Test each endpoint individually

### Priority 2: Fix Menu Items

1. Test `/leaderboard` page
2. Check DailyCheckin component API calls
3. Check ReferralCard component API calls
4. Verify `/api/user/daily-checkin` endpoint
5. Verify `/api/user/referral` endpoint

### Priority 3: Fix Google Auth Error

From logs:
```
error λ POST /api/auth/signin/google 200 (node:10)…
info λ GET /api/auth/error 302 (no messa…
```

1. Check Google OAuth configuration
2. Verify redirect URIs in Google Cloud Console
3. Check NEXTAUTH_URL matches production domain

---

## Testing Checklist

### Payment Flow
- [ ] Create order → `/api/orders` (POST)
- [ ] Check payment status → `/api/payment/status` (GET)
- [ ] Verify payment → `/api/orders/[orderNumber]/verify` (POST)
- [ ] Webhook receives → `/api/payment/webhook/bakong` (POST)
- [ ] Download invoice → `/api/orders/[orderNumber]/invoice` (GET)

### User Features
- [ ] User dashboard → `/api/user/dashboard` (GET)
- [ ] User profile → `/api/user/me` (GET)
- [ ] Daily check-in → `/api/user/daily-checkin` (POST)
- [ ] Referral info → `/api/user/referral` (GET)
- [ ] Leaderboard → `/api/leaderboard` (GET) - IF EXISTS

---

## Immediate Next Steps

1. **Check if payment routes exist in build output**
2. **Add console.log to payment routes for debugging**
3. **Deploy with verbose logging**
4. **Test each API endpoint individually**
5. **Check Vercel Function logs for errors**

---

**Status:** 🔴 CRITICAL - Payment verification not working
**Date:** May 5, 2026
**Priority:** Payment API > Menu Items > Google Auth
