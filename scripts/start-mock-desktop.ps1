param(
  [int]$Port = 39990
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

Write-Host "[mock] Starting mock-desktop on port $Port" -ForegroundColor Cyan
$env:PORT = $Port
node .\mock-desktop-server.js

