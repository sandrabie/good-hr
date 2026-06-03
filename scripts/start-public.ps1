param(
  [int]$Port = 4174
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $cloudflared) {
  Write-Host ""
  Write-Host "cloudflared was not found."
  Write-Host "Install it first:"
  Write-Host "  winget install --id Cloudflare.cloudflared"
  Write-Host ""
  Write-Host "Then run again:"
  Write-Host "  npm run serve:public"
  Write-Host ""
  exit 1
}

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
  $python = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $python) {
  Write-Error "Python was not found. Install Python or run the app with another static file server."
  exit 1
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  Start-Process -FilePath $python.Source -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1") -WorkingDirectory $root -WindowStyle Hidden
  Start-Sleep -Seconds 2
}

Write-Host ""
Write-Host "Starting a public temporary tunnel for GoodHR Workbench."
Write-Host "Copy the https://*.trycloudflare.com URL from the output below."
Write-Host "Close this window to stop public access."
Write-Host ""

& $cloudflared.Source tunnel --url "http://127.0.0.1:$Port"
