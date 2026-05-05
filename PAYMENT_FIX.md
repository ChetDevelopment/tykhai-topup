# Payment Troubleshooting Guide

## ⚠️ ISSUE: Both BAKONG and ABA Payments Not Working

### Root Cause
When **simulation mode is OFF** (`PAYMENT_SIMULATION_MODE=false`), the system requires:
- ✅ **BAKONG**: Full credentials (Account, Merchant Name, Token)
- ✅ **ABA**: Full credentials (Merchant ID, Secret Key, Public Key)

If credentials are missing, payment initiation **fails immediately**.

---

## ✅ SOLUTION: Enable Simulation Mode (For Testing)

I've already updated your `.env.local` to enable simulation mode.

### What Changed:
```env
PAYMENT_SIMULATION_MODE=true
ENABLE_DEV_BAKONG=true
```

### What This Does:
- ✅ Generates test QR codes instantly
- ✅ Auto-completes payments after 3 seconds
- ✅ No real money transactions
- ✅ Works WITHOUT Bakong/ABA credentials
- ✅ Perfect for development/testing

---

## 🧪 How to Test

### Step 1: Restart Dev Server
```bash
# Stop current server (Ctrl+C)
npm run dev
```

### Step 2: Test Payment Flow

1. **Open your website**
2. **Go to any game** (e.g., Mobile Legends)
3. **Select a product**
4. **Enter UID** (e.g., `12345678`)
5. **Choose payment method:**
   - ✅ KHQR · Bakong Payment (logo shows)
   - ✅ ABA PayWay (logo shows)
6. **Click "Pay Now"**
7. **Checkout page loads** with QR code
8. **Wait 3 seconds** (simulation auto-completes)
9. **Payment success!** 🎉

---

## 🔍 Debug: Check Browser Console

If payments still don't work:

1. **Open browser DevTools** (F12)
2. **Go to Console tab**
3. **Look for errors** when clicking "Pay Now"

Common errors:
- `Payment method not configured` → Check .env.local
- `Invalid payment method` → Check form is sending correct value
- `Network error` → Check API is running

---

## 🔍 Debug: Check Server Logs

In your terminal where `npm run dev` is running, look for:

```
[Orders] Initiating payment for order: TY...
[Orders] Simulation mode: true
[Orders] Payment method: BAKONG
[payment] Simulation mode QR generated: { ... }
```

If you see errors instead, share them!

---

## 🚀 Production Mode (Real Payments)

When ready for real payments:

### 1. Update .env.local:
```env
PAYMENT_SIMULATION_MODE=false
ENABLE_DEV_BAKONG=false

# Bakong credentials (you already have these)
BAKONG_ACCOUNT=your_account@bkrt
BAKONG_MERCHANT_NAME=Your Company
BAKONG_TOKEN=your_token_here

# ABA credentials (get from ABA PayWay)
ABA_MERCHANT_ID=your_merchant_id
ABA_SECRET_KEY=your_secret_key
ABA_PUBLIC_KEY=your_public_key
```

### 2. Configure Webhooks:
- **Bakong**: Already configured
- **ABA**: Set webhook URL in ABA dashboard to:
  ```
  https://your-domain.com/api/payment/webhook/aba
  ```

### 3. Test with small amount first!

---

## 📋 Quick Checklist

| Check | Status |
|-------|--------|
| ✅ Simulation mode enabled | DONE |
| ✅ ABA logo shows | DONE |
| ✅ Bakong logo shows | DONE |
| ✅ Can select payment methods | DONE |
| ⏳ Restart dev server | TODO |
| ⏳ Test payment flow | TODO |

---

## 🆘 Still Not Working?

1. **Stop dev server** (Ctrl+C)
2. **Clear Next.js cache:**
   ```bash
   Remove-Item -Recurse -Force .next
   ```
3. **Restart:**
   ```bash
   npm run dev
   ```
4. **Hard refresh browser:** Ctrl+Shift+R

If still broken, share:
- Browser console errors (F12 → Console)
- Server terminal errors
- What step fails exactly

---

**Ready to test! Just restart your dev server.** 🚀
