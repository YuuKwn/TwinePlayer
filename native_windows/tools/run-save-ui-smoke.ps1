[CmdletBinding()]
param([string]$Executable='', [string[]]$ExtraStories=@())
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$root=Join-Path $repo ('artifacts\native-save-ui-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$stories=@((Join-Path $repo 'native_windows\fixtures\sugarcube1\legacy-sugarcube1.html'),(Join-Path $repo 'test\fixtures\story-assistance-official\sugarcube_cssselectors_example.html'))+$ExtraStories
$index=0
foreach($story in $stories){
 $index++; $case=Join-Path $root "case-$index";New-Item -ItemType Directory -Path $case | Out-Null
 $source=(Resolve-Path -LiteralPath $story).Path;$hash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
 $game=Join-Path $case 'Game.html';Copy-Item -LiteralPath $source -Destination $game
 $inputPath=Join-Path $case 'settings.json';$report=Join-Path $case 'report.json'
 @{game=$game;mode='native-ui';filename='native-ui.save'} | ConvertTo-Json | Set-Content -LiteralPath $inputPath -Encoding utf8
 $start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
 $start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $case 'data'
 $start.Environment['TWINEPLAYER_NATIVE_SAVE_SMOKE_INPUT']=$inputPath
 $start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$report
 $process=[Diagnostics.Process]::Start($start)
 if(-not $process.WaitForExit(60000)){$process.Kill();throw "Native save UI smoke timed out: $case"}
 if(-not(Test-Path -LiteralPath $report)){throw "Missing native save UI report: $case"}
 $result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
 if(-not $result.passed){throw $result.error}
 if((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $hash){throw 'Original story changed'}
 Write-Output "PASS native save UI case $index : $report"
}
Write-Output "SAVE_UI_ROOT=$root"
