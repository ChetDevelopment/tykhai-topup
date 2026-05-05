# 🔐 Google Login Fix - Environment Variables Required

## Problem
Google login is not working because the Google OAuth credentials are missing in Vercel production environment.

---

## ✅ Solution: Add Environment Variables in Vercel Dashboard

### Step 1: Go to Vercel Dashboard
1. Visit: https://vercel.com/dashboard
2. Select your project: `tykhai-topup`
3. Go to **Settings** → **Environment Variables**

---

### Step 2: Add Google Credentials

#### Add GOOGLE_CLIENT_ID
- **Name:** `GOOGLE_CLIENT_ID`
- **Value:** (Get from Google Cloud Console)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development
- Click **Save**

#### Add GOOGLE_CLIENT_SECRET
- **Name:** `GOOGLE_CLIENT_SECRET`
- **Value:** (Get from Google Cloud Console)
- **Environments:** ✅ Production, ✅ Preview, ✅ Development
- Click **Save**

---

### Step 3: Verify NEXTAUTH_URL
Make sure this is set correctly:
- **Name:** `NEXTAUTH_URL`
- **Value:** `https://tykhai.vercel.app`
- **Environments:** ✅ Production

---

### Step 4: Redeploy
After adding the environment variables, trigger a new deployment:
1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click **"Redeploy"**

OR push a new commit to trigger automatic deployment.

---

## 🔍 How to Test Google Login

### Test Flow:
1. Go to: https://tykhai.vercel.app/login
2. Click **"Google"** button
3. You should be redirected to Google OAuth
4. Select your Google account
5. Should redirect back to the site and be logged in

### Expected Behavior:
✅ Google OAuth popup appears  
✅ Can select Google account  
✅ Redirects back to site after authentication  
✅ User is logged in  
✅ User session is created in database  

---

## 🚨 Troubleshooting

### Issue: "Redirect URI Mismatch" Error

**Cause:** Google OAuth redirect URI not configured correctly

**Solution:**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Select your OAuth 2.0 Client ID
3. Under **"Authorized redirect URIs"**, add:
   ```
   https://tykhai.vercel.app/api/auth/callback/google
   ```
4. Also add for local development:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
5. Click **Save**

---

### Issue: "Invalid Client" Error

**Cause:** GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is incorrect

**Solution:**
1. Verify the credentials in Vercel match your Google Cloud Console
2. Go to: https://console.cloud.google.com/apis/credentials
3. Copy the correct Client ID and Client Secret
4. Update in Vercel Environment Variables
5. Redeploy

---

### Issue: "This action could not be performed"

**Cause:** NEXTAUTH_URL doesn't match the domain

**Solution:**
1. Verify `NEXTAUTH_URL` is set to `https://tykhai.vercel.app`
2. Check that `PUBLIC_APP_URL` is also set correctly
3. Redeploy after making changes

---

### Issue: Google Login Works but User Not Created

**Cause:** NextAuth adapter not configured or database connection issue

**Check Logs:**
```bash
npx vercel logs --follow
```

Look for:
- `[next-auth]` errors
- Database connection errors
- User creation errors

---

## 📋 Environment Variables Summary

| Variable | Value | Required For |
|----------|-------|--------------|
| `GOOGLE_CLIENT_ID` | (From Google Cloud Console) | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | (From Google Cloud Console) | Google OAuth |
| `NEXTAUTH_URL` | `https://tykhai.vercel.app` | NextAuth callback |
| `NEXTAUTH_SECRET` | (already set) | Session encryption |

---

## 🔐 Google Cloud Console Configuration

### Required Settings:

**OAuth consent screen:**
- User Type: **External**
- Authorized domains: Add your domain

**OAuth 2.0 Client ID:**
- Application type: **Web application**
- Authorized JavaScript origins:
  - `https://tykhai.vercel.app`
  - `http://localhost:3000` (for dev)
- Authorized redirect URIs:
  - `https://tykhai.vercel.app/api/auth/callback/google`
  - `http://localhost:3000/api/auth/callback/google` (for dev)

---

## ✅ After Adding Variables

1. **Wait for redeployment** (2-3 minutes)
2. **Test Google login** on production
3. **Check logs** for any errors
4. **Verify user created** in database

---

## 📞 Quick Commands

### Check Environment Variables:
```bash
npx vercel env ls
```

### View Logs:
```bash
npx vercel logs --follow
```

### Filter for Auth Logs:
```bash
npx vercel logs --follow | Select-String "google|auth|nextauth"
```

---

**Status:** ⏳ WAITING FOR ENV VARIABLES  
**Next Step:** Add Google credentials in Vercel Dashboard  
**Time Required:** 2 minutes
