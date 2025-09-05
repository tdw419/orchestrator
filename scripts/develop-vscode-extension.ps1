<#
  Development helper for the VS Code extension using the orchestrator's /admin/autodev_run.

  Examples:
    # Add a feature
    .\scripts\develop-vscode-extension.ps1 -Prompt "Add copy buttons to chat messages and implement save/restore chat history"

    # Fix a bug with optional overrides
    .\scripts\develop-vscode-extension.ps1 -Prompt "Fix token counting display and error handling" -ApiBase "http://127.0.0.1:1234/v1" -Model "lmstudio-local"

  Notes:
    - If ORCH_ADMIN_TOKEN is set, it is used automatically for Authorization.
    - Orchestrator should be running (default http://localhost:4100). Use the VS Code command or run: node windows-orchestrator\index.js
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Prompt,

  [string]$ProjectDir = "C:\zion\wwwroot\projects\orchestrator\orchestrator\projects\vscode_to_llm",

  [int]$TimeoutMs = 600000,

  # Orchestrator base URL
  [string]$BaseUrl = "http://localhost:4100",

  # Optional admin token; falls back to ORCH_ADMIN_TOKEN env var
  [string]$AdminToken = $env:ORCH_ADMIN_TOKEN,

  # Optional overrides for Auto Dev config
  [string]$ApiBase,
  [string]$Model
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[develop-vscode-extension] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[develop-vscode-extension] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[develop-vscode-extension] $msg" -ForegroundColor Red }

# Recent targets cache (.claude/recent-targets.json)
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ClaudeDir = Join-Path $RepoRoot ".claude"
$RecentTargetsPath = Join-Path $ClaudeDir "recent-targets.json"

function Get-RecentTargets() {
  try {
    if (Test-Path -LiteralPath $RecentTargetsPath) {
      $json = Get-Content -LiteralPath $RecentTargetsPath -Raw
      $list = $null
      if ($json) { $list = $json | ConvertFrom-Json }
      if ($list -is [System.Array]) { return $list }
    }
  } catch {}
  return @()
}

function Save-RecentTargets([Array]$list) {
  try {
    if (!(Test-Path -LiteralPath $ClaudeDir)) { New-Item -ItemType Directory -Path $ClaudeDir | Out-Null }
    ($list | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $RecentTargetsPath -Encoding UTF8
  } catch {}
}

function Add-RecentTarget([string]$path, [string]$label = "") {
  try {
    $p = ($path | Resolve-Path -ErrorAction SilentlyContinue)
    if (-not $p) { $p = $path }
    $norm = [IO.Path]::GetFullPath($p) 2>$null
  } catch { $norm = $path }

  if (-not $norm) { return }
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $existing = Get-RecentTargets

  # Deduplicate by normalized path (case-insensitive)
  $filtered = @()
  foreach ($it in $existing) {
    try {
      $n = [IO.Path]::GetFullPath([string]$it.path)
    } catch { $n = [string]$it.path }
    if ($n -and ($n.ToLowerInvariant() -ne $norm.ToLowerInvariant())) { $filtered += $it }
  }

  $entry = @{ path = $norm; label = $label; ts = $now }
  $result = ,$entry + $filtered
  if ($result.Count -gt 12) { $result = $result[0..11] }
  Save-RecentTargets $result
}

# Basic validation
if (-not (Test-Path -LiteralPath $ProjectDir)) {
  Write-Err "ProjectDir not found: $ProjectDir"
  exit 1
}

# Track recent target
Add-RecentTarget -path $ProjectDir -label "VS Code Extension"

# Check orchestrator health
try {
  $health = Invoke-RestMethod -Method Get -Uri ("{0}/health" -f $BaseUrl) -TimeoutSec 5
  if (-not $health.ok) { Write-Warn "Orchestrator health endpoint returned non-ok." }
  else { Write-Info ("Connected to orchestrator on port {0}" -f $health.ORCH_PORT) }
} catch {
  Write-Warn "Could not contact orchestrator at $BaseUrl. Continuing anyway..."
}

# Build Auto Dev config
$config = @{
  prompt = $Prompt
  project_dir = $ProjectDir
}

if ($ApiBase) {
  # Strip trailing /v1 if present for endpoints as orchestrator does
  $base = $ApiBase -replace "/v1$", ''
  $config.endpoints = @{ a = $base; b = $base }
}
if ($Model) {
  $config.models = @{ a = @{ name = $Model }; b = @{ name = $Model } }
}

$payload = @{ config = $config; timeout_ms = $TimeoutMs }
$json = $payload | ConvertTo-Json -Depth 10

$headers = @{ 'Content-Type' = 'application/json' }
if ($AdminToken) { $headers['Authorization'] = "Bearer $AdminToken" }

$uri = "{0}/admin/autodev_run" -f $BaseUrl

Write-Info "Submitting Auto Dev run to $uri"
Write-Info ("ProjectDir: {0}" -f $ProjectDir)
Write-Info ("Prompt: {0}" -f ($Prompt.Length -gt 80 ? ($Prompt.Substring(0, 77) + '...') : $Prompt))
if ($ApiBase) { Write-Info ("ApiBase override: {0}" -f $ApiBase) }
if ($Model)   { Write-Info ("Model override: {0}" -f $Model) }
if ($AdminToken) { Write-Info "Using Authorization: Bearer <redacted>" } else { Write-Warn "No admin token provided; endpoint must be unsecured." }

try {
  $timeoutSec = [Math]::Ceiling($TimeoutMs / 1000.0) + 15
  $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $json -TimeoutSec $timeoutSec

  # Display concise summary
  if ($resp.ok -ne $null) { Write-Info ("ok: {0}" -f $resp.ok) }
  if ($resp.exitCode -ne $null) { Write-Info ("exitCode: {0}" -f $resp.exitCode) }
  if ($resp.ndjson_count -ne $null) { Write-Info ("ndjson_count: {0}" -f $resp.ndjson_count) }
  if ($resp.summary) {
    Write-Host "----- Recent Events Summary -----" -ForegroundColor Green
    Write-Host $resp.summary
  }
  if ($resp.status_file) {
    Write-Info ("status_file: {0}" -f $resp.status_file)
  }

  # Surface any stderr snippet
  if ($resp.stderr) {
    Write-Warn "stderr (last ~500 chars):"
    Write-Host $resp.stderr
  }
  
  # Show recent targets list (top 5) for convenience
  $recent = Get-RecentTargets | Select-Object -First 5
  if ($recent -and $recent.Count -gt 0) {
    Write-Host "----- Recent Targets -----" -ForegroundColor Green
    foreach ($t in $recent) {
      Write-Host ("{0}  (last used: {1})" -f $t.path, (Get-Date ([DateTimeOffset]::FromUnixTimeMilliseconds([int64]$t.ts).UtcDateTime) -Format 'yyyy-MM-dd HH:mm UTC'))
    }
  }
} catch {
  Write-Err ("Auto Dev request failed: {0}" -f $_.Exception.Message)
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
    Write-Host $_.ErrorDetails.Message
  }
  exit 1
}
