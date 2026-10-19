[CmdletBinding()]
param([string]$Executable='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$root=Join-Path $repo ('artifacts\native-shutdown-'+[Guid]::NewGuid().ToString('N'))
foreach($mode in @('capture','load','write-cancel','write-drain')){
    $folder=Join-Path $root $mode;New-Item -ItemType Directory -Path $folder | Out-Null
    $game=Join-Path $folder 'shutdown.html';Set-Content -LiteralPath $game -Value '<!doctype html><title>Shutdown fixture</title><p>Native shutdown test</p>'
    $settings=Join-Path $folder 'settings.json';$reportPath=Join-Path $folder 'report.json'
    @{mode=$mode;game=$game} | ConvertTo-Json | Set-Content -LiteralPath $settings -Encoding utf8
    $start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    $start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $folder 'data'
    $start.Environment['TWINEPLAYER_NATIVE_SHUTDOWN_SMOKE']=$settings
    $start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$reportPath
    $process=[Diagnostics.Process]::Start($start)
    if(-not $process.WaitForExit(30000)){$process.Kill();throw "Shutdown fixture timed out: $mode"}
    $report=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
    if(-not $report.passed -or $process.ExitCode -ne 0){throw "Shutdown failed: $($report | ConvertTo-Json -Compress)"}
    if($mode -in @('capture','load') -and -not $report.canceled){throw 'Pending bridge operation was not canceled.'}
    if($mode.StartsWith('write-')){
        $save=Join-Path $folder 'shutdown_saves\shutdown.save'
        $bytes=[IO.File]::ReadAllBytes($save)
        $original=[Text.Encoding]::UTF8.GetString($bytes) -eq 'original-save'
        $complete=$false
        if($bytes.Length -eq 48*1024*1024){
            $expectedBytes=[byte[]]::new(48*1024*1024);[Array]::Fill[byte]($expectedBytes,120)
            $complete=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)) -eq [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($expectedBytes))
        }
        if(-not $original -and -not $complete){throw 'Shutdown left an incomplete replacement save.'}
        if($mode -eq 'write-drain' -and -not $complete){throw 'Shutdown did not drain the active noncancelable write.'}
        if(Get-ChildItem -LiteralPath (Split-Path $save) -Filter '.twineplayer-*.tmp'){throw 'Shutdown left a temporary save.'}
    }
    Write-Output "PASS $mode : $reportPath"
}
