# Test Provider API Connections Directly
# Run this script to test GameDrop and G2Bulk API connections

$ErrorActionPreference = "Continue"

Write-Host "=== Testing Provider API Connections ===" -ForegroundColor Cyan
Write-Host ""

# Load environment variables from .env file
$envFile = ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([A-Z_]+)=(.+)$') {
            $name = $matches[1]
            $value = $matches[2].Trim('"')
            Set-Item -Path "env:$name" -Value $value -Force
        }
    }
    Write-Host "Loaded environment from $envFile" -ForegroundColor Green
} else {
    Write-Host ".env file not found" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test GameDrop
$gameDropToken = $env:GAME_DROP_TOKEN
if ($gameDropToken) {
    Write-Host "Testing GameDrop API..." -ForegroundColor Cyan
    
    try {
        $headers = @{
            "Authorization" = $gameDropToken
        }
        
        $response = Invoke-WebRequest -Uri "https://partner.gamesdrop.io/api/v1/offers/balance" -Method Get -Headers $headers -UseBasicParsing
        
        Write-Host "  Status: $($response.StatusCode) $($response.StatusDescription)" -ForegroundColor Green
        
        $data = $response.Content | ConvertFrom-Json
        Write-Host "  Response:" -ForegroundColor Gray
        $data | ConvertTo-Json -Depth 5 | ForEach-Object { Write-Host "    $_" }
        
        if ($data.balance) {
            Write-Host "  Balance: $$($data.balance)" -ForegroundColor Green
        }
        
    } catch {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails) {
            Write-Host "  Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
        }
    }
    Write-Host ""
} else {
    Write-Host "Skipping GameDrop test - GAME_DROP_TOKEN not set" -ForegroundColor Yellow
    Write-Host ""
}

# Test G2Bulk
$g2bulkToken = $env:G2BULK_TOKEN
if ($g2bulkToken) {
    Write-Host "Testing G2Bulk API..." -ForegroundColor Cyan
    
    try {
        $headers = @{
            "X-API-Key" = $g2bulkToken
        }
        
        $response = Invoke-WebRequest -Uri "https://api.g2bulk.com/v1/getMe" -Method Get -Headers $headers -UseBasicParsing
        
        Write-Host "  Status: $($response.StatusCode) $($response.StatusDescription)" -ForegroundColor Green
        
        $data = $response.Content | ConvertFrom-Json
        Write-Host "  Response:" -ForegroundColor Gray
        $data | ConvertTo-Json -Depth 5 | ForEach-Object { Write-Host "    $_" }
        
        if ($data.success) {
            Write-Host "  Balance: $$($data.balance)" -ForegroundColor Green
            Write-Host "  User ID: $($data.user_id)" -ForegroundColor Green
            Write-Host "  Username: $($data.username)" -ForegroundColor Green
        } else {
            Write-Host "  API returned success=false" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails) {
            Write-Host "  Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
        }
    }
    Write-Host ""
} else {
    Write-Host "Skipping G2Bulk test - G2BULK_TOKEN not set" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
