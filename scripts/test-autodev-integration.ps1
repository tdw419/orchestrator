# Test Auto Dev integration with orchestrator
# Usage: powershell -ExecutionPolicy Bypass -File scripts\test-autodev-integration.ps1

param(
    [string]$AutoDevRoot = "",
    [string]$PythonBin = "python",
    [string]$ApiBase = "http://127.0.0.1:1234/v1",
    [string]$Model = "lmstudio-local"
)

Write-Host "Testing Auto Dev Integration" -ForegroundColor Green
Write-Host "=============================`n"

# Set required environment variables
if ($AutoDevRoot -eq "") {
    $AutoDevRoot = Read-Host "Enter AUTODEV_ROOT path (e.g., C:\path\to\ai_auto_development\ai_auto_development)"
}

$env:AUTODEV_ROOT = $AutoDevRoot
$env:PYTHON_BIN = $PythonBin
$env:OPENAI_API_BASE = $ApiBase
$env:ORCH_MODEL = $Model

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "AUTODEV_ROOT: $env:AUTODEV_ROOT"
Write-Host "PYTHON_BIN: $env:PYTHON_BIN"
Write-Host "OPENAI_API_BASE: $env:OPENAI_API_BASE"
Write-Host "ORCH_MODEL: $env:ORCH_MODEL`n"

# Validate prerequisites
Write-Host "Validating prerequisites..." -ForegroundColor Yellow

if (!(Test-Path $env:AUTODEV_ROOT)) {
    Write-Host "ERROR: AUTODEV_ROOT path does not exist: $env:AUTODEV_ROOT" -ForegroundColor Red
    exit 1
}

$cliPath = Join-Path $env:AUTODEV_ROOT "autodev_cli.py"
if (!(Test-Path $cliPath)) {
    Write-Host "ERROR: autodev_cli.py not found at: $cliPath" -ForegroundColor Red
    exit 1
}

try {
    & $env:PYTHON_BIN --version | Out-Null
    Write-Host "✓ Python found: $env:PYTHON_BIN" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Python not found or not working: $env:PYTHON_BIN" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Auto Dev CLI found: $cliPath" -ForegroundColor Green
Write-Host ""

# Start orchestrator in background
Write-Host "Starting orchestrator..." -ForegroundColor Yellow
$orchProcess = Start-Process -FilePath "node" -ArgumentList "windows-orchestrator/index.js" -NoNewWindow -PassThru

# Wait for orchestrator to start
Start-Sleep -Seconds 3

try {
    # Test health endpoint
    Write-Host "Testing orchestrator health..." -ForegroundColor Yellow
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:4100/health" -Method GET
    Write-Host "✓ Orchestrator running: $($health.ok)" -ForegroundColor Green
    Write-Host ""

    # Test manual Auto Dev run
    Write-Host "Testing manual Auto Dev run..." -ForegroundColor Yellow
    $testConfig = @{
        config = @{
            prompt = "Create a simple hello.py file that prints 'Hello from Auto Dev!'"
            project_dir = "test_workspace"
            timeout_ms = 60000
        }
    }

    $result = Invoke-RestMethod -Uri "http://127.0.0.1:4100/admin/autodev_run" -Method POST -Body ($testConfig | ConvertTo-Json -Depth 10) -ContentType "application/json"
    
    Write-Host "✓ Auto Dev run completed:" -ForegroundColor Green
    Write-Host "  Exit Code: $($result.exitCode)"
    Write-Host "  NDJSON Events: $($result.ndjson_count)"
    Write-Host "  Summary: $($result.summary)"
    if ($result.status_file) {
        Write-Host "  Status File: $($result.status_file)"
    }
    Write-Host ""

    # Test LLM-driven task
    Write-Host "Testing LLM-driven Auto Dev task..." -ForegroundColor Yellow
    $task = @{
        goal = "Use autodev_run to create a Flask app with /health endpoint in flask_workspace, then done"
    }

    $taskResult = Invoke-RestMethod -Uri "http://127.0.0.1:4100/tasks" -Method POST -Body ($task | ConvertTo-Json) -ContentType "application/json"
    Write-Host "✓ Task created: $($taskResult.id)" -ForegroundColor Green
    Write-Host ""

    # Wait a bit for task to start
    Start-Sleep -Seconds 5

    # Check task status
    $taskStatus = Invoke-RestMethod -Uri "http://127.0.0.1:4100/tasks/$($taskResult.id)" -Method GET
    Write-Host "Task Status: $($taskStatus.status)" -ForegroundColor Yellow
    Write-Host "Steps completed: $($taskStatus.steps.Count)"
    Write-Host ""

    # Pin a note and fetch context
    Write-Host "Adding a pinned note and fetching context..." -ForegroundColor Yellow
    Invoke-RestMethod -Uri "http://127.0.0.1:4100/tasks/$($taskResult.id)/notes" -Method POST -Body (@{note = "Prefer using Auto Dev tool when coding"} | ConvertTo-Json) -ContentType "application/json" | Out-Null
    $context = Invoke-RestMethod -Uri "http://127.0.0.1:4100/tasks/$($taskResult.id)/context" -Method GET
    Write-Host "Context preview:" -ForegroundColor Yellow
    $preview = $context.context
    if ($preview.Length -gt 200) { $preview = $preview.Substring(0,200) }
    Write-Host $preview

    Write-Host "Test completed successfully!" -ForegroundColor Green
    Write-Host "You can view the task at: http://127.0.0.1:4100/viewer" -ForegroundColor Cyan
    Write-Host "Auto Dev status at: http://127.0.0.1:4100/autodev/status" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press any key to stop the orchestrator and exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

} catch {
    Write-Host "ERROR: Test failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    # Stop orchestrator
    Write-Host "Stopping orchestrator..." -ForegroundColor Yellow
    if ($orchProcess -and !$orchProcess.HasExited) {
        $orchProcess.Kill()
        $orchProcess.WaitForExit(5000)
    }
    Write-Host "Done." -ForegroundColor Green
}
