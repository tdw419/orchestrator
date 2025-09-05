# Starts the minimal orchestrator service (no dependencies)
param(
  [int]$Port = 4100,
  [string]$Model = "lmstudio-local",
  [string]$ApiBase = "http://localhost:4000",
  [string]$ApiKey = "",
  [string]$DesktopUrl = "http://127.0.0.1:39990/computer-use",
  [int]$MaxSteps = 8,
  [string]$AutoDevRoot = "",
  [string]$PythonBin = "python",
  [string]$AdminToken = "",
  [bool]$EnableSummary = $true,
  [int]$SummaryIntervalMs = 30000
)
$ErrorActionPreference = "Stop"

Write-Host "[orchestrator] Starting on port $Port" -ForegroundColor Green
$env:ORCH_PORT = "$Port"
$env:ORCH_MODEL = $Model
$env:OPENAI_API_BASE = $ApiBase
if ($ApiKey) { $env:OPENAI_API_KEY = $ApiKey } else { Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue }
$env:DESKTOP_DRIVER_URL = $DesktopUrl
$env:MAX_STEPS = "$MaxSteps"

# Optional Auto Dev integration
if ($AutoDevRoot) { $env:AUTODEV_ROOT = $AutoDevRoot }
if ($PythonBin) { $env:PYTHON_BIN = $PythonBin }
if ($AdminToken) { $env:ORCH_ADMIN_TOKEN = $AdminToken }

# Summary controls
$env:ENABLE_SUMMARY = if ($EnableSummary) { "true" } else { "false" }
$env:MIN_SUMMARY_INTERVAL_MS = "$SummaryIntervalMs"

node windows-orchestrator/index.js
