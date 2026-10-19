[CmdletBinding()]
param([Parameter(Mandatory)][string]$Game,[Parameter(Mandatory)][string]$Save,[string]$Executable='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$Game=(Resolve-Path -LiteralPath $Game).Path;$Save=(Resolve-Path -LiteralPath $Save).Path
$gameHash=(Get-FileHash -LiteralPath $Game).Hash;$saveHash=(Get-FileHash -LiteralPath $Save).Hash
$root=Join-Path $repo ('artifacts\native-existing-save-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$copy=Join-Path $root 'PrivateTestGame.html';Copy-Item -LiteralPath $Game -Destination $copy
$saves=Join-Path $root 'PrivateTestGame_saves';New-Item -ItemType Directory -Path $saves | Out-Null
$saveCopy=Join-Path $saves 'existing-export.save';Copy-Item -LiteralPath $Save -Destination $saveCopy
$settings=Join-Path $root 'settings.json';$reportPath=Join-Path $root 'report.json'
@{game=$copy;mode='existing-save';filename='existing-export.save'} | ConvertTo-Json | Set-Content -LiteralPath $settings -Encoding utf8
$start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $root 'data'
$start.Environment['TWINEPLAYER_NATIVE_SAVE_SMOKE_INPUT']=$settings
$start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$reportPath
$process=[Diagnostics.Process]::Start($start)
if(-not $process.WaitForExit(60000)){$process.Kill();throw "Existing export test timed out: $root"}
if((Get-FileHash -LiteralPath $Game).Hash -ne $gameHash -or (Get-FileHash -LiteralPath $Save).Hash -ne $saveHash -or (Get-FileHash -LiteralPath $saveCopy).Hash -ne $saveHash){throw 'An original or copied input changed.'}
$report=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
if(-not $report.passed){throw $report.error}
Write-Output "PASS existing export restored distinct game state; original/copied save bytes preserved: $reportPath"
