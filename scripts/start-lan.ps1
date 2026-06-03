param(
  [int]$Port = 4174
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  $python = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $python) {
  Write-Error "Python was not found. Install Python or run the app with another static file server."
  exit 1
}

$lanIp = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ""
Write-Host "GoodHR Workbench is starting for LAN access."
Write-Host "Local URL: http://127.0.0.1:$Port/"
if ($lanIp) {
  Write-Host "LAN URL:   http://${lanIp}:$Port/"
}
Write-Host ""
Write-Host "Keep this window open while others use the app."
Write-Host "If Windows Firewall asks, allow access on Private networks."
Write-Host ""

Set-Location $root
& $python.Source -m http.server $Port --bind 0.0.0.0
