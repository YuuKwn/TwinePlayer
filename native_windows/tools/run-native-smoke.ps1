[CmdletBinding()]
param(
    [string]$Executable = '',
    [string]$RealStory = '',
    [int]$TimeoutSeconds = 90,
    [string]$DataRoot = '',
    [switch]$ExpectPersisted,
    [ValidateRange(10,100)][int]$ReopenCycles=10,
    [switch]$Keyboard
)
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not $Executable) { $Executable = Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe' }
$root = Join-Path $repo ('artifacts\native-smoke-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$resourceFixture = Join-Path $root 'resource-scope'
$outsideFixture = Join-Path $root 'outside-resource-scope'
New-Item -ItemType Directory -Path $resourceFixture,$outsideFixture | Out-Null
Set-Content -LiteralPath (Join-Path $resourceFixture 'scope.html') -Value '<!doctype html><title>Scope fixture</title><p>Test resources</p>'
Set-Content -LiteralPath (Join-Path $outsideFixture 'sentinel.txt') -Value 'OUTSIDE-SCOPE-TEST-SENTINEL'
# Junction creation needs no elevation and never modifies the target directory.
New-Item -ItemType Junction -Path (Join-Path $resourceFixture 'linked') -Value $outsideFixture | Out-Null
New-Item -ItemType Junction -Path (Join-Path $resourceFixture 'scope_saves') -Value $outsideFixture | Out-Null
$stories = @('sugarcube','harlowe','chapbook','snowman') | ForEach-Object { Join-Path $repo "test\fixtures\story-assistance-official\$($_)_cssselectors_example.html" }
$stories += Join-Path $repo 'native_windows\fixtures\local-assets\local-assets.html'
if ($RealStory) { $stories += (Resolve-Path -LiteralPath $RealStory).Path }
$inputPath = Join-Path $root 'stories.json'
$output = Join-Path $root 'report.json'
$stories | ConvertTo-Json | Set-Content -LiteralPath $inputPath -Encoding utf8
$start = [Diagnostics.ProcessStartInfo]::new($Executable)
$start.UseShellExecute = $false
$start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT'] = if ($DataRoot) { [IO.Path]::GetFullPath($DataRoot) } else { Join-Path $root 'data' }
if ($ExpectPersisted) { $start.Environment['TWINEPLAYER_NATIVE_SMOKE_EXPECT_PERSISTED'] = '1' }
$start.Environment['TWINEPLAYER_NATIVE_SMOKE_INPUT'] = $inputPath
$start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT'] = $output
$start.Environment['TWINEPLAYER_NATIVE_SMOKE_REOPENS'] = [string]$ReopenCycles
if($Keyboard){$start.Environment['TWINEPLAYER_NATIVE_KEYBOARD_SMOKE']='1';$start.Environment['TWINEPLAYER_NATIVE_KEYBOARD_SAVE_FIXTURE']=Join-Path $repo 'native_windows\fixtures\sugarcube1\legacy-sugarcube1.html'}
$start.Environment['TWINEPLAYER_NATIVE_RESOURCE_LINK_FIXTURE'] = Join-Path $resourceFixture 'scope.html'
$process = [Diagnostics.Process]::Start($start)
if (-not $process.WaitForExit($TimeoutSeconds * 1000)) { $process.Kill(); throw "Smoke run timed out; inspect $root" }
if (-not (Test-Path -LiteralPath $output)) { throw "Native app exited $($process.ExitCode) without a report; inspect $root" }
$report = Get-Content -LiteralPath $output -Raw | ConvertFrom-Json
Write-Output "REPORT=$output"
if (-not $report.passed) { throw $report.error }
Write-Output "PASS native WebView2 playback/storage/assets/missing-file smoke: $($report.results.Count) stories"
