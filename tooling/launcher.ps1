#Requires -Version 5.1
<#
  Anvika launcher (Windows).

  Double-click launcher.bat (which calls this script) to get an interactive menu that runs,
  updates, and builds Anvika from source. The runtime needs only Bun; the web build is forced
  through Bun (`bun --bun`) so Node.js is NOT required.
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

# The server binds the IPv4 loopback (127.0.0.1). Use that literal rather than "localhost" so the
# health poll and the browser open do not fail when "localhost" resolves to IPv6 (::1) first.
$Port = 7800
$Url = "http://127.0.0.1:$Port"

function Test-Tool([string]$name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Assert-Bun {
  if (-not (Test-Tool 'bun')) {
    Write-Host 'Bun is required but was not found on PATH.' -ForegroundColor Red
    Write-Host 'Install Bun from https://bun.sh, then run this launcher again.'
    Read-Host 'Press Enter to exit'
    exit 1
  }
}

function Write-Title {
  Write-Host ''
  Write-Host 'Anvika launcher' -ForegroundColor Cyan
  $bun = if (Test-Tool 'bun') { 'found' } else { 'NOT found' }
  $git = if (Test-Tool 'git') { 'found' } else { 'NOT found' }
  Write-Host "bun: $bun. git: $git. App URL: $Url"
  Write-Host ''
}

function Invoke-PullSource {
  if (-not (Test-Tool 'git')) {
    Write-Host 'Git is not installed, so the source cannot be updated.' -ForegroundColor Yellow
    return
  }
  Write-Host 'Pulling the latest source from origin/main...' -ForegroundColor Cyan
  & git pull origin main
  Write-Host ''
}

function Invoke-InstallDeps {
  Assert-Bun
  Write-Host 'Installing/updating dependencies (bun install)...' -ForegroundColor Cyan
  & bun install
  Write-Host ''
}

function Invoke-BuildWeb {
  Assert-Bun
  Write-Host 'Building the web client with Bun (no Node.js needed)...' -ForegroundColor Cyan
  # build:web bakes in `--bun`, so this builds with Bun and needs no Node.js.
  & bun run build:web
  Write-Host ''
}

function Initialize-App {
  # Make sure dependencies are installed and the web client is built before serving.
  if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules'))) { Invoke-InstallDeps }
  if (-not (Test-Path -LiteralPath (Join-Path $root 'apps\web\dist\index.html'))) { Invoke-BuildWeb }
}

function Wait-ForServer([int]$timeoutSec = 20) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri "$Url/api/v1/health" -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { return $true }
    } catch { Start-Sleep -Milliseconds 500 }
  }
  return $false
}

function Invoke-Launch {
  Assert-Bun
  Initialize-App
  Write-Host "Launching Anvika at $Url. Press Ctrl+C in this window to stop it." -ForegroundColor Green
  Write-Host ''
  & bun run serve
  Write-Host ''
  Write-Host 'The server has stopped.' -ForegroundColor Yellow
}

function Invoke-LaunchWindowless {
  Assert-Bun
  Initialize-App
  Write-Host 'Launching Anvika in the background (no console window)...' -ForegroundColor Green
  Start-Process -FilePath 'bun' -ArgumentList @('run', 'serve', '--no-open') -WorkingDirectory $root -WindowStyle Hidden
  if (Wait-ForServer) {
    Start-Process $Url
    Write-Host "Opened in your browser at $Url. Use 'Stop the app' to stop it later."
  } else {
    Write-Host 'The server did not respond in time. Try option 7 to open it, or option 8 to stop it.' -ForegroundColor Yellow
  }
  Write-Host ''
}

function Stop-App {
  # Match only THIS app's server: its command line runs `apps/server/src/main.ts ... serve`. Scoping
  # to that path (rather than a bare "serve") avoids stopping an unrelated project's `bun run serve`.
  $procs = @(Get-CimInstance Win32_Process -Filter "Name='bun.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*apps/server/src/main*' -and $_.CommandLine -like '*serve*' })
  if ($procs.Count -eq 0) {
    Write-Host 'No running Anvika server was found.' -ForegroundColor Yellow
  } else {
    foreach ($p in $procs) {
      try {
        Stop-Process -Id $p.ProcessId -Force
        Write-Host "Stopped bun process $($p.ProcessId)."
      } catch {
        Write-Host "Could not stop process $($p.ProcessId): $_" -ForegroundColor Yellow
      }
    }
  }
  Write-Host ''
}

function Open-InBrowser {
  Write-Host "Opening $Url ..." -ForegroundColor Cyan
  Start-Process $Url
  Write-Host ''
}

function Invoke-BuildBinary {
  Assert-Bun
  Write-Host 'Building the standalone binary (dist\anvika.exe) with Bun...' -ForegroundColor Cyan
  # compile runs build:web (which bakes in `--bun`) then `bun build --compile`, all on Bun.
  & bun run compile
  Write-Host ''
}

# --- main ---
Assert-Bun
Write-Title

# Startup: offer to pull the latest source first.
if (Test-Tool 'git') {
  $answer = Read-Host 'Pull the latest source from origin/main now? (Y/N)'
  if ($answer -match '^\s*(y|yes)\s*$') { Invoke-PullSource }
  Write-Host ''
}

$exit = $false
while (-not $exit) {
  Write-Host 'What would you like to do?' -ForegroundColor White
  Write-Host '  1. Launch the app'
  Write-Host '  2. Launch the app windowless (no console window; opens in the browser)'
  Write-Host '  3. Update from source (git pull origin main)'
  Write-Host '  4. Install/update dependencies (bun install)'
  Write-Host '  5. Build the web client (bun)'
  Write-Host '  6. Build the standalone binary (bun)'
  Write-Host '  7. Open the app in the browser'
  Write-Host '  8. Stop the app'
  Write-Host '  0. Exit'
  Write-Host ''
  $choice = Read-Host 'Enter a number'
  Write-Host ''
  switch ($choice.Trim()) {
    '1' { Invoke-Launch }
    '2' { Invoke-LaunchWindowless }
    '3' { Invoke-PullSource }
    '4' { Invoke-InstallDeps }
    '5' { Invoke-BuildWeb }
    '6' { Invoke-BuildBinary }
    '7' { Open-InBrowser }
    '8' { Stop-App }
    '0' { $exit = $true }
    default { Write-Host 'Please enter a number from the menu.' -ForegroundColor Yellow; Write-Host '' }
  }
}
Write-Host 'Goodbye.'
