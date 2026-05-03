$ErrorActionPreference = "Stop"

Write-Host "Testing Payment API..." -ForegroundColor Cyan

$body = '{
    "gameId": "cmonqi0c80001s4e2iioj1tah",
    "productId": "cmonqi2rg000ds4e2wi6r7dj6",
    "playerUid": "123456789",
    "paymentMethod": "BAKONG",
    "currency": "USD",
    "customerEmail": "test@example.com",
    "customerName": "Test User"
}'

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/orders" -Method POST -Body $body -ContentType "application/json"
    
    Write-Host "`nResponse:" -ForegroundColor Green
    Write-Host "Order Number: $($response.orderNumber)"
    Write-Host "Payment Ref: $($response.paymentRef)"
    
    if ($response.qr) {
        Write-Host "QR Code: $($response.qr.Length) characters" -ForegroundColor Green
        Write-Host "QR Preview: $($response.qr.Substring(0, 50))..."
    } else {
        Write-Host "QR Code: NULL!" -ForegroundColor Red
    }
    
    if ($response.md5Hash) {
        Write-Host "MD5 Hash: $($response.md5Hash.Length) characters" -ForegroundColor Green
    }
    
    Write-Host "`nFull Response:" -ForegroundColor Gray
    $response | ConvertTo-Json -Depth 5
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
}
