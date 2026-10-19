[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RealStory,
    [string]$Executable = '',
    [string]$DartExecutable = ''
)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if (-not $Executable) { $Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe' }
$root=Join-Path $repo ('artifacts\native-save-smoke-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$original=(Resolve-Path -LiteralPath $RealStory).Path
$game=Join-Path $root 'PrivateTestGame.html'
# Test only the self-contained game copy; originals and their sidecars are read-only.
Copy-Item -LiteralPath $original -Destination $game
$sourceHash=(Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash
if (-not $DartExecutable) {
    $DartExecutable=$env:TWINEPLAYER_DART
    if (-not $DartExecutable) {
        $flutterCommand=Get-Command flutter -ErrorAction SilentlyContinue
        if ($flutterCommand) { $DartExecutable=Join-Path (Split-Path $flutterCommand.Source) 'cache\dart-sdk\bin\dart.exe' }
    }
}
if (-not $DartExecutable -or -not (Test-Path -LiteralPath $DartExecutable)) { throw 'Set TWINEPLAYER_DART or pass -DartExecutable to the installed Dart SDK executable.' }
foreach ($mode in @('capture','restore','native-dialog','flutter-service')) {
    $settings=Join-Path $root 'settings.json'
    $report=Join-Path $root "$mode-report.json"
    $filename=if ($mode -eq 'flutter-service') {'flutter-service.save'} else {'native-phase2.save'}
    @{game=$game;mode=$mode;filename=$filename} | ConvertTo-Json | Set-Content -LiteralPath $settings -Encoding utf8
    $start=[Diagnostics.ProcessStartInfo]::new($Executable)
    $start.UseShellExecute=$false
    $start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    $start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $root 'data'
    $start.Environment['TWINEPLAYER_NATIVE_SAVE_SMOKE_INPUT']=$settings
    $start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$report
    $process=[Diagnostics.Process]::Start($start)
    if (-not $process.WaitForExit(60000)) { $process.Kill(); throw "Save smoke timed out: $root" }
    if (-not (Test-Path -LiteralPath $report)) { throw "Save smoke exited without report: $root" }
    $result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
    if (-not $result.passed) { throw $result.error }
    Write-Output "PASS real SugarCube $mode ($report)"
    if ($mode -eq 'capture') {
        & $DartExecutable "--packages=$repo\flutter_app\.dart_tool\package_config.json" (Join-Path $PSScriptRoot 'flutter-save-compat.dart') $game (Join-Path $root 'capture-payload.bin') 'flutter-service.save'
        if ($LASTEXITCODE -ne 0) { throw 'Flutter SaveService compatibility fixture generation failed.' }
    }
}
if ((Get-FileHash -LiteralPath $original -Algorithm SHA256).Hash -ne $sourceHash) { throw 'Original story changed during smoke' }
Write-Output "SAVE_SMOKE_ROOT=$root"
