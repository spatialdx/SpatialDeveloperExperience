[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Resolve-MkcertPath {
  $command = Get-Command mkcert.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $wingetPackages = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path -LiteralPath $wingetPackages) {
    $wingetMkcert = Get-ChildItem `
      -LiteralPath $wingetPackages `
      -Filter mkcert.exe `
      -Recurse `
      -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "FiloSottile\.mkcert" } |
      Select-Object -First 1

    if ($wingetMkcert) {
      return $wingetMkcert.FullName
    }
  }

  Write-Host ""
  Write-Host "mkcert was not found. Install it with:" -ForegroundColor Red
  Write-Host "  winget install --id FiloSottile.mkcert --exact"
  exit 1
}

function Get-LanAddress {
  $defaultRoutes = Get-NetRoute `
    -AddressFamily IPv4 `
    -DestinationPrefix "0.0.0.0/0" `
    -ErrorAction SilentlyContinue |
    Where-Object { $_.NextHop -ne "0.0.0.0" } |
    Sort-Object RouteMetric, InterfaceMetric

  foreach ($route in $defaultRoutes) {
    $address = Get-NetIPAddress `
      -AddressFamily IPv4 `
      -InterfaceIndex $route.InterfaceIndex `
      -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*"
      } |
      Select-Object -First 1

    if ($address) {
      return $address.IPAddress
    }
  }

  throw "Could not determine this PC's LAN IPv4 address."
}

$mkcertPath = Resolve-MkcertPath
$lanAddress = Get-LanAddress
$certificateDirectory = Join-Path $PSScriptRoot "..\node_modules\.vite\quest-xr"
$certificateDirectory = [System.IO.Path]::GetFullPath($certificateDirectory)
$certificatePath = Join-Path $certificateDirectory "cert.pem"
$keyPath = Join-Path $certificateDirectory "key.pem"

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

# Install the local CA once. Avoid repeating mkcert's optional Java trust-store
# step, which can fail independently even after Windows trust succeeds.
$mkcertRootInstalled = Get-ChildItem Cert:\CurrentUser\Root |
  Where-Object { $_.Subject -like "*mkcert*" } |
  Select-Object -First 1

if (-not $mkcertRootInstalled) {
  & $mkcertPath -install
}

& $mkcertPath `
  -cert-file $certificatePath `
  -key-file $keyPath `
  localhost `
  127.0.0.1 `
  "::1" `
  $lanAddress

if ($LASTEXITCODE -ne 0) {
  throw "Could not create the Quest LAN development certificate."
}

$env:XR_HTTPS = "1"
$env:XR_HOST = "1"
$env:XR_ALLOWED_DEV_ORIGIN = $lanAddress
$env:TLS_CERT_PATH = $certificatePath
$env:TLS_KEY_PATH = $keyPath

Write-Host ""
Write-Host "Quest LAN HTTPS is ready." -ForegroundColor Green
Write-Host "Open this exact URL in Quest Browser:"
Write-Host "  https://${lanAddress}:3000" -ForegroundColor Cyan
Write-Host ""

& npm.cmd run dev:xr:services
exit $LASTEXITCODE
