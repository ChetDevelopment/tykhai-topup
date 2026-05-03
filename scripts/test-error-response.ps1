$ErrorActionPreference = "Continue"

Write-Host "API Test with Real Bakong Payment" -ForegroundColor Cyan

$body = '{"gameId":"cmonqi0c80001s4e2iioj1tah","productId":"cmonqi2rg000ds4e2wi6r7dj6","playerUid":"123456789","paymentMethod":"BAKONG","currency":"USD","customerEmail":"test@gmail.com"}'

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
    Write-Host "`nSUCCESS! Real Bakong QR Generated" -ForegroundColor Green
    Write-Host "================================`n"
    
    $json = $result | ConvertFrom-Json
    
    Write-Host "Order Number: $($json.orderNumber)"
    Write-Host "Payment Ref: $($json.paymentRef)"
    Write-Host "QR Code Length: $($json.qr.Length) characters"
    Write-Host "QR Preview: $($json.qr.Substring(0, 60))..."
    Write-Host "MD5 Hash: $($json.md5Hash)"
    Write-Host "Amount: $($json.amount) $($json.currency)"
    Write-Host "Instructions: $($json.instructions)"
    
    if ($json.paymentRef.StartsWith("SIM-")) {
        Write-Host "`nWARNING: Still using SIMULATION mode!" -ForegroundColor Yellow
        Write-Host "Check .env.local: PAYMENT_SIMULATION_MODE should be false"
    } else {
        Write-Host "`nREAL Bakong payment mode active!" -ForegroundColor Green
    }
    
} catch [System.Net.WebException] {
    $wr = $_.Exception
    Write-Host "`nHTTP Error: $($wr.Status)" -ForegroundColor Red
    
    if ($wr.Response) {
        $reader = New-Object System.IO.StreamReader($wr.Response.GetResponseStream())
        $result = $reader.ReadToEnd()
        Write-Host "Response Body:" -ForegroundColor Yellow
        Write-Host $result
    }
} catch {
    Write-Host "Other Error: $($_.Exception.Message)" -ForegroundColor Red
}
