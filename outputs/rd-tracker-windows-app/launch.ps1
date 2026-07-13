$DryRun = $false
if ($args -contains "-DryRun") {
    $DryRun = $true
}

$ErrorActionPreference = "Stop"

$AppRoot = Join-Path -Path $PSScriptRoot -ChildPath "app"
$ProfileRoot = Join-Path -Path $PSScriptRoot -ChildPath "profile"
$LogRoot = Join-Path -Path $PSScriptRoot -ChildPath "logs"
New-Item -ItemType Directory -Force -Path $ProfileRoot, $LogRoot | Out-Null

function Get-FreePort {
    param([int]$StartPort = 18765)

    for ($port = $StartPort; $port -lt ($StartPort + 100); $port++) {
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $client.Connect("127.0.0.1", $port)
            $client.Close()
        } catch {
            return $port
        } finally {
            $client.Dispose()
        }
    }

    throw "No free local port was found."
}

function Resolve-Python {
    $runtimePython = Join-Path -Path $env:USERPROFILE -ChildPath '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    $pyCommand = Get-Command py -ErrorAction SilentlyContinue
    $candidates = @($runtimePython)
    if ($pythonCommand) { $candidates += $pythonCommand.Source }
    if ($pyCommand) { $candidates += $pyCommand.Source }

    return $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

function Resolve-Edge {
    $edgeCommand = Get-Command msedge -ErrorAction SilentlyContinue
    $programFilesX86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
    $candidates = @()
    if ($edgeCommand) { $candidates += $edgeCommand.Source }
    if ($programFilesX86) { $candidates += (Join-Path -Path $programFilesX86 -ChildPath 'Microsoft\Edge\Application\msedge.exe') }
    if ($env:ProgramFiles) { $candidates += (Join-Path -Path $env:ProgramFiles -ChildPath 'Microsoft\Edge\Application\msedge.exe') }
    if ($env:LOCALAPPDATA) { $candidates += (Join-Path -Path $env:LOCALAPPDATA -ChildPath 'Microsoft\Edge\Application\msedge.exe') }

    return $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

if (-not (Test-Path (Join-Path -Path $AppRoot -ChildPath "index.html"))) {
    throw "App files were not found: $AppRoot"
}

$serverProcess = $null
$port = Get-FreePort
$python = Resolve-Python

if ($python) {
    $serverOutLog = Join-Path -Path $LogRoot -ChildPath "server.out.log"
    $serverErrLog = Join-Path -Path $LogRoot -ChildPath "server.err.log"
    $serverProcess = Start-Process `
        -FilePath $python `
        -ArgumentList @("-m", "http.server", "$port", "--bind", "127.0.0.1", "--directory", $AppRoot) `
        -WindowStyle Hidden `
        -RedirectStandardOutput $serverOutLog `
        -RedirectStandardError $serverErrLog `
        -PassThru

    Start-Sleep -Milliseconds 700
    $url = "http://127.0.0.1:$port/index.html"
} else {
    $indexPath = ((Resolve-Path (Join-Path -Path $AppRoot -ChildPath "index.html")).Path) -replace "\\", "/"
    $url = "file:///$indexPath"
    Write-Host "Python was not found. Starting in local file mode." -ForegroundColor Yellow
}

$edge = Resolve-Edge

if ($DryRun) {
    [ordered]@{
        appRoot = $AppRoot
        url = $url
        python = $python
        edge = $edge
        serverStarted = [bool]$serverProcess
    } | ConvertTo-Json

    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
    }
    exit 0
}

try {
    if ($edge) {
        Start-Process `
            -FilePath $edge `
            -ArgumentList @("--app=$url", "--user-data-dir=$ProfileRoot", "--no-first-run") `
            -Wait
    } else {
        Write-Host "Microsoft Edge was not found. Opening with the default browser." -ForegroundColor Yellow
        Start-Process $url
        Read-Host "Close the browser window, then press Enter to exit"
    }
} finally {
    if ($serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force
    }
}
