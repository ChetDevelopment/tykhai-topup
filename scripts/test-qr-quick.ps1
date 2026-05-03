# Payment QR Code Quick Test
# Run: .\scripts\test-qr-quick.ps1

$ErrorActionPreference = "Stop"

Write-Host "Payment QR Code Quick Test" -ForegroundColor Cyan
Write-Host "=================================================="

$baseUrl = "http://localhost:3000"
if ($env:NEXT_PUBLIC_APP_URL) {
    $baseUrl = $env:NEXT_PUBLIC_APP_URL
}
Write-Host "Base URL: $baseUrl"

$body = @"
{
    "gameId": "cmonqi0c80001s4e2iioj1tah",
    "productId": "cmonqi2rg000ds4e2wi6r7dj6",
    "playerUid": "123456789",
    "paymentMethod": "BAKONG",
    "currency": "USD",
    "customerEmail": "test@gmail.com",
    "customerName": "Test User"
}
"@

Write-Host "`nSending test request..."

try {
    $startTime = Get-Date
    $response = Invoke-WebRequest -Uri "$baseUrl/api/orders" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    $endTime = Get-Date
    $responseTime = ($endTime - $startTime).TotalMilliseconds
    
    Write-Host "Response Time: ${responseTime}ms" -ForegroundColor Green
    
    $json = $response.Content | ConvertFrom-Json
    
    Write-Host "`nResponse Validation:"
    
    $passed = $true
    
    if ($json.qr) {
        Write-Host "QR Code: $($json.qr.Length) chars" -ForegroundColor Green
        if ($json.qr.StartsWith("000201")) {
            Write-Host "QR Format: Valid KHQR" -ForegroundColor Green
        } else {
            Write-Host "QR Format: Invalid" -ForegroundColor Red
            $passed = $false
        }
    } else {
        Write-Host "QR Code: NULL OR MISSING" -ForegroundColor Red
        $passed = $false
    }
    
    if ($json.orderNumber) {
        Write-Host "Order Number: $($json.orderNumber)" -ForegroundColor Green
    } else {
        Write-Host "Order Number: Missing" -ForegroundColor Red
        $passed = $false
    }
    
    if ($json.paymentRef) {
        Write-Host "Payment Ref: $($json.paymentRef)" -ForegroundColor Green
    } else {
        Write-Host "Payment Ref: Missing" -ForegroundColor Red
        $passed = $false
    }
    
    if ($json.md5Hash) {
        Write-Host "MD5 Hash: $($json.md5Hash.Length) chars" -ForegroundColor Green
    } else {
        Write-Host "MD5 Hash: Missing" -ForegroundColor Red
        $passed = $false
    }
    
    if ($response.StatusCode -eq 200) {
        Write-Host "HTTP Status: 200 OK" -ForegroundColor Green
    } else {
        Write-Host "HTTP Status: $($response.StatusCode)" -ForegroundColor Red
        $passed = $false
    }
    
    if ($response.StatusCode -eq 503) {
        Write-Host "ERROR: 503 Service Unavailable" -ForegroundColor Red
    }
    
    Write-Host "`n=================================================="
    
    if ($passed) {
        Write-Host "ALL TESTS PASSED - Payment QR is working!" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "TESTS FAILED - Check errors above" -ForegroundColor Red
        exit 1
    }
    
} catch {
    $msg = $_.Exception.Message
    Write-Host "Request Failed: $msg" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
    exit 1
}
