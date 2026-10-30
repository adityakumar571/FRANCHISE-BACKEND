# Test Super Admin Login on Production
Write-Host "Testing Super Admin Login on Production..." -ForegroundColor Cyan
Write-Host ""

$loginBody = @{
    userId = "superadmin"
    password = "SuperAdmin@123"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://saas-backend-f40t.onrender.com/api/mainUser/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody
    
    Write-Host "✅ LOGIN SUCCESS!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Response:" -ForegroundColor Yellow
    Write-Host ($response | ConvertTo-Json -Depth 5)
    Write-Host ""
    
    if ($response.token) {
        Write-Host "🎟️  Token received: $($response.token.Substring(0, 50))..." -ForegroundColor Green
    }
} 
catch {
    Write-Host "❌ LOGIN FAILED!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Error:" $_.Exception.Message
    
    if ($_.ErrorDetails.Message) {
        Write-Host "Details:" $_.ErrorDetails.Message
    }
}
