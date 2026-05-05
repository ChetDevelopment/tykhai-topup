# 🔐 Vercel Environment Variables Setup

## Required Actions

Your code has been pushed to GitHub. Vercel will automatically deploy the changes.

**However, you need to manually set these environment variables in Vercel:**

---

## 📋 Environment Variables to Add/Update

### 1. Add NEW Variables:

| Variable Name | Value | Environments |
|--------------|-------|--------------|
| `BAKONG_API_BASE` | `https://merchant-qr.bakong.org.kh` | Production |
| `CRON_SECRET` | `tykhai_cron_9x7K2mP4nQ8vL5wR3jT6hY1bN0cF` | Production |

### 2. Update EXISTING Variables:

| Variable Name | New Value | Environments |
|--------------|-----------|--------------|
| `PUBLIC_APP_URL` | `https://tykhai.vercel.app` | Production |
| `PAYMENT_SIMULATION_MODE` | `false` | Production |
| `ENABLE_DEV_BAKONG` | `false` | Production |

---

## 🛠️ How to Set Environment Variables in Vercel

### Method 1: Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/dashboard

2. **Select Your Project:**
   - Click on `tykhai-topup`

3. **Navigate to Settings:**
   - Click on "Settings" tab
   - Click on "Environment Variables" in left sidebar

4. **Add New Variables:**
   - Click "Add New"
   - Enter variable name and value
   - Select "Production" environment
   - Click "Save"

5. **Update Existing Variables:**
   - Find the variable in the list
   - Click on it
   - Edit the value
   - Click "Save"

### Method 2: Vercel CLI (Alternative)

```bash
# Login to Vercel first
npx vercel login

# Add variables (you'll be prompted for values)
npx vercel env add BAKONG_API_BASE
# Enter: https://merchant-qr.bakong.org.kh
# Select: Production

npx vercel env add CRON_SECRET
# Enter: tykhai_cron_9x7K2mP4nQ8vL5wR3jT6hY1bN0cF
# Select: Production

npx vercel env set PUBLIC_APP_URL
# Enter: https://tykhai.vercel.app
# Select: Production

npx vercel env set PAYMENT_SIMULATION_MODE
# Enter: false
# Select: Production

npx vercel env set ENABLE_DEV_BAKONG
# Enter: false
# Select: Production
```

---

## ✅ After Setting Variables

1. **Redeploy to apply changes:**
   ```bash
   npx vercel --prod
   ```

2. **Wait for deployment to complete** (2-3 minutes)

3. **Test the payment flow:**
   - Visit: https://tykhai.vercel.app
   - Create a test order
   - Scan QR with ABA/ACLEDA/Wing app
   - Complete payment
   - Verify order status updates automatically

---

## 🧪 Verification Steps

### 1. Check Deployment Status
```bash
npx vercel ls
```

### 2. View Logs
```bash
npx vercel logs --follow
```

Look for these log tags:
- `[Bakong]` - QR generation
- `[Bakong Check]` - Payment verification
- `[webhook]` - Webhook received
- `[Payment Status]` - Frontend polling
- `[cron/reconcile-payments]` - Cron job running

### 3. Test Webhook Endpoint
```bash
curl -X POST https://tykhai.vercel.app/api/payment/webhook/bakong \
  -H "Content-Type: application/json" \
  -d '{"md5":"test"}'
```
Expected: 400 error (endpoint is reachable)

### 4. Test Cron Endpoint
```bash
curl -X POST https://tykhai.vercel.app/api/cron/reconcile-payments \
  -H "Authorization: Bearer tykhai_cron_9x7K2mP4nQ8vL5wR3jT6hY1bN0cF"
```
Expected: 200 OK with results

---

## ⚠️ Important Notes

1. **CRON_SECRET**: The value I provided is for demonstration. For better security, generate your own:
   ```bash
   # Generate random secret
   openssl rand -hex 32
   ```

2. **Environment Scope**: Make sure to set variables for **Production** environment only (unless you want them in Preview/Development too)

3. **Deployment Required**: Environment variable changes require a new deployment to take effect

4. **Bakong Webhook Secret**: You may need to update `BAKONG_WEBHOOK_SECRET` to match what's configured in your Bakong merchant dashboard

---

## 🎯 Expected Behavior After Setup

✅ Real Bakong QR codes generated (not simulation)  
✅ Payments detected via webhook within 1-2 seconds  
✅ Payments detected via polling within 5-10 seconds  
✅ Cron reconciliation runs every minute as safety net  
✅ Auto-delivery triggered immediately after payment  
✅ No manual intervention required  

---

**Next Step:** Go to Vercel Dashboard and set the environment variables now!
