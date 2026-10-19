[CmdletBinding()]
param([string]$Executable='')
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(-not $Executable){$Executable=Join-Path $repo 'native_windows\src\TwinePlayer.App\bin\Release\net10.0-windows10.0.26100.0\win-x64\TwinePlayer.Native.exe'}
$root=Join-Path $repo ('artifacts\native-save-permission-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$game=Join-Path $root 'ReadOnlyStory.html'
Copy-Item -LiteralPath (Join-Path $repo 'native_windows\fixtures\sugarcube1\legacy-sugarcube1.html') -Destination $game
[IO.File]::SetAttributes($game,[IO.FileAttributes]::ReadOnly)
$gameHash=(Get-FileHash -LiteralPath $game).Hash
$saves=Join-Path $root 'ReadOnlyStory_saves';New-Item -ItemType Directory -Path $saves | Out-Null
$old=Join-Path $saves 'old.save';Set-Content -LiteralPath $old -Value 'existing-progress'
$oldHash=(Get-FileHash -LiteralPath $old).Hash
$settings=Join-Path $root 'settings.json';$report=Join-Path $root 'capture-report.json'
@{game=$game;mode='capture';filename='forbidden.save'} | ConvertTo-Json | Set-Content -LiteralPath $settings -Encoding utf8
$originalAcl=Get-Acl -LiteralPath $saves
try{
    $testAcl=Get-Acl -LiteralPath $saves
    $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().User,[Security.AccessControl.FileSystemRights]::Write,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Deny)
    $testAcl.AddAccessRule($rule);Set-Acl -LiteralPath $saves -AclObject $testAcl
    $start=[Diagnostics.ProcessStartInfo]::new($Executable);$start.UseShellExecute=$false;$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    $start.Environment['TWINEPLAYER_NATIVE_DATA_ROOT']=Join-Path $root 'data'
    $start.Environment['TWINEPLAYER_NATIVE_SAVE_SMOKE_INPUT']=$settings
    $start.Environment['TWINEPLAYER_NATIVE_SMOKE_OUTPUT']=$report
    $process=[Diagnostics.Process]::Start($start)
    if(-not $process.WaitForExit(30000)){$process.Kill();throw 'Save-permission test timed out.'}
    $result=Get-Content -Raw -LiteralPath $report | ConvertFrom-Json
    if($result.passed -or $result.error -notmatch 'UnauthorizedAccessException'){throw "Expected an access-denied save report: $($result.error)"}
}finally{Set-Acl -LiteralPath $saves -AclObject $originalAcl}
if((Get-FileHash -LiteralPath $game).Hash -ne $gameHash -or (Get-FileHash -LiteralPath $old).Hash -ne $oldHash){throw 'Original story/save bytes changed.'}
if((Get-ChildItem -LiteralPath $saves -File).Count -ne 1){throw 'Failed save left an unexpected file.'}
@{passed=$true;readOnlyStoryOpenedAndCaptured=$true;writeDeniedSaveReported=$true;existingStoryAndSavePreserved=$true;aclRestored=$true} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'report.json') -Encoding utf8
Write-Output "PASS read-only story and write-denied save folder: $root\report.json"
