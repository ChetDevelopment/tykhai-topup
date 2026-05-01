# Bakong KHQR Payment System - Deployment Checklist

## Environment Variables (✅ Already Set)
```
BAKONG_TOKEN=your_token
BAKONG_ACCOUNT=your_merchant_account
BAKONG_MERCHANT_NAME=Ty Khai TopUp
BAKONG_MERCHANT_CITY=Phnom Penh
BAKONG_WEBHOOK_SECRET=your_webhook_secret
GAME_DROP_TOKEN=your_gamedrop_token
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

## Pre-Deployment Checklist

### 1. Database Migration
```bash
npx prisma db push
```
This adds the `gameDropOfferId` field to Product model.

### 2. Set GameDrop Offer IDs (CRITICAL!)
For each product in your database, you need to set the `gameDropOfferId`. 

**Option A: Via Admin Panel**
1. Go to `/admin/products`
2. Edit each product
3. Add the numeric Offer ID from GameDrop

**Option B: Via Prisma Studio**
```bash
npx prisma studio
```
Then manually update each Product's `gameDropOfferId` field.

**Option C: Via SQL (if you have the mappings)**
```sql
UPDATE "Product" SET "gameDropOfferId" = 1001 WHERE id = 'product-uuid-1';
UPDATE "Product" SET "gameDropOfferId" = 1002 WHERE id = 'product-uuid-2';
-- etc.
```

### 3. Verify Bakong Configuration
Test the Bakong connection:
```bash
curl -X POST https://your-app.vercel.app/api/payment/simulate \
  -H "Content-Type: application/json" \
  -d '{"order":"TEST-001","ref":"TESTREF","method":"BAKONG"}'
```

### 4. Test GameDrop Connection
```bash
curl -X POST https://your-app.vercel.app/api/admin/gamedrop/test \
  -H "Content-Type: application/json"
```

### 5. Deploy to Vercel
```bash
git add .
git commit -m "feat: fully automated Bakong KHQR payment system

- Add gameDropOfferId to Product model
- Remove unused payment methods (TrueMoney, Wing, Bank, USDT)
- Fix Free Fire API endpoint (FreeFire_Global)
- Add database indexes for performance
- Optimize API caching (ISR with 60s revalidation)
- Fix UID lookup for all games
- Auto-delivery via GameDrop after payment
- Real-time payment detection (3s polling)
- QR code expires after 5 minutes"
git push origin main
```

## Post-Deployment Testing

### Test 1: Create Order & Generate QR
1. Go to `https://your-app.vercel.app/games/free-fire`
2. Enter UID: `1792184701`
3. Select a package
4. Click "Initialize Payment"
5. Verify: QR code displays with exact amount

### Test 2: Payment Detection
1. Scan QR with Bakong app
2. Pay exact amount
3. Verify: Page auto-detects payment (within 3-5 seconds)
4. Verify: Order status → PROCESSING → DELIVERED

### Test 3: Auto-Delivery
1. After payment, check GameDrop delivery
2. Verify: Product delivered within 30 seconds
3. Check: Order status = DELIVERED in database

### Test 4: Timeout & Expiration
1. Generate QR code
2. Wait 5+ minutes without paying
3. Verify: Order shows "Signal Lost" message
4. Verify: Order can be re-initiated

### Test 5: Security
1. Try to change amount manually (should be locked)
2. Try duplicate payment (should be idempotent)
3. Try invalid QR (should show error)

## Monitoring

### Check Background Worker Logs
```bash
vercel logs --follow
```
Look for:
- `[worker] Payment check completed`
- `[delivery] Order XXX delivered successfully`
- `[bakong] Payment verified for order XXX`
```

### Check Failed Deliveries
```bash
# In Prisma Studio
# Filter Order where status = "PROCESSING" or "FAILED"
```

## Rollback Plan
If anything goes wrong:
```bash
# Revert commit
git revert HEAD
git push origin main

# Or rollback database
npx prisma migrate resolve --rolled-back 202xxxxx
```

## Support
- Bakong API Docs: https://bakong.nbc.gov.kh/
- GameDrop API: https://partner.gamedrop.io/docs
- Next.js Deployment: https://nextjs.org/docs/deployment

---

**Status: ✅ Ready for Production**

All code changes complete. Database schema updated. Payment system fully automated.
Just need to set `gameDropOfferId` for each product and deploy!
