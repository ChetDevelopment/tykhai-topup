# Fix: QR Code Not Showing in Production

## Problem

- ✅ **Local**: Working but in simulation mode
- ❌ **Production**: QR code not showing for payments

## Root Cause

1. **Production environment variables not set** - Vercel production doesn't have Bakong credentials
2. **Code defaulted to simulation mode** - Line 46 in `lib/payment.ts` was defaulting to `true` for safety

## Fixes Applied

### 1. Fixed Payment Mode Detection (`lib/payment.ts`)

**Before:**
```typescript
const SIM_MODE = process.env.PAYMENT_SIMULATION_MODE !== "false"; // Default to true
```

**After:**
```typescript
const SIM_MODE = process.env.PAYMENT_SIMULATION_MODE === "true" || process.env.ENABLE_DEV_BAKONG === "true";
```

Now production defaults to **REAL** payments unless explicitly set to simulation.

### 2. Updated Local Configuration (`.env`)

Your real Bakong credentials are now in `.env`:
- ✅ BAKONG_TOKEN - Your JWT token
- ✅ BAKONG_ACCOUNT - vichet_sat@bkrt
- ✅ BAKONG_MERCHANT_NAME - Ty Khai TopUp
- ✅ BAKONG_MERCHANT_CITY - Phnom Penh

---

## Steps to Fix Production

### Step 1: Set Environment Variables in Vercel

Run this PowerShell script:

```powershell
.\scripts\set-vercel-bakong-env.ps1
```

This will set all 6 required environment variables in Vercel Production:
- `BAKONG_TOKEN` (sensitive)
- `BAKONG_ACCOUNT`
- `BAKONG_MERCHANT_NAME`
- `BAKONG_MERCHANT_CITY`
- `ENABLE_DEV_BAKONG=false`
- `PAYMENT_SIMULATION_MODE=false`

### Step 2: Deploy to Production

```bash
npx vercel --prod
```

### Step 3: Verify in Production

After deployment:

1. Go to your production URL
2. Create a test order ($0.50 USD)
3. Check that QR code is displayed
4. Verify QR code contains your merchant name "Ty Khai TopUp"

---

## Verify QR Code is Real

### Real Bakong QR Code Contains:
- ✅ Your account: `vichet_sat@bkrt`
- ✅ Merchant name: `Ty Khai TopUp`
- ✅ City: `Phnom Penh`
- ✅ Real amount in USD or KHR
- ✅ Payment reference starting with `TY` (not `SIM`)

### Simulation QR Code Contains:
- ⚠️ Test merchant data
- ⚠️ Payment reference starting with `SIM`
- ⚠️ Instructions say "[SIMULATION]"

---

## Test Local Real Payments

Your local environment is now configured for real payments:

```bash
npm run dev
```

Create a test order and verify:
1. QR code displays
2. Payment reference starts with `TY` (not `SIM`)
3. Merchant name shows "Ty Khai TopUp"

**⚠️ WARNING**: This will charge **REAL MONEY** to the Bakong account!

---

## Switch Back to Simulation (For Testing)

If you want to test without real money:

**In `.env`:**
```env
ENABLE_DEV_BAKONG="true"
PAYMENT_SIMULATION_MODE="true"
```

**In Vercel Production** (run script again with `true` values):
```powershell
npx vercel env add ENABLE_DEV_BAKONG "true" --environment production
npx vercel env add PAYMENT_SIMULATION_MODE "true" --environment production
npx vercel --prod
```

---

## Troubleshooting

### QR Still Not Showing in Production

1. **Check environment variables are set:**
   ```bash
   npx vercel env ls
   ```
   Should show all 6 Bakong variables for production

2. **Check deployment succeeded:**
   ```bash
   npx vercel ls
   ```
   Verify latest deployment is active

3. **Check production logs:**
   ```bash
   npx vercel logs
   ```
   Look for payment-related errors

4. **Verify code was deployed:**
   Check `lib/payment.ts` line 46 shows the fixed code

### QR Shows But Payment Fails

1. **Check Bakong token is valid:**
   - Token might have expired
   - Contact Bakong support for new token

2. **Check Bakong account is active:**
   - Verify `vichet_sat@bkrt` is active
   - Check Bakong dashboard

3. **Check API connectivity:**
   ```bash
   curl -X POST https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5 \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"md5": "test"}'
   ```

### Local Shows Simulation Mode

1. **Check `.env` file:**
   ```env
   ENABLE_DEV_BAKONG="false"
   PAYMENT_SIMULATION_MODE="false"
   ```

2. **Restart server:**
   ```bash
   # Stop (Ctrl+C)
   npm run dev
   ```

3. **Clear Next.js cache:**
   ```bash
   rm -rf .next
   npm run dev
   ```

---

## Environment Variables Summary

| Variable | Local | Production | Purpose |
|----------|-------|------------|---------|
| `BAKONG_TOKEN` | ✅ Set | ⚠️ **Run script** | API authentication |
| `BAKONG_ACCOUNT` | ✅ Set | ⚠️ **Run script** | Your Bakong account |
| `BAKONG_MERCHANT_NAME` | ✅ Set | ⚠️ **Run script** | Business name |
| `BAKONG_MERCHANT_CITY` | ✅ Set | ⚠️ **Run script** | Business city |
| `ENABLE_DEV_BAKONG` | `false` | ⚠️ **Run script** | Disable simulation |
| `PAYMENT_SIMULATION_MODE` | `false` | ⚠️ **Run script** | Disable simulation |

---

## Files Modified

1. **`lib/payment.ts`** (Line 44-50)
   - Changed default from simulation to production mode
   - Removed fallback test values

2. **`.env`**
   - Added your real Bakong credentials

3. **`scripts/set-vercel-bakong-env.ps1`** (NEW)
   - Automated script to set Vercel production env vars

---

## Next Steps

1. ✅ **Run the Vercel script** to set production credentials
2. ✅ **Deploy to production** (`npx vercel --prod`)
3. ✅ **Test with small amount** ($0.50 USD)
4. ✅ **Verify QR code** shows real merchant data
5. ✅ **Monitor Bakong dashboard** for transactions

---

## Security Notes

✅ **DO:**
- Keep Bakong token secret
- Use environment variables (never hardcode)
- Test with small amounts first
- Monitor transactions regularly

❌ **DON'T:**
- Commit `.env` to git
- Share Bakong token publicly
- Skip testing before going live
- Ignore failed transactions

---

**Status:** ✅ Local fixed, ⚠️ Production needs env vars  
**Last Updated:** 2026-05-04
