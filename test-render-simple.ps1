# Simple Render Test
Write-Host "Testing Render Backend..." -ForegroundColor Cyan

$urls = @(
    "https://saas-backend-f40t.onrender.com",
    "https://franchise-backend-v915.onrender.com"
)

foreach ($url in $urls) {
    Write-Host "`nTesting: $url" -ForegroundColor Yellow
    try {
        $response = Invoke-RestMethod -Uri "$url/" -Method GET -TimeoutSec 10
        Write-Host "SUCCESS!" -ForegroundColor Green
        Write-Host ($response | ConvertTo-Json)
    }
    catch {
        Write-Host "FAILED: 404 or Connection Error" -ForegroundColor Red
    }
}

Write-Host "`n**ACTION REQUIRED**" -ForegroundColor Yellow
Write-Host "Check Render Dashboard Logs tab for errors" -ForegroundColor White
