[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RealStory,
    [Parameter(Mandatory)][string[]]$StartSelectors,
    [string]$Executable = ''
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not $Executable) { $Executable = Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe' }
$source = (Resolve-Path -LiteralPath $RealStory).Path
$sourceRoot = Split-Path $source
$hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
$root = Join-Path $repo ('artifacts\native-private-sugarcube-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$game = Join-Path $root 'Game.html'
Copy-Item -LiteralPath $source -Destination $game
# Copy only startup scripts/styles. Large private media stay out of the test
# copy, and no junction gives the test app write access to the original folder.
$resources = Join-Path $sourceRoot 'resources'
if (Test-Path -LiteralPath $resources) {
    foreach ($file in Get-ChildItem -LiteralPath $resources -File -Recurse | Where-Object Extension -In '.js','.css') {
        $destination = Join-Path $root $file.FullName.Substring($sourceRoot.Length + 1)
        New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination
    }
}
foreach ($mode in @('capture','restore')) {
    $inputPath = Join-Path $root 'settings.json'
    $report = Join-Path $root "$mode-report.json"
    @{ game = $game; mode = "private-sugarcube-$mode"; filename = 'private-engine.save'; startSelectors = $StartSelectors } | ConvertTo-Json | Set-Content -LiteralPath $inputPath -Encoding utf8
    $start = [Diagnostics.ProcessStartInfo]::new($Executable)
    $start.UseShellExecute = $false
    $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    # Each process starts in a fresh browser profile; the sidecar is the only
    # saved game state available to restore in the second process.
    $start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT'] = Join-Path $root "$mode-data"
    $start.Environment['TWINEPLAYER_NATIVE_SAVE_SMOKE_INPUT'] = $inputPath
    $start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT'] = $report
    $process = [Diagnostics.Process]::Start($start)
    if (-not $process.WaitForExit(60000)) { $process.Kill(); throw "Private SugarCube smoke timed out: $root" }
    if (-not (Test-Path -LiteralPath $report)) { throw "Private SugarCube smoke exited without a report: $root" }
    $result = Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
    if (-not $result.passed) { throw $result.error }
    Write-Output "PASS private SugarCube $mode ($report)"
}
if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $hash) { throw 'Original game changed during smoke.' }
Write-Output "PRIVATE_SUGARCUBE_ROOT=$root"
