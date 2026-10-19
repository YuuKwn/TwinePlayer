[CmdletBinding()]
param([Parameter(Mandatory)][string]$CaptureDirectory,[Parameter(Mandatory)][string]$Node,[Parameter(Mandatory)][string]$Dart,[string]$Executable='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$flutter=Join-Path $repo 'artifacts\TwinePlayer-Flutter-BENCHMARK-20261016\twine_player_flutter.exe'
$lines=& $Node (Join-Path $PSScriptRoot 'run-flutter-rollback.js') $CaptureDirectory $flutter --capture-save
if($LASTEXITCODE -ne 0){throw "Actual Flutter capture failed: $lines"}
$line=$lines | Where-Object {$_ -like 'REPORT=*'} | Select-Object -Last 1
if(-not $line){throw 'Flutter capture returned no report.'}
$reportPath=$line.Substring(7);$root=Split-Path $reportPath
$report=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
if(-not $report.passed -or -not $report.flutterCapture){throw 'Flutter capture did not pass.'}
& $Dart "--packages=$repo\flutter_app\.dart_tool\package_config.json" (Join-Path $PSScriptRoot 'flutter-save-compat.dart') $report.roundtripGame (Join-Path $root 'flutter-captured-payload.bin') 'flutter-runtime.save'
if($LASTEXITCODE -ne 0){throw 'Unchanged Flutter SaveService write failed.'}
$settings=Join-Path $root 'native-settings.json';$nativeReport=Join-Path $root 'native-restore.json'
@{game=$report.roundtripGame;mode='restore';filename='flutter-runtime.save';expectFlutterCaptureMarker=$true} | ConvertTo-Json | Set-Content -LiteralPath $settings -Encoding utf8
$start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $root 'native-data'
$start.Environment['TWINEPLAYER_NATIVE_SAVE_SMOKE_INPUT']=$settings
$start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$nativeReport
$process=[Diagnostics.Process]::Start($start)
if(-not $process.WaitForExit(60000)){$process.Kill();throw 'Native restore of actual Flutter capture timed out.'}
$restored=Get-Content -Raw -LiteralPath $nativeReport | ConvertFrom-Json
if(-not $restored.passed -or -not $restored.flutterCaptureMarkerVerified){throw "Actual Flutter-to-native restore failed: $($restored.error)"}
Write-Output "PASS actual Flutter bridge capture + unchanged SaveService + native state restore: $nativeReport"
