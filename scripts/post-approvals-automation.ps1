# Use the orchestrator to configure VS Code to run with approval-free env in terminals/tasks
param(
  [string]$Url = "http://127.0.0.1:4100"
)
$ErrorActionPreference = "Stop"

# PowerShell that writes .vscode/settings.json and sets terminal env vars
$psScript = @"
$ErrorActionPreference = 'Stop'
$root = Get-Location
$vscodeDir = Join-Path $root '.vscode'
if (-not (Test-Path $vscodeDir)) { New-Item -ItemType Directory -Path $vscodeDir | Out-Null }
$settingsPath = Join-Path $vscodeDir 'settings.json'

if (Test-Path $settingsPath) {
  try { $json = Get-Content $settingsPath -Raw | ConvertFrom-Json -AsHashtable } catch { $json = [ordered]@{} }
} else {
  $json = [ordered]@{}
}

if (-not $json.ContainsKey('terminal.integrated.env.windows')) {
  $json['terminal.integrated.env.windows'] = [ordered]@{}
}
$envMap = $json['terminal.integrated.env.windows']
$envMap['CODEX_APPROVAL_POLICY'] = 'never'
$envMap['CODEX_SANDBOX_MODE'] = 'danger-full-access'
$envMap['CODEX_NETWORK_ACCESS'] = 'enabled'

# Optional quality of life: reduce confirmation prompts in general (harmless if unknown)
$json['security.workspace.trust.enabled'] = $true

$json | ConvertTo-Json -Depth 10 | Set-Content -Path $settingsPath -Encoding UTF8
Write-Output "Updated $settingsPath with approval-free env vars"
"@

$goal = @"
Immediately call run_powershell with the provided script to configure VS Code. After it completes, return action done with a brief result. Use exactly:

SCRIPT:
${psScript}
"@

$body = @{ goal = $goal } | ConvertTo-Json -Compress
$resp = Invoke-RestMethod -Method Post -Uri "$Url/tasks" -Body $body -ContentType 'application/json'
Write-Host "Task id: $($resp.id)" -ForegroundColor Yellow

$viewer = "$Url/viewer?task=$($resp.id)"
Write-Host "Viewer: $viewer" -ForegroundColor Cyan
try { Start-Process $viewer } catch {}

