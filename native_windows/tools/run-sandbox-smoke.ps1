[CmdletBinding()]
param([Parameter(Mandatory)][string]$Zip,[string]$RuntimeInstaller='',[string]$RuntimeFolder='',[switch]$NetworkForPrerequisite,[switch]$ProfilePolicyTests)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if(Get-Process 'WindowsSandbox*' -ErrorAction SilentlyContinue){throw 'An existing Sandbox session is running. Do not interrupt it for this test.'}
if($RuntimeInstaller -and $RuntimeFolder){throw 'Select either installer validation or copied-runtime diagnosis.'}
if($NetworkForPrerequisite -and -not $RuntimeInstaller){throw 'Prerequisite networking requires the signed Runtime installer.'}
$root=Join-Path $repo ('artifacts\native-sandbox-'+[Guid]::NewGuid().ToString('N'))
$inputFolder=Join-Path $root 'input';$results=Join-Path $root 'results'
New-Item -ItemType Directory -Path $inputFolder,$results | Out-Null
Copy-Item -LiteralPath (Resolve-Path -LiteralPath $Zip).Path -Destination (Join-Path $inputFolder 'portable.zip')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'sandbox-guest.ps1') -Destination $inputFolder
@{hostComputer=[Environment]::MachineName;networkForPrerequisite=[bool]$NetworkForPrerequisite;profilePolicyTests=[bool]$ProfilePolicyTests} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $inputFolder 'guest-only.json') -Encoding utf8
if($RuntimeInstaller){
    $signature=Get-AuthenticodeSignature -LiteralPath $RuntimeInstaller
    if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation,'){throw 'Expected a valid Microsoft-signed offline Runtime installer.'}
    Copy-Item -LiteralPath $RuntimeInstaller -Destination (Join-Path $inputFolder 'RuntimeInstaller.exe')
}
$runtimeMapping=''
if($RuntimeFolder){
    $RuntimeFolder=(Resolve-Path -LiteralPath $RuntimeFolder).Path
    $signature=Get-AuthenticodeSignature -LiteralPath (Join-Path $RuntimeFolder 'msedgewebview2.exe')
    if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation,'){throw 'Expected a valid Microsoft-signed Runtime.'}
    $runtimeMapping='<MappedFolder><HostFolder>'+[Security.SecurityElement]::Escape($RuntimeFolder)+'</HostFolder><SandboxFolder>C:\RuntimeInput</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>'
}
$escape={param($value)[Security.SecurityElement]::Escape($value)}
$networkMode=if($NetworkForPrerequisite){'Enable'}else{'Disable'}
$config=@"
<Configuration>
  <Networking>$networkMode</Networking><vGPU>Disable</vGPU>
  <AudioInput>Disable</AudioInput><VideoInput>Disable</VideoInput>
  <ClipboardRedirection>Disable</ClipboardRedirection><PrinterRedirection>Disable</PrinterRedirection>
  <MemoryInMB>4096</MemoryInMB>
  <MappedFolders>
    $runtimeMapping
    <MappedFolder><HostFolder>$(& $escape $inputFolder)</HostFolder><SandboxFolder>C:\Input</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$(& $escape $results)</HostFolder><SandboxFolder>C:\Results</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$(& $escape (Join-Path $repo 'native_windows\fixtures'))</HostFolder><SandboxFolder>C:\Fixtures\Native</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$(& $escape (Join-Path $repo 'test\fixtures\story-assistance-official'))</HostFolder><SandboxFolder>C:\Fixtures\Official</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
  </MappedFolders>
  <LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\Input\sandbox-guest.ps1</Command></LogonCommand>
</Configuration>
"@
$path=Join-Path $root 'clean-test.wsb';Set-Content -LiteralPath $path -Value $config -Encoding utf8
$process=Start-Process -FilePath "$env:SystemRoot\System32\WindowsSandbox.exe" -ArgumentList ('"'+$path+'"') -WindowStyle Hidden -PassThru
@{launcherPid=$process.Id;startedUtc=[DateTime]::UtcNow.ToString('O');results=$results;zipSha256=(Get-FileHash -LiteralPath (Join-Path $inputFolder 'portable.zip')).Hash} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'launch.json') -Encoding utf8
Write-Output "SANDBOX=$root"
Write-Output "LAUNCHER_PID=$($process.Id)"
