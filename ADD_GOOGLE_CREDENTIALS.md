# ⚡ QUICK: Add Google Login Credentials to Vercel

## Status: ❌ NOT YET ADDED

Google credentials are **missing** in Vercel production environment.

---

## 🎯 ACTION REQUIRED (2 Minutes)

### Step 1: Open Vercel Dashboard
**Click this link:** https://vercel.com/vichetsat-7762s-projects/tykhai-topup/settings/environment-variables

---

### Step 2: Add GOOGLE_CLIENT_ID

1. Click **"Add New"** button (top right)
2. Fill in:
   - **Name:** `GOOGLE_CLIENT_ID`
   - **Value:** (Copy from .env.local or Google Cloud Console)
   - **Environments:** ✅ Check **Production**, **Preview**, and **Development**
3. Click **"Save"**

---

### Step 3: Add GOOGLE_CLIENT_SECRET

1. Click **"Add New"** button again
2. Fill in:
   - **Name:** `GOOGLE_CLIENT_SECRET`
   - **Value:** (Copy from .env.local or Google Cloud Console)
   - **Environments:** ✅ Check **Production**, **Preview**, and **Development**
3. Click **"Save"**

---

### Step 4: Redeploy

1. Go to **Deployments** tab: https://vercel.com/vichetsat-7762s-projects/tykhai-topup/deployments
2. Find the latest deployment
3. Click the **three dots (⋮)** menu
4. Click **"Redeploy"**
5. Wait 2-3 minutes

---

## ✅ Test After Redeployment

1. Go to: https://tykhai.vercel.app/login
2. Click **"Google"** button
3. Should work! 🎉

---

## 📸 Visual Guide

```
Vercel Dashboard
  └─ Settings
      └─ Environment Variables
          └─ [Add New] ← Click this
              ├─ Name: GOOGLE_CLIENT_ID
              ├─ Value: 621578994388-...
              └─ Environments: [x] Production [x] Preview [x] Development
```

---

## ❓ Need Help?

**Problem:** Can't find the Add button  
**Solution:** Make sure you're logged in as the project owner

**Problem:** Deployment not updating  
**Solution:** Clear browser cache or use incognito mode

**Problem:** Still getting redirect error  
**Solution:** Add redirect URI in Google Cloud Console:
```
https://tykhai.vercel.app/api/auth/callback/google
```

---

**Time Required:** 2 minutes to add + 3 minutes to deploy = **5 minutes total**
