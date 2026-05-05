# ✅ Google Login Account Linking - FIXED

## Problem

Google login was working, but after logging in, users weren't being properly linked to their accounts. The session wasn't persisting correctly.

---

## Root Cause

The `getCurrentUser()` function wasn't properly handling NextAuth session users. It was:
1. Trying to find users by ID from NextAuth session
2. But NextAuth creates users via email primarily
3. The session callbacks weren't persisting user data correctly

---

## ✅ Fixes Applied

### 1. Improved `getCurrentUser()` Function

**Changes:**
- Now prioritizes **email lookup** for NextAuth users
- Added `accounts` relation to check linked OAuth providers
- Better handling of NextAuth JWT sessions

```typescript
// Find user by email (works for NextAuth users)
const user = await prisma.user.findFirst({
  where: {
    email: email || undefined
  },
  select: { 
    id: true, 
    email: true, 
    name: true, 
    role: true, 
    vipRank: true, 
    pointsBalance: true, 
    walletBalance: true,
    accounts: {
      select: {
        provider: true,
        providerAccountId: true
      }
    }
  }
});
```

---

### 2. Enhanced NextAuth Configuration

**Added:**
- **Session maxAge**: 30 days (was using default)
- **JWT callback**: Persists access token and provider
- **Session callback**: Includes provider info in session
- **signIn callback**: Ensures user exists in database
- **Events**: Logs user creation and account linking

```typescript
callbacks: {
  async jwt({ token, user, account }) {
    if (user) {
      token.id = user.id;
      token.email = user.email;
    }
    // Persist OAuth token
    if (account) {
      token.accessToken = account.access_token;
      token.provider = account.provider;
    }
    return token;
  },
  async session({ session, token }) {
    if (session.user) {
      (session.user as any).id = token.id;
      session.user.email = token.email as string;
      (session.user as any).accessToken = token.accessToken;
      (session.user as any).provider = token.provider;
    }
    return session;
  },
  async signIn({ user, account }) {
    if (account?.provider === "google") {
      // Ensure user exists
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email! },
      });
      
      if (!existingUser) {
        await prisma.user.create({
          data: {
            email: user.email!,
            name: user.name || "",
            role: "USER",
          },
        });
      }
    }
    return true;
  },
}
```

---

## 🧪 How to Test

### Test 1: New User (First Time Google Login)

1. Go to: https://tykhai.vercel.app/login
2. Click **"Google"** button
3. Select Google account
4. **Expected:**
   - ✅ Redirects to homepage
   - ✅ User is logged in
   - ✅ Click on account icon → Shows dashboard
   - ✅ Email matches Google account

### Test 2: Returning User (Second Login)

1. Log out (if logged in)
2. Click **"Google"** button again
3. Select same Google account
4. **Expected:**
   - ✅ Logs in with existing account (not creating new one)
   - ✅ Same user ID as before
   - ✅ Points balance preserved
   - ✅ Wallet balance preserved

### Test 3: Check Database

After logging in, check the database:

```sql
-- Check user
SELECT id, email, name, "pointsBalance", "walletBalance" 
FROM "User" 
WHERE email = 'your-google-email@gmail.com';

-- Check linked account
SELECT "userId", provider, "providerAccountId" 
FROM "Account" 
WHERE provider = 'google';
```

**Expected:**
- ✅ 1 user record with your email
- ✅ 1 account record linked to that user with provider='google'

---

## 📊 What Changed

| Component | Before | After |
|-----------|--------|-------|
| User Lookup | By ID (broken) | By email (works) |
| Session Duration | Default | 30 days |
| JWT Token | Basic | Includes provider & token |
| User Creation | Adapter only | Adapter + signIn callback |
| Debugging | None | Events logging |

---

## 🔍 Debugging

### Check Logs

```bash
npx vercel logs --follow
```

Look for:
```
[NextAuth] User created: { id: "...", email: "...", name: "..." }
[NextAuth] Account linked: { userId: "...", provider: "google", ... }
```

### Check Session

In browser console after login:
```javascript
// Check if session exists
fetch('/api/auth/session')
  .then(r => r.json())
  .then(session => console.log(session));
```

**Expected Response:**
```json
{
  "user": {
    "name": "Your Name",
    "email": "your@gmail.com",
    "id": "user-id-from-db"
  },
  "expires": "2026-06-04T..."
}
```

---

## ✅ Expected Behavior After Fix

### Login Flow:
```
1. Click "Google" button
   ↓
2. Google OAuth popup
   ↓
3. Select Google account
   ↓
4. NextAuth creates/updates user in database
   ↓
5. Links Google Account to User
   ↓
6. Creates JWT session (30 days)
   ↓
7. Redirects to homepage (logged in)
   ↓
8. Click account icon → Dashboard shows user data ✅
```

### Account Linking:
```
First Login:
- User created in "User" table
- Account created in "Account" table
- Linked: User.id = Account.userId

Second Login:
- Finds existing User by email
- Uses existing Account
- No duplicate user created ✅
```

---

## 🚨 Troubleshooting

### Issue: Still Not Logging In

**Check:**
1. Google credentials in Vercel:
   ```bash
   npx vercel env ls | Select-String "GOOGLE"
   ```
2. Should see:
   - GOOGLE_CLIENT_ID ✅
   - GOOGLE_CLIENT_SECRET ✅

**Solution:**
- Verify credentials match Google Cloud Console
- Check redirect URI: `https://tykhai.vercel.app/api/auth/callback/google`

---

### Issue: "User not found" Error

**Cause:** User doesn't exist in database

**Solution:**
The `signIn` callback should create the user automatically. Check logs:
```bash
npx vercel logs | Select-String "NextAuth"
```

---

### Issue: Creates Duplicate Users

**Cause:** Email mismatch or account not linking properly

**Solution:**
Check database for duplicate users:
```sql
SELECT email, COUNT(*) as count
FROM "User"
GROUP BY email
HAVING COUNT(*) > 1;
```

If duplicates exist, manually merge or delete duplicates.

---

## 📝 Files Changed

| File | Changes |
|------|---------|
| `lib/auth.ts` | Enhanced getCurrentUser(), NextAuth config, callbacks, events |

---

## ✅ Status

**Fixed:** ✅ Google login now properly links to user accounts  
**Deployed:** ✅ https://tykhai-topup-r738sbqnv-vichetsat-7762s-projects.vercel.app  
**Session Duration:** 30 days  
**Auto Account Creation:** ✅ Yes  
**Auto Account Linking:** ✅ Yes  

---

**Test it now:** https://tykhai.vercel.app/login → Click "Google" button! 🎉
