# ABA PayWay Integration - Setup Guide

## ✅ What's Been Updated

### 1. **Payment Types** (`lib/payment-types.ts`)
- ✅ Added `ABA` to `PaymentMethod` type
- ✅ Added `ABA` to `PAYMENT_PROVIDERS` configuration
- ✅ Updated `CreateOrderSchema` to accept `"ABA"` as valid payment method

### 2. **TopUpForm Component** (`components/TopUpForm.tsx`)
- ✅ ABA payment option with logo visible
- ✅ Can select ABA as payment method
- ✅ Properly sends `paymentMethod: "ABA"` to API

### 3. **Orders API** (`app/api/orders/route.ts`)
- ✅ Routes ABA payments to correct webhook endpoint
- ✅ Uses `/api/payment/webhook/aba` for ABA callbacks

### 4. **ABA PayWay Integration** (`lib/aba-payway.ts`)
- ✅ `initiateABAPayment()` - Creates payment with ABA PayWay
- ✅ `checkABAPayment()` - Verifies payment status
- ✅ `verifyABAWebhookSignature()` - Validates webhook signatures

### 5. **ABA Webhook Handler** (`app/api/payment/webhook/aba/route.ts`)
- ✅ Receives payment notifications from ABA
- ✅ Marks orders as PAID
- ✅ Triggers delivery queue

### 6. **Environment Configuration** (`.env.example`)
- ✅ Added ABA credentials template

---

## 🔧 Configuration Required

### Step 1: Get ABA PayWay Credentials

1. **Register** at [ABA PayWay Developer Portal](https://developer.payway.com.kh/)
2. **Create a merchant account**
3. **Get your credentials:**
   - `ABA_MERCHANT_ID`
   - `ABA_SECRET_KEY`
   - `ABA_PUBLIC_KEY`

### Step 2: Update `.env.local`

Add these lines to your `.env.local` file:

```env
# ABA PayWay Configuration
ABA_PAYWAY_API="https://checkout.payway.com.kh"
ABA_MERCHANT_ID="your_merchant_id_here"
ABA_SECRET_KEY="your_secret_key_here"
ABA_PUBLIC_KEY="your_public_key_here"

# IMPORTANT: Update PUBLIC_APP_URL for webhooks to work
# For local dev, use ngrok or cloudflared:
# cloudflared tunnel --url http://localhost:3000
PUBLIC_APP_URL="https://your-domain.com"
```

### Step 3: Configure Webhook URL in ABA Dashboard

In your ABA PayWay merchant dashboard, set the webhook URL to:

```
https://your-domain.com/api/payment/webhook/aba
```

**For local development:**
1. Use [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/run-tunnel/)
2. Example: `https://abc123.ngrok.io/api/payment/webhook/aba`
3. Update `PUBLIC_APP_URL` in `.env.local`

---

## 🧪 Testing ABA Payment

### Test Flow

1. **Start your development server:**
   ```bash
   npm run dev
   ```

2. **Select a game and product**

3. **Enter UID and server**

4. **Choose "ABA PayWay" payment option**
   - ✅ ABA logo should be visible
   - ✅ Green border when selected
   - ✅ "SECURE" badge shown

5. **Click "Pay Now"**
   - Order created with `paymentMethod: "ABA"`
   - Redirected to checkout page
   - ABA PayWay payment page loads

6. **Complete payment** (or use simulation mode)

### Simulation Mode (Recommended for Testing)

Enable simulation mode to test without real payments:

```env
# In .env.local
PAYMENT_SIMULATION_MODE="true"
```

This will:
- Generate test QR codes
- Auto-complete payments after 3 seconds
- No real money transactions

---

## 📋 API Endpoints

### Create Order
```
POST /api/orders
Body: {
  "gameId": "...",
  "productId": "...",
  "playerUid": "...",
  "serverId": "...",
  "paymentMethod": "ABA",  // ← ABA payment
  "currency": "USD"
}
```

### ABA Webhook
```
POST /api/payment/webhook/aba
Headers: {
  "x-aba-signature": "..."
}
Body: {
  "reference_id": "ABA1234567890",
  "transaction_id": "TXN123",
  "status": "success",
  "amount": "10.00",
  "currency": "USD",
  "paid_at": "2024-01-01T12:00:00Z"
}
```

---

## 🔍 Debugging

### Check Logs

```bash
# Watch for ABA-related logs
npm run dev

# Look for:
# [ABA] Initiating payment...
# [ABA Webhook] Received webhook
# [ABA Webhook] Order marked as PAID
```

### Common Issues

**1. "ABA PayWay not configured" error**
- ✅ Check `.env.local` has `ABA_MERCHANT_ID` and `ABA_SECRET_KEY`
- ✅ Restart dev server after adding env vars

**2. Webhook not received**
- ✅ Verify `PUBLIC_APP_URL` is correct
- ✅ Ensure webhook URL is publicly accessible (not localhost)
- ✅ Check ABA dashboard webhook configuration

**3. Payment page doesn't load**
- ✅ Check browser console for errors
- ✅ Verify order was created successfully
- ✅ Check `paymentRef` is stored in database

---

## 🎯 Feature Checklist

| Feature | Status |
|---------|--------|
| ✅ ABA payment option shows up | **DONE** |
| ✅ ABA logo visible | **DONE** |
| ✅ Can select ABA | **DONE** |
| ✅ Payment page loads | **DONE** |
| ✅ Webhook handler | **DONE** |
| ✅ API integration | **DONE** |

---

## 🚀 Next Steps

1. **Get ABA credentials** from developer.payway.com.kh
2. **Add credentials to `.env.local`**
3. **Configure webhook URL** in ABA dashboard
4. **Test with simulation mode** enabled
5. **Test with real payment** (small amount)
6. **Monitor logs** for any issues

---

## 📞 Support

- **ABA PayWay Docs:** https://developer.payway.com.kh/
- **ABA Support:** support@payway.com.kh
- **Your Dev Team:** Check project issues/PRs

---

## 🔐 Security Notes

- ✅ Webhook signature verification implemented
- ✅ Idempotency protection (duplicate payments handled)
- ✅ Payment amount validation
- ✅ Order status guards (no double-processing)
- ✅ Encrypted QR storage in database

---

**Ready to go! Just add your ABA credentials and test.** 🎉
