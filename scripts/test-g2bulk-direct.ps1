$ErrorActionPreference = "Continue"

Write-Host "Testing G2Bulk API..." -ForegroundColor Cyan

$token = "07fffdc4807e96f07736ef0c9f40954bcff0ae96ed84d9cf0f8ba6869231f9b2"

try {
    $headers = @{
        "X-API-Key" = $token
    }
    
    $response = Invoke-RestMethod -Uri "https://api.g2bulk.com/v1/getMe" -Headers $headers -Method Get
    
    Write-Host "Status: Success" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Gray
    $response | ConvertTo-Json -Depth 5
    
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    }
}
