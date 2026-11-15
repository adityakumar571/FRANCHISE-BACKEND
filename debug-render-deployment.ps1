# Debug Render Deployment Issues

Write-Host "`n====== RENDER DEPLOYMENT DEBUG ======`n" -ForegroundColor Cyan

$baseUrls = @(
    "https://saas-backend-f40t.onrender.com",
    "https://franchise-backend-v915.onrender.com",
    "https://api.schoolcloudx.com"
)

$endpoints = @("/", "/api", "/api/health", "/api/mainUser/login")

foreach ($baseUrl in $baseUrls) {
    Write-Host "`n🔍 Testing: $baseUrl" -ForegroundColor Yellow
    Write-Host ("=" * 60) -ForegroundColor Gray
    
    foreach ($endpoint in $endpoints) {
        $url = "$baseUrl$endpoint"
        Write-Host "  $endpoint ... " -NoNewline
        
        try {
            if ($endpoint -eq "/api/mainUser/login") {
                $body = '{"userId":"superadmin","password":"SuperAdmin@123"}'
                $response = Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Body $body -TimeoutSec 5 -ErrorAction Stop
            } else {
                $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 5 -ErrorAction Stop
            }
            
            $statusCode = $response.StatusCode
            if ($statusCode -eq 200) {
                Write-Host "✅ $statusCode" -ForegroundColor Green
                if ($endpoint -eq "/" -or $endpoint -eq "/api/health") {
                    $content = $response.Content | ConvertFrom-Json
                    Write-Host "      Message: $($content.message)" -ForegroundColor Gray
                }
            } else {
                Write-Host "⚠️ $statusCode" -ForegroundColor Yellow
            }
        }
        catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            if ($statusCode) {
                Write-Host "❌ $statusCode" -ForegroundColor Red
            } else {
                Write-Host "❌ Connection Error" -ForegroundColor Red
            }
        }
    }
}

Write-Host "`n====== INSTRUCTIONS ======" -ForegroundColor Cyan
Write-Host "If all URLs show 404:" -ForegroundColor Yellow
Write-Host "  1. Open Render Dashboard: https://dashboard.render.com" -ForegroundColor White
Write-Host "  2. Go to Logs tab - check for errors" -ForegroundColor White
Write-Host "  3. Verify service is running (not sleeping)" -ForegroundColor White
Write-Host "  4. Check Environment Variables are set" -ForegroundColor White
Write-Host "  5. Try Manual Deploy to restart service" -ForegroundColor White
Write-Host ""
