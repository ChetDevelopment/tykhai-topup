# Set Bakong Credentials in Vercel Production - MANUAL GUIDE

## ⚠️ IMPORTANT: Production QR Not Showing Fix

Your production environment is missing Bakong credentials. Follow these steps:

---

## Option 1: Via Vercel Dashboard (RECOMMENDED - Easiest)

### Step 1: Go to Vercel Dashboard
1. Visit: https://vercel.com/dashboard
2. Select your project: **tykhai-topup**
3. Go to **Settings** → **Environment Variables**

### Step 2: Add These 6 Variables

Click "Add New Variable" for each:

| Name | Value | Environment |
|------|-------|-------------|
| `BAKONG_ACCOUNT` | `vichet_sat@bkrt` | ✅ Production |
| `BAKONG_MERCHANT_NAME` | `Ty Khai TopUp` | ✅ Production |
| `BAKONG_MERCHANT_CITY` | `Phnom Penh` | ✅ Production |
| `BAKONG_TOKEN` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY` | ✅ Production (Sensitive) |
| `ENABLE_DEV_BAKONG` | `false` | ✅ Production |
| `PAYMENT_SIMULATION_MODE` | `false` | ✅ Production |

### Step 3: Save and Deploy
1. Click **Save** after adding all variables
2. Go to **Deployments**
3. Click **Redeploy** on the latest production deployment
4. Wait for deployment to complete (~2-3 minutes)

---

## Option 2: Via Vercel CLI

### Step 1: Login to Vercel
```bash
npx vercel login
```

### Step 2: Link Your Project
```bash
npx vercel link
```

### Step 3: Add Each Variable Manually

```bash
# Add BAKONG_ACCOUNT
npx vercel env add BAKONG_ACCOUNT vichet_sat@bkrt

# Add BAKONG_MERCHANT_NAME
npx vercel env add BAKONG_MERCHANT_NAME "Ty Khai TopUp"

# Add BAKONG_MERCHANT_CITY
npx vercel env add BAKONG_MERCHANT_CITY "Phnom Penh"

# Add BAKONG_TOKEN (will be hidden)
npx vercel env add BAKONG_TOKEN "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY"

# Add ENABLE_DEV_BAKONG
npx vercel env add ENABLE_DEV_BAKONG false

# Add PAYMENT_SIMULATION_MODE
npx vercel env add PAYMENT_SIMULATION_MODE false
```

**When prompted for environment, select:**
- ✅ Production
- ❌ Not Development
- ❌ Not Preview

### Step 4: Deploy to Production
```bash
npx vercel --prod
```

---

## Verify It Worked

### 1. Check Environment Variables
```bash
npx vercel env ls
```

You should see all 6 Bakong variables listed.

### 2. Test Production

1. Visit your production URL
2. Create a small test order ($0.50 USD)
3. **Check QR code appears**
4. **Verify payment reference starts with `TY`** (not `SIM`)

### 3. Check Production Logs
```bash
npx vercel logs --follow
```

Look for:
- ✅ No "Bakong configuration error"
- ✅ "QR generation successful" messages
- ✅ Payment references starting with `TY`

---

## Expected QR Code Format

After fixing, your QR code should contain:

```
00020101021229370016A0000006230101110113vichet_sat@bkrt52045999530384054050.505802KH5915Ty Khai TopUp6010Phnom Penh62070503***6304XXXX
```

Key indicators:
- ✅ `vichet_sat@bkrt` - Your account
- ✅ `Ty Khai TopUp` - Your merchant name
- ✅ `Phnom Penh` - Your city
- ✅ Real amount (e.g., `0.50` for 50 cents)

---

## Troubleshooting

### QR Still Not Showing

1. **Wait for deployment to complete** (2-3 minutes)
2. **Hard refresh** browser (Ctrl+Shift+R)
3. **Clear browser cache**
4. **Check Vercel logs** for errors

### "Bakong configuration error"

- Double-check all 4 Bakong variables are set
- Verify `BAKONG_TOKEN` is correctly copied (no extra spaces)
- Check token hasn't expired

### Payment Reference Shows "SIM-"

- Simulation mode is still enabled
- Check `ENABLE_DEV_BAKONG=false` in Vercel
- Check `PAYMENT_SIMULATION_MODE=false` in Vercel
- Redeploy after changing

---

## Quick Checklist

Before testing production:

- [ ] All 6 environment variables added in Vercel
- [ ] Production deployment completed
- [ ] Tested with small amount ($0.50)
- [ ] QR code displays correctly
- [ ] Payment reference starts with `TY` (not `SIM`)
- [ ] Merchant name shows "Ty Khai TopUp"
- [ ] Bakong dashboard shows transaction

---

## Need Help?

1. Check `PRODUCTION_QR_FIX.md` for detailed troubleshooting
2. Review Vercel logs: `npx vercel logs`
3. Test Bakong API directly with your token
4. Contact Bakong support if API issues

---

**⚠️ WARNING**: After fixing, production will process **REAL MONEY** transactions!

**Status:** ⚠️ Manual action required - Add env vars in Vercel dashboard  
**Last Updated:** 2026-05-04
