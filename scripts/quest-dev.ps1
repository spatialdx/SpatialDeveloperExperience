[CmdletBinding()]
param(
  [string]$Serial = ""
)

$ErrorActionPreference = "Stop"

function Stop-QuestSetup {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  Write-Host ""
  Write-Host $Message -ForegroundColor Red
  exit 1
}

function Resolve-AdbPath {
  $command = Get-Command adb.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $wingetPackages = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path -LiteralPath $wingetPackages) {
    $wingetAdb = Get-ChildItem `
      -LiteralPath $wingetPackages `
      -Filter adb.exe `
      -Recurse `
      -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "Google\.PlatformTools" } |
      Select-Object -First 1

    if ($wingetAdb) {
      return $wingetAdb.FullName
    }
  }

  Stop-QuestSetup -Message @"
Android Platform Tools (adb) were not found.
Install them with:
  winget install --id Google.PlatformTools --exact
Then open a new PowerShell window and run this command again.
"@
}

function Invoke-Adb {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [switch]$IgnoreExitCode
  )

  & $script:AdbPath @Arguments
  if (-not $IgnoreExitCode -and $LASTEXITCODE -ne 0) {
    throw "adb failed: adb $($Arguments -join ' ')"
  }
}

$script:AdbPath = Resolve-AdbPath
Write-Host "Using adb: $script:AdbPath" -ForegroundColor DarkGray
Invoke-Adb -Arguments @("start-server")

$deviceRows = & $script:AdbPath devices -l |
  Select-Object -Skip 1 |
  Where-Object { $_ -match "\S" }

$devices = @(
  foreach ($row in $deviceRows) {
    if ($row -match "^(\S+)\s+(\S+)") {
      [PSCustomObject]@{
        Serial = $Matches[1]
        State = $Matches[2]
        Detail = $row
      }
    }
  }
)

$readyDevices = @($devices | Where-Object { $_.State -eq "device" })

if ($Serial) {
  $selectedDevice = $readyDevices |
    Where-Object { $_.Serial -eq $Serial } |
    Select-Object -First 1

  if (-not $selectedDevice) {
    Stop-QuestSetup -Message "Quest '$Serial' is not connected and authorized."
  }
} elseif ($readyDevices.Count -eq 1) {
  $selectedDevice = $readyDevices[0]
} elseif ($readyDevices.Count -gt 1) {
  $serials = ($readyDevices.Serial -join ", ")
  Stop-QuestSetup -Message @"
More than one Android device is connected: $serials
Choose the Quest explicitly:
  npm run dev:quest -- -Serial <quest-serial>
"@
} elseif ($devices.State -contains "unauthorized") {
  Stop-QuestSetup -Message @"
The Quest is connected but has not authorized this PC.
Put on the headset, accept the USB debugging prompt, enable "Always allow",
then run npm run dev:quest again.
"@
} else {
  Stop-QuestSetup -Message @"
No authorized Quest was found.
Enable Developer Mode, connect the headset with a USB data cable, put it on,
accept the USB debugging prompt, then run npm run dev:quest again.
"@
}

$ports = @(3000, 8080, 8081)
foreach ($port in $ports) {
  Invoke-Adb -Arguments @(
    "-s",
    $selectedDevice.Serial,
    "reverse",
    "tcp:$port",
    "tcp:$port"
  )
}

Write-Host ""
Write-Host "Quest connection ready." -ForegroundColor Green
Write-Host "1. Leave this window running."
Write-Host "2. In Quest Browser, open http://localhost:3000"
Write-Host "3. Select Enter Passthrough AR and approve spatial tracking."
Write-Host ""

try {
  & npm.cmd run dev
  if ($LASTEXITCODE -ne 0) {
    throw "The development server exited with code $LASTEXITCODE."
  }
} finally {
  foreach ($port in $ports) {
    Invoke-Adb `
      -Arguments @(
        "-s",
        $selectedDevice.Serial,
        "reverse",
        "--remove",
        "tcp:$port"
      ) `
      -IgnoreExitCode
  }
}
