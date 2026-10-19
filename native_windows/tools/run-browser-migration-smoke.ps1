[CmdletBinding()]
param([Parameter(Mandatory)][string]$SourceProfile,[Parameter(Mandatory)][string]$Game,[string]$Executable='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$artifacts=Join-Path $repo 'artifacts'
$SourceProfile=(Resolve-Path -LiteralPath $SourceProfile).Path
$Game=(Resolve-Path -LiteralPath $Game).Path
if(-not $SourceProfile.StartsWith($artifacts+'\',[StringComparison]::OrdinalIgnoreCase) -or -not $Game.StartsWith($artifacts+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Automated migration tests require disposable source profiles and games under artifacts.'}
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$root=Join-Path $artifacts ('native-browser-migration-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$inputPath=Join-Path $root 'settings.json';$reportPath=Join-Path $root 'report.json'
@{sourceProfile=$SourceProfile;game=$Game} | ConvertTo-Json | Set-Content -LiteralPath $inputPath -Encoding utf8
$start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $root 'data'
$start.Environment['TWINEPLAYER_NATIVE_BROWSER_MIGRATION_SMOKE']=$inputPath
$start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$reportPath
$process=[Diagnostics.Process]::Start($start)
if(-not $process.WaitForExit(90000)){$process.Kill();throw "Migration smoke timed out; inspect $root"}
$report=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
Write-Output "REPORT=$reportPath"
if(-not $report.passed){throw $report.error}
Write-Output 'PASS actual legacy localStorage/IndexedDB/cookies/game progress migration; source unchanged; native conflicts retained; repeat import safe.'
