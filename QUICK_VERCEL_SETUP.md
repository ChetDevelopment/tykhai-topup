# 🚀 QUICK SETUP: Add Bakong Credentials to Vercel

## ⚠️ REQUIRED: Do This Now to Fix Production QR

Your code is deployed, but **production is missing Bakong credentials**. Follow these 5 minutes steps:

---

## Step-by-Step Guide

### Step 1: Open Vercel Dashboard
🔗 Click here: **https://vercel.com/dashboard**

### Step 2: Select Your Project
- Find and click: **tykhai-topup**
- Click **Settings** tab (top menu)
- Click **Environment Variables** (left sidebar)

### Step 3: Add 6 Environment Variables

Click **"New Variable"** button and add each one:

---

#### Variable 1: BAKONG_ACCOUNT
```
Name:  BAKONG_ACCOUNT
Value: vichet_sat@bkrt
```
✅ Check: **Production**  
❌ Uncheck: Development, Preview  
Click **Save**

---

#### Variable 2: BAKONG_MERCHANT_NAME
```
Name:  BAKONG_MERCHANT_NAME
Value: Ty Khai TopUp
```
✅ Check: **Production**  
❌ Uncheck: Development, Preview  
Click **Save**

---

#### Variable 3: BAKONG_MERCHANT_CITY
```
Name:  BAKONG_MERCHANT_CITY
Value: Phnom Penh
```
✅ Check: **Production**  
❌ Uncheck: Development, Preview  
Click **Save**

---

#### Variable 4: BAKONG_TOKEN (IMPORTANT!)
```
Name:  BAKONG_TOKEN
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY
```
✅ Check: **Production**  
❌ Uncheck: Development, Preview  
✅ Check: **Sensitive** (hides the value)  
Click **Save**

---

#### Variable 5: ENABLE_DEV_BAKONG
```
Name:  ENABLE_DEV_BAKONG
Value: false
```
✅ Check: **Production**  
❌ Uncheck: Development, Preview  
Click **Save**

---

#### Variable 6: PAYMENT_SIMULATION_MODE
```
Name:  PAYMENT_SIMULATION_MODE
Value: false
```
✅ Check: **Production**  
❌ Uncheck: Development, Preview  
Click **Save**

---

### Step 4: Redeploy to Apply Changes

After saving all 6 variables:

1. Click **Deployments** tab (top menu)
2. Find the latest deployment (should be at top)
3. Click the **three dots** (•••) on the right
4. Click **Redeploy**
5. Wait 2-3 minutes for build to complete

---

### Step 5: Test Production

After redeploy completes:

1. Visit: **https://tykhai-topup-ko74320zy-vichetsat-7762s-projects.vercel.app**
2. Create a test order ($0.50 USD)
3. **QR code should now appear!** ✅
4. Verify payment reference starts with `TY` (not `SIM`)

---

## ✅ Verification Checklist

After completing setup:

- [ ] All 6 variables added in Vercel Settings
- [ ] Redeploy triggered and completed
- [ ] Visited production URL
- [ ] QR code displays on checkout page
- [ ] Payment reference starts with `TY`
- [ ] Merchant name shows "Ty Khai TopUp"
- [ ] Tested with small amount ($0.50)

---

## 🆘 Troubleshooting

### QR Still Not Showing?

1. **Wait 2-3 minutes** after redeploy
2. **Hard refresh** browser: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
3. **Clear browser cache**
4. **Check variables are set:**
   - Go to Settings → Environment Variables
   - Verify all 6 show "●" for Production

### "Bakong Configuration Error"?

- Double-check `BAKONG_TOKEN` is copied correctly (no extra spaces)
- Verify all 4 Bakong variables are set
- Check deployment logs for errors

### Still Shows "SIMULATION"?

- Verify `ENABLE_DEV_BAKONG = false`
- Verify `PAYMENT_SIMULATION_MODE = false`
- Redeploy again

---

## 📞 Need Help?

1. Check deployment logs: https://vercel.com/dashboard → tykhai-topup → Deployments → Click latest
2. Review error messages in browser console (F12)
3. Contact Bakong support if API issues

---

**⏰ Time to complete:** ~5 minutes  
**⚠️ Important:** Production will process REAL MONEY after this setup!

**Good luck!** 🎉
