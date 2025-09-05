# Posts a goal to the orchestrator and tails its status
param(
  [string]$Goal = "Open Notepad, type Hello world, then done.",
  [string]$Url = "http://127.0.0.1:4100"
)
$ErrorActionPreference = "Stop"

Write-Host "Posting task to $Url" -ForegroundColor Green
$body = @{ goal = $Goal } | ConvertTo-Json -Compress
$resp = Invoke-RestMethod -Method Post -Uri "$Url/tasks" -Body $body -ContentType "application/json"
Write-Host "Task id: $($resp.id) status: $($resp.status)" -ForegroundColor Yellow

# Poll a few times
for ($i=0; $i -lt 15; $i++) {
  Start-Sleep -Seconds 1
  try {
    $t = Invoke-RestMethod -Method Get -Uri "$Url/tasks/$($resp.id)"
  } catch { continue }
  Write-Host ("[{0}] status={1} steps={2}" -f $i, $t.status, ($t.steps.Count))
  if ($t.status -in @('done','error','stopped')) { break }
}

# Show last few messages
try {
  $msgs = Invoke-RestMethod -Method Get -Uri "$Url/tasks/$($resp.id)/messages"
  Write-Host "--- messages ---" -ForegroundColor Cyan
  $msgs | Select-Object -Last 6 | ForEach-Object { Write-Host ("{0}: {1}" -f $_.role, $_.content) }
} catch {}

# Show and open viewer URL (HTTP)
Write-Host ""
$viewerUrl = "http://127.0.0.1:4100/viewer?task=$($resp.id)"
Write-Host "View screenshots: " -NoNewline -ForegroundColor Green
Write-Host $viewerUrl -ForegroundColor Cyan

try {
  Start-Process $viewerUrl
  Write-Host "✓ Opened viewer in browser" -ForegroundColor Green
} catch {
  Write-Host "Note: Could not auto-open browser - use URL above" -ForegroundColor Yellow
}

