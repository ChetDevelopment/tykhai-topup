$ErrorActionPreference = "Continue"

Write-Host "Simple API Test" -ForegroundColor Cyan

$body = '{"gameId":"cmonqi0c80001s4e2iioj1tah","productId":"cmonqi2rg000ds4e2wi6r7dj6","playerUid":"123456789","paymentMethod":"BAKONG","currency":"USD","customerEmail":"test@gmail.com"}'

try {
    $req = [System.Net.WebRequest]::Create("http://localhost:3000/api/orders")
    $req.Method = "POST"
    $req.ContentType = "application/json"
    
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $req.ContentLength = $bytes.Length
    
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    
    try {
        $resp = $req.GetResponse()
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $result = $reader.ReadToEnd()
        Write-Host "Status: OK" -ForegroundColor Green
        Write-Host "Response: $result"
    } catch {
        $resp = $_.Exception.Response
        if ($resp) {
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $result = $reader.ReadToEnd()
            Write-Host "Status: $($resp.StatusCode)" -ForegroundColor Red
            Write-Host "Response: $result" -ForegroundColor Yellow
        } else {
            Write-Host "No response: $($_.Exception.Message)"
        }
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}
