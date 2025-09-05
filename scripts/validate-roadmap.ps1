# Simple roadmap validation script
param([switch]$ShowItems)

$ErrorActionPreference = "Stop"

Write-Host "Validating Orchestrator Self-Improvement Roadmap" -ForegroundColor Cyan
Write-Host ("=" * 50)

# Check files exist
$roadmapPath = "roadmap.json"
$readmePath = "ROADMAP.md"

if (!(Test-Path $roadmapPath)) { Write-Host "roadmap.json not found" -ForegroundColor Red; exit 1 }
if (!(Test-Path $readmePath)) { Write-Host "ROADMAP.md not found" -ForegroundColor Red; exit 1 }
Write-Host "Roadmap files found" -ForegroundColor Green

# Parse JSON
try {
    $items = Get-Content $roadmapPath -Raw | ConvertFrom-Json
    Write-Host ("JSON is valid with {0} items" -f $items.Count) -ForegroundColor Green
} catch {
    Write-Host ("Invalid JSON: {0}" -f $_.Exception.Message) -ForegroundColor Red
    exit 1
}

# Validate structure
$phases = $items | Group-Object phase
Write-Host ("Items organized in {0} phases:" -f $phases.Count) -ForegroundColor Green
foreach ($phase in $phases | Sort-Object Name) {
    Write-Host ("  Phase {0}: {1} items" -f $phase.Name, $phase.Count) -ForegroundColor Gray
}

# Check required fields
$requiredFields = @("id", "title", "phase", "priority", "complexity", "prompt")
$missingFields = @()
foreach ($item in $items) {
    foreach ($field in $requiredFields) {
        if (-not $item.$field) { $missingFields += ("{0}.{1}" -f $item.id, $field) }
    }
}

if ($missingFields.Count -gt 0) {
    Write-Host "Missing required fields:" -ForegroundColor Red
    foreach ($m in $missingFields) { Write-Host ("  - {0}" -f $m) -ForegroundColor Red }
    exit 1
} else {
    Write-Host "All items have required fields" -ForegroundColor Green
}

# Show items if requested
if ($ShowItems) {
    Write-Host "`nRoadmap Items:" -ForegroundColor Cyan
    foreach ($item in $items | Sort-Object priority) {
        Write-Host ("  {0}. {1} (Phase {2})" -f $item.priority, $item.id, $item.phase) -ForegroundColor Gray
        Write-Host ("     {0}" -f $item.title) -ForegroundColor White
    }
}

Write-Host "`nSelf-improvement system ready!" -ForegroundColor Green
Write-Host "Run: .\scripts\run-roadmap.ps1 -DryRun to preview execution" -ForegroundColor Cyan
