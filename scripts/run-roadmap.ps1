# Orchestrator Self-Improvement Runner
# Executes roadmap items via Auto Dev integration for continuous improvement

param(
  [string]$OrchBaseUrl = "http://127.0.0.1:4100",
  [string]$AutoDevRoot = "",
  [string]$PythonBin = "python",
  [string]$ApiBase = "http://127.0.0.1:1234/v1",
  [string]$Model = "lmstudio-local",
  [string]$Ids = "",        # Comma-separated roadmap IDs; empty = all
  [int]$Phase = 0,           # Filter by phase (1-5); 0 = all
  [switch]$DryRun = $false,  # Preview without executing
  [switch]$ContinueOnError = $false,  # Continue when an item fails
  [string]$AdminToken = ""          # Optional Authorization: Bearer token for /admin/* endpoints
)

$ErrorActionPreference = "Stop"

# Resolve repo root and roadmap file
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
$roadmapPath = Join-Path $repoRoot "roadmap.json"
if (!(Test-Path $roadmapPath)) { Write-Error "roadmap.json not found at $roadmapPath" }

# Show configuration
Write-Host ("[runner] Orchestrator: {0}" -f $OrchBaseUrl) -ForegroundColor Cyan
Write-Host ("[runner] AUTODEV_ROOT: {0} | PYTHON_BIN: {1}" -f $AutoDevRoot, $PythonBin) -ForegroundColor Cyan
if ($AdminToken) { Write-Host "[runner] Admin token: (provided)" -ForegroundColor Cyan }

# Prompt for AutoDevRoot if missing
if ([string]::IsNullOrWhiteSpace($AutoDevRoot)) {
  $AutoDevRoot = Read-Host "Enter AUTODEV_ROOT (e.g., C:\zion\wwwroot\projects\ai_auto_development\ai_auto_development)"
}

# Load roadmap
$items = $null
try {
  $items = Get-Content $roadmapPath -Raw | ConvertFrom-Json
  $items = @($items)
} catch {
  Write-Error ("Failed to parse roadmap.json: {0}" -f $_.Exception.Message)
}

# Filter by IDs or Phase
if ($Ids) {
  $filter = $Ids.Split(',') | ForEach-Object { $_.Trim() }
  $items = @($items | Where-Object { $filter -contains $_.id })
  Write-Host ("[runner] Selected {0} items by ID: {1}" -f $items.Count, $Ids) -ForegroundColor Cyan
} elseif ($Phase -gt 0) {
  $items = @($items | Where-Object { $_.phase -eq $Phase })
  Write-Host ("[runner] Selected {0} items from Phase {1}" -f $items.Count, $Phase) -ForegroundColor Cyan
} else {
  Write-Host ("[runner] Selected all {0} roadmap items" -f $items.Count) -ForegroundColor Cyan
}

if (-not $items -or $items.Count -eq 0) {
  Write-Host "[runner] No roadmap items to run" -ForegroundColor Yellow
  exit 0
}

function Invoke-AutoDevRun([object]$item) {
  $absProjectDir = $repoRoot  
  $fullPrompt = @"
You are improving an existing Node.js project at path:
  $absProjectDir

Task ID: $($item.id)
Title: $($item.title)

Implement the following change with minimal diffs, no external deps, and update README where appropriate:
$($item.prompt)

Acceptance:
- Build passes (no syntax errors), server starts.
- Style consistent with current code.
- Security: validate input and escape output where needed.
"@

  $payload = @{ config = @{ prompt = $fullPrompt; project_dir = $absProjectDir; model_a = $Model; model_b = $Model; timeout_ms = 300000 } }

  if ($DryRun) {
    if ($AdminToken) {
      Write-Host ("[dry-run] Would POST /admin/autodev_run for: {0} with Authorization header" -f $item.id) -ForegroundColor Yellow
    } else {
      Write-Host ("[dry-run] Would POST /admin/autodev_run for: {0}" -f $item.id) -ForegroundColor Yellow
    }
    return @{ ok = $true; dry_run = $true }
  }

  try {
    $headers = @{}
    if ($AdminToken) {
      $headers['Authorization'] = "Bearer $AdminToken"
      $headers['x-admin-token'] = $AdminToken
    }
    $resp = Invoke-RestMethod -Method Post -Uri ("{0}/admin/autodev_run" -f $OrchBaseUrl) -Body ($payload | ConvertTo-Json -Depth 6) -ContentType "application/json" -Headers $headers
    return $resp
  } catch {
    Write-Host ("[runner] autodev_run failed for {0}: {1}" -f $item.id, $_.Exception.Message) -ForegroundColor Red
    return @{ ok = $false; error = $_.Exception.Message }
  }
}

# Plan
Write-Host ""; Write-Host "[runner] Execution plan:" -ForegroundColor Cyan
foreach ($item in ($items | Sort-Object priority, id)) {
  $status = if ($DryRun) { "[DRY RUN]" } else { "" }
  Write-Host ("  {0}. {1}: {2} (Phase {3}) {4}" -f $item.priority, $item.id, $item.title, $item.phase, $status) -ForegroundColor Gray
}

if (-not $DryRun) { Write-Host ""; Write-Host "Continuing in 3 seconds... (Ctrl+C to cancel)" -ForegroundColor Yellow; Start-Sleep -Seconds 3 }

# Execute
$successCount = 0
$totalCount = $items.Count
Write-Host ""; Write-Host "[runner] Starting roadmap execution..." -ForegroundColor Green; Write-Host ""

foreach ($item in ($items | Sort-Object priority, id)) {
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Host ("[{0}] Running: {1} - {2}" -f $ts, $item.id, $item.title) -ForegroundColor Green
  Write-Host ("  Phase {0} | Priority {1} | Complexity: {2}" -f $item.phase, $item.priority, $item.complexity) -ForegroundColor Gray

  $result = Invoke-AutoDevRun -item $item
  if ($result.ok -or $result.dry_run) {
    $successCount++
    if ($result.dry_run) {
      Write-Host "  [DRY RUN] Would execute Auto Dev for this item" -ForegroundColor Yellow
    } else {
      Write-Host ("  Completed: exit={0} events={1}" -f $result.exitCode, $result.ndjson_count) -ForegroundColor Green
      if ($result.summary) { Write-Host ("    Summary: {0}" -f $result.summary) -ForegroundColor DarkGray }
    }
  } else {
    Write-Host ("  Failed: {0}" -f $result.error) -ForegroundColor Red
    if (-not $ContinueOnError) {
      Write-Host "  Stopping execution (use -ContinueOnError to continue)" -ForegroundColor Yellow
      break
    }
  }
  Write-Host ""
}

# Summary
Write-Host "[runner] Summary:" -ForegroundColor Cyan
Write-Host ("  Total items: {0}" -f $totalCount) -ForegroundColor Gray
Write-Host ("  Successful: {0}" -f $successCount) -ForegroundColor Green
Write-Host ("  Failed: {0}" -f ($totalCount - $successCount)) -ForegroundColor Red
if ($DryRun) { Write-Host "  Mode: Dry run (no changes made)" -ForegroundColor Yellow } else { Write-Host ("  Check orchestrator viewer: {0}/viewer" -f $OrchBaseUrl) -ForegroundColor Cyan }

Write-Host "[runner] Done." -ForegroundColor Cyan
