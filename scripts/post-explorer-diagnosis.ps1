# Post a task to diagnose Explorer refresh/sort behavior in a target folder
param(
  [Parameter(Mandatory=$true)][string]$Folder,
  [string]$Url = "http://127.0.0.1:4100"
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $Folder)) { throw "Folder not found: $Folder" }

# Compose a clear goal instructing the LLM to use run_powershell and UI steps
$goal = @"
Troubleshoot Windows Explorer not refreshing or ordering newest files when sorted by date in this folder: "$Folder".

Plan one action at a time and use only the available tools. Use run_powershell for file operations and listing instead of typing commands in the UI.

Steps to perform:
1) Open Windows Explorer directly to the folder using open_app explorer.exe with the folder path as argument.
2) Take a screenshot.
3) Ensure Details view and sorting by Date modified descending, and Group by is None (use clicks/keys; if unsure, still proceed).
4) Use run_powershell with a script to create three test files in the folder with slightly different timestamps:
   `$ErrorActionPreference='Stop'; 1..3 | ForEach-Object { $i=$_; $p=Join-Path "$Folder" ("bytebot_sort_test_$i.txt"); "test $i" | Out-File -Encoding ASCII -FilePath $p; Start-Sleep -Milliseconds 900 }
5) Take another screenshot of Explorer.
6) Use run_powershell to list the top 8 files by LastWriteTime in the folder and output as JSON:
   `Get-ChildItem -File "$Folder" | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,LastWriteTime | ConvertTo-Json -Compress`
7) Finish with action "done" and include a brief diagnosis in params.result that compares the PowerShell order vs what Explorer appears to show.
"@

Write-Host "Posting diagnosis task to $Url" -ForegroundColor Green
$body = @{ goal = $goal } | ConvertTo-Json -Compress
$resp = Invoke-RestMethod -Method Post -Uri "$Url/tasks" -Body $body -ContentType "application/json"
Write-Host "Task id: $($resp.id)" -ForegroundColor Yellow

# Open viewer
$viewerUrl = "$Url/viewer?task=$($resp.id)"
Write-Host "Viewer: $viewerUrl" -ForegroundColor Cyan
try { Start-Process $viewerUrl } catch {}
