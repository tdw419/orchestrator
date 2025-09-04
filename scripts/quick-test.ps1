$Goal = "Take a screenshot"
$Url = "http://127.0.0.1:4100"

Write-Host "Creating task..." -ForegroundColor Green
$body = @{ goal = $Goal } | ConvertTo-Json
$resp = Invoke-RestMethod -Method Post -Uri "$Url/tasks" -Body $body -ContentType "application/json"

Write-Host "Task ID: $($resp.id)" -ForegroundColor Cyan
Write-Host "Waiting 10 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

$viewerUrl = "http://127.0.0.1:4100/viewer?task=$($resp.id)"
Write-Host "Viewer: $viewerUrl" -ForegroundColor Green

# Auto-open viewer
try {
    Start-Process $viewerUrl
    Write-Host "Browser opened!" -ForegroundColor Cyan
} catch {
    Write-Host "Could not open browser" -ForegroundColor Yellow
}