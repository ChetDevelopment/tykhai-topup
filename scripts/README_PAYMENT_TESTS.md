# Payment QR Test Scripts

## Quick Test (PowerShell)

```powershell
npm run test:qr:quick
```

Or directly:
```powershell
.\scripts\test-qr-quick.ps1
```

## Full Test (TypeScript)

```powershell
npm run test:qr
```

Or directly:
```powershell
npx tsx scripts/test-payment-qr.ts
```

## Manual curl Test

```powershell
curl -X POST http://localhost:3000/api/orders ^
  -H "Content-Type: application/json" ^
  -d "{\"gameId\":\"ff-mobile\",\"productId\":\"5-usd\",\"playerUid\":\"123456789\",\"paymentMethod\":\"BAKONG\",\"currency\":\"USD\",\"customerEmail\":\"test@example.com\",\"customerName\":\"Test User\"}"
```

## Expected Output

✅ All tests should pass:
- Response time < 2000ms
- HTTP status 200
- QR code exists (150+ chars)
- QR format valid (starts with "000201")
- Order number exists
- Payment reference exists
- MD5 hash exists
- No 503 errors

## Troubleshooting

### Server Not Running
```powershell
npm run dev
```

### Wrong Game/Product IDs
Update test data in script to match your database:
- `gameId`: e.g., "ff-mobile", "genshin-impact"
- `productId`: e.g., "5-usd", "10-usd", "weekly-pass"

### Environment Variables
Ensure `.env.local` has:
```
PAYMENT_SIMULATION_MODE=true
ENABLE_DEV_BAKONG=true
BAKONG_ACCOUNT=vichet_sat@bkrt
```
