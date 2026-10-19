[CmdletBinding()]
param([string]$Executable='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$root=Join-Path $repo ('artifacts\native-ux-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$inputPath=Join-Path $root 'stories.json';$reportPath=Join-Path $root 'report.json'
@('test\fixtures\story-assistance-official\sugarcube_cssselectors_example.html','test\fixtures\story-assistance-official\harlowe_cssselectors_example.html','native_windows\fixtures\local-assets\local-assets.html') | ForEach-Object {Join-Path $repo $_} | ConvertTo-Json | Set-Content -LiteralPath $inputPath -Encoding utf8
$start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false
$start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $root 'data'
$start.Environment['TWINEPLAYER_NATIVE_UX_SMOKE']=$inputPath
$start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$reportPath
$process=[Diagnostics.Process]::Start($start)
if(-not $process.WaitForExit(90000)){$process.Kill();throw "UX smoke timed out: $root"}
if(-not (Test-Path -LiteralPath $reportPath)){throw "UX smoke exited without report: $root"}
$report=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
Write-Output "REPORT=$reportPath"
if(-not $report.passed){throw $report.error}
Write-Output "PASS native library/search/selection/reflow/settings; $($report.captures.Count) XAML layout renders"
