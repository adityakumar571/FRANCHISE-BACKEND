# Setup Super Admin on Production Render
Write-Host "Creating Super Admin on Production..." -ForegroundColor Cyan
Write-Host ""

$body = @{
    secret = "change-me-in-production-2024"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://saas-backend-f40t.onrender.com/api/setup/create-superadmin" `
        -Method Post `
        -ContentType "application/json" `
        -Body $body
    
    Write-Host "✅ SUCCESS!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 3)
    Write-Host ""
    Write-Host "Use these credentials to login:" -ForegroundColor Yellow
    Write-Host "User ID: superadmin" -ForegroundColor White
    Write-Host "Password: SuperAdmin@123" -ForegroundColor White
} 
catch {
    Write-Host "❌ ERROR!" -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host $_.ErrorDetails.Message
}
