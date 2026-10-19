[CmdletBinding()]
param([string]$Executable='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$root=Join-Path $repo ('artifacts\native-startup-smoke-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$dataPath=Join-Path $root 'existing-user-file'
Set-Content -LiteralPath $dataPath -Value 'PRESERVE-THIS-EXISTING-FILE' -Encoding utf8
$before=(Get-FileHash -LiteralPath $dataPath).Hash
$reportPath=Join-Path $root 'report.json'
$start=[Diagnostics.ProcessStartInfo]::new($Executable)
$start.UseShellExecute=$false
$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=$dataPath
$start.Environment['TWINEPLAYER_NATIVE_STARTUP_REPORT']=$reportPath
$process=[Diagnostics.Process]::Start($start)
if(-not $process.WaitForExit(20000)){$process.Kill();throw 'Startup failure test timed out.'}
$report=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
if($process.ExitCode -ne 1 -or -not $report.startupFailed -or $report.category -ne 'data-folder'){throw 'Startup failure was not reported correctly.'}
if((Get-FileHash -LiteralPath $dataPath).Hash -ne $before){throw 'Existing data path was modified.'}
Write-Output "PASS controlled startup data-path error; original file preserved: $reportPath"
