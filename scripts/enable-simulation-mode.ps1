# Quick Fix: Enable Simulation Mode in Production
# ================================================

Write-Host "=== Enabling Simulation Mode in Vercel Production ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will enable QR code generation without real Bakong credentials" -ForegroundColor Yellow
Write-Host ""

Write-Host "Current Status:" -ForegroundColor Green
npx vercel env ls 2>&1 | Select-String -Pattern "SIMULATION|BAKONG"

Write-Host ""
Write-Host "Note: You need to manually update PAYMENT_SIMULATION_MODE in Vercel Dashboard" -ForegroundColor Yellow
Write-Host ""
Write-Host "Steps:" -ForegroundColor Cyan
Write-Host "1. Go to: https://vercel.com/vichetsat-7762s-projects/tykhai-topup/settings/environment-variables"
Write-Host "2. Find PAYMENT_SIMULATION_MODE"
Write-Host "3. Click Edit"
Write-Host "4. Change value from 'false' to 'true'"
Write-Host "5. Save"
Write-Host "6. Redeploy"
Write-Host ""
Write-Host "OR run this command manually:" -ForegroundColor Yellow
Write-Host "npx vercel env rm PAYMENT_SIMULATION_MODE production"
Write-Host "npx vercel env add PAYMENT_SIMULATION_MODE true --environment production"
Write-Host ""
