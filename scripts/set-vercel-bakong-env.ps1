# Set Bakong Credentials in Vercel Production
# =============================================

Write-Host "=== Setting Bakong Credentials in Vercel Production ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "This script will set your Bakong credentials in Vercel Production environment." -ForegroundColor Yellow
Write-Host ""
Write-Host "Credentials to set:" -ForegroundColor Cyan
Write-Host "  - BAKONG_TOKEN"
Write-Host "  - BAKONG_ACCOUNT"
Write-Host "  - BAKONG_MERCHANT_NAME"
Write-Host "  - BAKONG_MERCHANT_CITY"
Write-Host ""

# Your Bakong credentials
$BAKONG_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiZjhkNzdjOTQ0NTExNDUwYSJ9LCJpYXQiOjE3NzY3NTQ1MzYsImV4cCI6MTc4NDUzMDUzNn0.MXQLXOROy9aykrpQ-D__RRDNaAtylhGW9z-JZMXk7YY"
$BAKONG_ACCOUNT = "vichet_sat@bkrt"
$BAKONG_MERCHANT_NAME = "Ty Khai TopUp"
$BAKONG_MERCHANT_CITY = "Phnom Penh"

Write-Host "Step 1: Set BAKONG_ACCOUNT" -ForegroundColor Green
npx vercel env add BAKONG_ACCOUNT "$BAKONG_ACCOUNT" --environment production

Write-Host ""
Write-Host "Step 2: Set BAKONG_MERCHANT_NAME" -ForegroundColor Green
npx vercel env add BAKONG_MERCHANT_NAME "$BAKONG_MERCHANT_NAME" --environment production

Write-Host ""
Write-Host "Step 3: Set BAKONG_MERCHANT_CITY" -ForegroundColor Green
npx vercel env add BAKONG_MERCHANT_CITY "$BAKONG_MERCHANT_CITY" --environment production

Write-Host ""
Write-Host "Step 4: Set BAKONG_TOKEN (secret)" -ForegroundColor Green
npx vercel env add BAKONG_TOKEN "$BAKONG_TOKEN" --environment production --sensitive

Write-Host ""
Write-Host "Step 5: Set ENABLE_DEV_BAKONG=false (disable simulation in production)" -ForegroundColor Green
npx vercel env add ENABLE_DEV_BAKONG "false" --environment production

Write-Host ""
Write-Host "Step 6: Set PAYMENT_SIMULATION_MODE=false" -ForegroundColor Green
npx vercel env add PAYMENT_SIMULATION_MODE "false" --environment production

Write-Host ""
Write-Host "=== All credentials set! ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "IMPORTANT: Deploy your changes to production:" -ForegroundColor Yellow
Write-Host "  npx vercel --prod"
Write-Host ""
Write-Host "After deployment, test a real payment to verify QR codes are generated." -ForegroundColor Yellow
