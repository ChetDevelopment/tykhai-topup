$ErrorActionPreference = "Continue"

Write-Host "Testing Payment API with Debug" -ForegroundColor Cyan
Write-Host "================================`n"

$body = '{
    "gameId": "cmonqi0c80001s4e2iioj1tah",
    "productId": "cmonqi2rg000ds4e2wi6r7dj6",
    "playerUid": "123456789",
    "paymentMethod": "BAKONG",
    "currency": "USD",
    "customerEmail": "test@example.com",
    "customerName": "Test User"
}'

Write-Host "Request Body:"
Write-Host $body
Write-Host ""

try {
    $headers = @{
        "Content-Type" = "application/json"
        "Accept" = "application/json"
    }
    
    $params = @{
        Uri = "http://localhost:3000/api/orders"
        Method = "POST"
        Body = $body
        Headers = $headers
        UseBasicParsing = $true
        Verbose = $true
    }
    
    Write-Host "Sending request..."
    $response = Invoke-WebRequest @params
    
    Write-Host "`nStatus Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Content:"
    $json = $response.Content | ConvertFrom-Json
    $json | ConvertTo-Json -Depth 5
    
} catch {
    Write-Host "`nError occurred:" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)"
    Write-Host "Status: $($_.Exception.Response.StatusCode)"
    
    if ($_.ErrorDetails) {
        Write-Host "`nError Details:" -ForegroundColor Yellow
        Write-Host $_.ErrorDetails.Message
        
        try {
            $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
            Write-Host "`nParsed Error:"
            $errorJson | ConvertTo-Json -Depth 5
        } catch {
            # Not JSON
        }
    }
}
