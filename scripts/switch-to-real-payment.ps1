# Switch to Real Bakong Payment Mode
# =====================================

Write-Host "=== Switching to Real Bakong Payment ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "CURRENT STATUS:" -ForegroundColor Yellow
$envFile = ".env"
if (Test-Path $envFile) {
    $bakongEnabled = Get-Content $envFile | Select-String "ENABLE_DEV_BAKONG" | Select-String "false"
    $bakongTokenSet = Get-Content $envFile | Select-String '^BAKONG_TOKEN=' | Select-String -NotMatch "PASTE_FROM"
    
    if ($bakongEnabled) {
        Write-Host "  - Simulation Mode: DISABLED (Real payments enabled)" -ForegroundColor Green
    } else {
        Write-Host "  - Simulation Mode: ENABLED (Test payments only)" -ForegroundColor Red
    }
    
    if ($bakongTokenSet) {
        Write-Host "  - Bakong Token: CONFIGURED" -ForegroundColor Green
    } else {
        Write-Host "  - Bakong Token: NOT CONFIGURED (Still using placeholder)" -ForegroundColor Red
    }
} else {
    Write-Host "  - .env file not found!" -ForegroundColor Red
}

Write-Host ""
Write-Host "TO ENABLE REAL BAKONG PAYMENTS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Get Bakong credentials from Vercel Production:" -ForegroundColor Yellow
Write-Host "   npx vercel env pull --environment production .env.production"
Write-Host ""
Write-Host "2. Copy these values from .env.production to .env:" -ForegroundColor Yellow
Write-Host "   - BAKONG_TOKEN"
Write-Host "   - BAKONG_ACCOUNT"
Write-Host "   - BAKONG_MERCHANT_NAME"
Write-Host "   - BAKONG_MERCHANT_CITY"
Write-Host ""
Write-Host "3. Set ENABLE_DEV_BAKONG=false in .env" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Restart the development server" -ForegroundColor Yellow
Write-Host ""

Write-Host "WARNING:" -ForegroundColor Red
Write-Host "  - Real Bakong payments will charge ACTUAL MONEY"
Write-Host "  - Test with small amounts first"
Write-Host "  - Make sure you have valid Bakong credentials"
Write-Host ""

Write-Host "=== End ===" -ForegroundColor Cyan
