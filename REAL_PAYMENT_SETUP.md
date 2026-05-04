# Switching to Real Bakong Payments

## ⚠️ IMPORTANT WARNING

**Real Bakong payments process ACTUAL MONEY transactions.** Only enable after:
- ✅ You have valid Bakong merchant credentials
- ✅ You've tested thoroughly in simulation mode
- ✅ You're ready to accept real payments

---

## Current Status

**Simulation Mode:** DISABLED ✅  
**Real Payments:** ENABLED (but needs credentials)

---

## Step 1: Get Bakong Credentials from Vercel

You need to pull the production environment variables from Vercel:

```bash
npx vercel env pull --environment production .env.production
```

This will create a `.env.production` file with all production secrets.

---

## Step 2: Copy Bakong Credentials

Open `.env.production` and copy these 4 values:

1. **BAKONG_TOKEN** - Your Bakong API authentication token
2. **BAKONG_ACCOUNT** - Your Bakong merchant account identifier  
3. **BAKONG_MERCHANT_NAME** - Your registered merchant business name
4. **BAKONG_MERCHANT_CITY** - Your business city (e.g., "Phnom Penh")

---

## Step 3: Update .env File

Open `.env` and replace the placeholder values:

```env
# Replace these lines:
BAKONG_TOKEN="PASTE_FROM_VERCEL_PRODUCTION_ENV"
BAKONG_ACCOUNT="PASTE_FROM_VERCEL_PRODUCTION_ENV"
BAKONG_MERCHANT_NAME="PASTE_FROM_VERCEL_PRODUCTION_ENV"

# With your real credentials:
BAKONG_TOKEN="your_actual_bakong_token_here"
BAKONG_ACCOUNT="your_actual_account_here"
BAKONG_MERCHANT_NAME="Your Actual Business Name"
```

---

## Step 4: Verify Configuration

The `.env` file should have these settings for **REAL** payments:

```env
ENABLE_DEV_BAKONG="false"
PAYMENT_SIMULATION_MODE="false"
```

For **TEST/SIMULATION** payments, use:

```env
ENABLE_DEV_BAKONG="true"
PAYMENT_SIMULATION_MODE="true"
```

---

## Step 5: Restart Development Server

After updating `.env`, restart your server:

```bash
# Stop current server (Ctrl+C)
# Then restart:
npm run dev
```

---

## Step 6: Test Real Payment

Create a small test order (e.g., $0.50 USD):

```bash
# Test with real payment
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "gameId": "YOUR_GAME_ID",
    "productId": "YOUR_PRODUCT_ID",
    "playerUid": "123456789",
    "paymentMethod": "BAKONG",
    "currency": "USD",
    "customerEmail": "test@example.com"
  }'
```

---

## How to Verify Real vs Simulation

### Simulation Mode Indicators:
- Payment reference starts with `SIM-`
- QR code contains test merchant data
- No actual money is transferred
- Instant payment confirmation

### Real Payment Indicators:
- Payment reference starts with `TY` (e.g., `TY1234567890`)
- QR code contains your real Bakong account
- **Actual money is transferred**
- Payment status checked against Bakong API

---

## Troubleshooting

### Error: "Bakong API error: 401"
**Cause:** Invalid or missing BAKONG_TOKEN  
**Solution:** Check token is correctly copied from Vercel

### Error: "Bakong configuration error"
**Cause:** Missing BAKONG_ACCOUNT or BAKONG_MERCHANT_NAME  
**Solution:** Ensure all 4 Bakong fields are set in `.env`

### QR Code is NULL
**Cause:** Simulation mode enabled but trying to use real payment  
**Solution:** Set `PAYMENT_SIMULATION_MODE="false"`

### Payment Always Shows "SIMULATION"
**Cause:** Simulation mode is still enabled  
**Solution:** Check both `ENABLE_DEV_BAKONG` and `PAYMENT_SIMULATION_MODE` are `"false"`

---

## Switching Back to Simulation Mode

To test without real money:

1. Open `.env`
2. Set:
   ```env
   ENABLE_DEV_BAKONG="true"
   PAYMENT_SIMULATION_MODE="true"
   ```
3. Restart server: `npm run dev`

---

## Security Best Practices

✅ **DO:**
- Keep `.env` file private (never commit to git)
- Use strong, unique Bakong tokens
- Test with small amounts first
- Monitor Bakong dashboard for transactions

❌ **DON'T:**
- Share Bakong credentials
- Commit `.env` to version control
- Use production credentials in public repositories
- Skip testing in simulation mode

---

## Files Modified

1. **`.env`** - Payment configuration
   - `ENABLE_DEV_BAKONG="false"` - Disables simulation
   - `PAYMENT_SIMULATION_MODE="false"` - Forces real payments

2. **`lib/payment.ts`** - Payment processing logic
   - Lines 44-46: Checks simulation mode
   - Lines 59-61: Routes to simulation or real payment
   - Lines 89-150: Real Bakong payment implementation

3. **`app/api/orders/route.ts`** - Order creation
   - Lines 39-41: Detects simulation mode
   - Lines 56-72: Skips maintenance check in simulation

---

## Next Steps

After enabling real payments:

1. ✅ Test with small amount ($0.50 - $1.00)
2. ✅ Verify QR code scans correctly in Bakong app
3. ✅ Confirm payment status updates after payment
4. ✅ Check order delivery completes successfully
5. ✅ Monitor Bakong dashboard for transaction

---

## Support

If you encounter issues:

1. Check server logs for error messages
2. Verify Bakong credentials are correct
3. Test Bakong API directly:
   ```bash
   curl -X POST https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5 \
     -H "Authorization: Bearer YOUR_BAKONG_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"md5": "test"}'
   ```
4. Contact Bakong support for API issues

---

**Status:** ✅ Ready to enable real payments (just add credentials)  
**Last Updated:** 2026-05-04
