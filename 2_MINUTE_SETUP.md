# 🚀 2-MINUTE SETUP - Production Environment Variables

## Your Project Info:
- **Project ID:** `prj_mwTuBSL9imTc1rfI3gh7WxR8YWLl`
- **Team ID:** `team_5KdKvZ5Adbx4XT3heWjm74oM`
- **Production URL:** https://tykhai-topup-ko74320zy-vichetsat-7762s-projects.vercel.app

---

## ⚡ FASTEST METHOD (Direct Links)

### Step 1: Open Environment Variables Page
🔗 **Click here:** https://vercel.com/vichetsat-7762s-projects/tykhai-topup/settings/environment-variables

### Step 2: Click "New Variable" 6 Times

For each variable, copy and paste:

---

**Variable 1:**
- Name: `BAKONG_ACCOUNT`
- Value: `vichet_sat@bkrt`
- ✅ Production only
- Save

**Variable 2:**
- Name: `BAKONG_MERCHANT_NAME`
- Value: `Ty Khai TopUp`
- ✅ Production only
- Save

**Variable 3:**
- Name: `BAKONG_MERCHANT_CITY`
- Value: `Phnom Penh`
- ✅ Production only
- Save

**Variable 4:**
- Name: `BAKONG_TOKEN`
- Value: Copy entire line below (starts with `eyJhbGci...`):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY
```
- ✅ Production only
- ✅ Mark as **Sensitive**
- Save

**Variable 5:**
- Name: `ENABLE_DEV_BAKONG`
- Value: `false`
- ✅ Production only
- Save

**Variable 6:**
- Name: `PAYMENT_SIMULATION_MODE`
- Value: `false`
- ✅ Production only
- Save

---

### Step 3: Redeploy

🔗 **Go to Deployments:** https://vercel.com/vichetsat-7762s-projects/tykhai-topup/deployments

1. Find latest deployment (top of list)
2. Click **three dots** (•••)
3. Click **Redeploy**
4. Wait 2-3 minutes

---

### Step 4: Test

🔗 **Visit Production:** https://tykhai-topup-ko74320zy-vichetsat-7762s-projects.vercel.app

1. Create $0.50 order
2. QR code should appear ✅
3. Payment reference starts with `TY` ✅

---

## ✅ DONE!

**Total time:** ~2 minutes  
**Result:** Production QR codes working with real Bakong payments

---

## 🆘 If Stuck

**Problem:** Can't find environment variables page?  
**Solution:** Dashboard → tykhai-topup → Settings → Environment Variables

**Problem:** QR still not showing?  
**Solution:** Wait 3 minutes after redeploy, then hard refresh (Ctrl+Shift+R)

**Problem:** Need help?  
**Solution:** Check `SETUP_COMPLETE.md` for troubleshooting

---

**You got this! Just 6 copy-paste operations and you're live!** 🎉
