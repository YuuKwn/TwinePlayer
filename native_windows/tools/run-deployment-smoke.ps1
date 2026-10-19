[CmdletBinding()]
param([string]$Executable='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$root=Join-Path $repo ('artifacts\native-deployment-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
foreach($mode in @('fresh','unavailable-runtime','write-denied-data','profile-redirect')){
    $reportPath=Join-Path $root "$mode.json"
    $start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    $start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $root $mode
    $start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$reportPath
    $start.Environment['TWINEPLAYER_NATIVE_DEPLOYMENT_STORY']=Join-Path $repo 'native_windows\fixtures\local-assets\local-assets.html'
    if($mode -eq 'unavailable-runtime'){
        $start.Environment['TWINEPLAYER_NATIVE_EXPECT_MISSING_RUNTIME']='1'
        $start.Environment['WEBVIEW2_BROWSER_EXECUTABLE_FOLDER']=Join-Path $root 'deliberately-absent-runtime'
    }
    $profileSentinel=$null
    if($mode -eq 'profile-redirect'){
        $legacy=Join-Path $root 'disposable-legacy-profile';New-Item -ItemType Directory -Path $legacy | Out-Null
        $profileSentinel=Join-Path $legacy 'sentinel.txt';Set-Content -LiteralPath $profileSentinel -Value 'PRESERVE-LEGACY-PROFILE-SENTINEL'
        $sentinelHash=(Get-FileHash -LiteralPath $profileSentinel).Hash
        $start.Environment['WEBVIEW2_USER_DATA_FOLDER']=$legacy
        $start.Environment['TWINEPLAYER_NATIVE_EXPECT_PROFILE_REDIRECT']='1'
    }
    $deniedFolder=Join-Path $root $mode
    $originalAcl=$null
    try {
        if($mode -eq 'write-denied-data'){
            New-Item -ItemType Directory -Path $deniedFolder | Out-Null
            $originalAcl=Get-Acl -LiteralPath $deniedFolder
            $testAcl=Get-Acl -LiteralPath $deniedFolder
            $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
            $rule=[Security.AccessControl.FileSystemAccessRule]::new($sid,[Security.AccessControl.FileSystemRights]::Write,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Deny)
            $testAcl.AddAccessRule($rule);Set-Acl -LiteralPath $deniedFolder -AclObject $testAcl
            $start.Environment['TWINEPLAYER_NATIVE_EXPECT_DENIED_DATA']='1'
        }
        $process=[Diagnostics.Process]::Start($start)
        if(-not $process.WaitForExit(30000)){$process.Kill();throw "Deployment check timed out: $mode"}
    } finally { if($originalAcl){Set-Acl -LiteralPath $deniedFolder -AclObject $originalAcl} }
    $report=Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
    if(-not $report.passed){throw $report.error}
    if($profileSentinel -and ((Get-FileHash -LiteralPath $profileSentinel).Hash -ne $sentinelHash -or @(Get-ChildItem -LiteralPath (Split-Path $profileSentinel) -File -Recurse).Count -ne 1)){throw 'The refused legacy-profile target was modified.'}
    Write-Output "PASS $mode : $reportPath"
}
