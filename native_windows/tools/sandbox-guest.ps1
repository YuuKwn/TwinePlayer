# Runs only inside the disposable Windows Sandbox configured by run-sandbox-smoke.ps1.
$ErrorActionPreference='Stop'
$guestMarker=Get-Content -Raw -LiteralPath 'C:\Input\guest-only.json' | ConvertFrom-Json
if([Security.Principal.WindowsIdentity]::GetCurrent().Name.Split('\')[-1] -ne 'WDAGUtilityAccount' -or [Environment]::MachineName -eq $guestMarker.hostComputer){throw 'This script runs only inside its disposable Windows Sandbox guest.'}
$output='C:\Results'
function Save-InstallerDiagnostics {
    $roots=@($env:TEMP,"$env:SystemRoot\Temp","$env:ProgramData\Microsoft\EdgeUpdate\Log","$env:LOCALAPPDATA\Microsoft\EdgeUpdate\Log")
    $files=@()
    foreach($directory in $roots){
        if(-not (Test-Path -LiteralPath $directory)){continue}
        foreach($file in @(Get-ChildItem -LiteralPath $directory -File -Filter '*.log' | Where-Object {$_.Name -match 'edge|install|update'} | Select-Object -First 10)){
            $destination=Join-Path $output ('installer-'+[Guid]::NewGuid().ToString('N').Substring(0,8)+'-'+$file.Name)
            if($file.Length -le 4MB){Copy-Item -LiteralPath $file.FullName -Destination $destination}else{Get-Content -LiteralPath $file.FullName -Tail 1000 | Set-Content -LiteralPath $destination -Encoding utf8}
            $files+=@{source=$file.FullName;bytes=$file.Length;savedAs=[IO.Path]::GetFileName($destination)}
        }
    }
    @{rootsChecked=$roots;files=$files} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$output\installer-logs.json" -Encoding utf8
}
function Run-App([string]$mode,[hashtable]$environment,[int]$timeout=90){
    $report=Join-Path $output "$mode.json"
    foreach($name in $environment.Keys){[Environment]::SetEnvironmentVariable($name,$environment[$name],'Process')}
    $env:TWINEPLAYER_NATIVE_SMOKE_OUTPUT=$report
    $process=Start-Process -FilePath $script:executable -PassThru -WindowStyle Hidden
    if(-not $process.WaitForExit($timeout*1000)){$process.Kill();throw "Guest test timed out: $mode"}
    foreach($name in $environment.Keys){[Environment]::SetEnvironmentVariable($name,$null,'Process')}
    if(-not (Test-Path -LiteralPath $report)){throw "Guest app exited $($process.ExitCode) without a report: $mode"}
    return Get-Content -Raw -LiteralPath $report | ConvertFrom-Json
}
try{
    @{startedUtc=[DateTime]::UtcNow.ToString('O');os=[Environment]::OSVersion.Version.ToString();user=[Security.Principal.WindowsIdentity]::GetCurrent().Name;networkAdapters=@(Get-NetAdapter | Select-Object Name,Status);browserExecutableOverride=$env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER;userDataOverride=$env:WEBVIEW2_USER_DATA_FOLDER} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$output\environment.json" -Encoding utf8
    Expand-Archive -LiteralPath 'C:\Input\portable.zip' -DestinationPath 'C:\Portable'
    $folder=Get-ChildItem -LiteralPath 'C:\Portable' -Directory | Select-Object -First 1
    $script:executable=Join-Path $folder.FullName 'TwinePlayer.Native.exe'
    $manifest=Get-Content -Raw -LiteralPath (Join-Path $folder.FullName 'SHA256.json') | ConvertFrom-Json
    foreach($file in $manifest){if((Get-FileHash -LiteralPath (Join-Path $folder.FullName $file.path)).Hash -ne $file.sha256){throw "Guest extracted hash mismatch: $($file.path)"}}
    $base=@{TWINEPLAYER_NATIVE_DATA_ROOT='C:\TestData\fresh';TWINEPLAYER_NATIVE_DEPLOYMENT_STORY='C:\Fixtures\Native\local-assets\local-assets.html'}
    $fresh=Run-App 'fresh' $base
    if(-not $fresh.passed){throw 'Fresh guest library startup failed.'}
    $base.TWINEPLAYER_NATIVE_DATA_ROOT='C:\TestData\prerequisite'
    $base.TWINEPLAYER_NATIVE_EXPECT_MISSING_RUNTIME='1'
    $prerequisite=Run-App 'runtime-prerequisite' $base
    if($guestMarker.profilePolicyTests){
        # Only this guarded disposable guest's HKCU is changed. Restore each
        # value before any other case; no host policy is read or modified here.
        $key='HKCU:\SOFTWARE\Policies\Microsoft\Edge\WebView2\UserDataFolder'
        if(-not (Test-Path -LiteralPath $key)){New-Item -Path $key -Force | Out-Null}
        foreach($name in @('TwinePlayer.Native.exe','*','UnrelatedApp.exe')){
            $legacy='C:\PolicyProfileProbe';New-Item -ItemType Directory -Path $legacy -Force | Out-Null
            Set-Content -LiteralPath "$legacy\sentinel.txt" -Value 'PRESERVE-GUEST-PROFILE'
            $before=(Get-FileHash -LiteralPath "$legacy\sentinel.txt").Hash
            $policyKey=Get-Item -LiteralPath $key
            $existed=$policyKey.GetValueNames() -contains $name
            $old=if($existed){$policyKey.GetValue($name)}else{$null}
            $oldKind=if($existed){$policyKey.GetValueKind($name)}else{$null}
            $policyKey.Dispose()
            $mode=if($name -eq '*'){'wildcard-policy'}elseif($name -eq 'UnrelatedApp.exe'){'unrelated-policy'}else{'app-policy'}
            try{
                New-ItemProperty -LiteralPath $key -Name $name -Value $legacy -PropertyType String -Force | Out-Null
                $environment=@{TWINEPLAYER_NATIVE_DATA_ROOT="C:\TestData\$mode";TWINEPLAYER_NATIVE_DEPLOYMENT_STORY='C:\Fixtures\Native\local-assets\local-assets.html'}
                if($mode -eq 'unrelated-policy'){$environment.TWINEPLAYER_NATIVE_EXPECT_POLICY_IGNORED='1'}else{$environment.TWINEPLAYER_NATIVE_EXPECT_PROFILE_REDIRECT='1'}
                $policyReport=Run-App $mode $environment
                if(-not $policyReport.passed -or ($mode -eq 'unrelated-policy' -and -not $policyReport.unrelatedPolicyIgnored) -or ($mode -ne 'unrelated-policy' -and -not $policyReport.profileRedirectRefused)){throw "Guest policy test failed: $mode"}
                if((Get-FileHash -LiteralPath "$legacy\sentinel.txt").Hash -ne $before -or @(Get-ChildItem -LiteralPath $legacy -Recurse -File).Count -ne 1){throw 'Guest policy target profile was modified.'}
            }finally{
                if($existed){[Microsoft.Win32.Registry]::SetValue('HKEY_CURRENT_USER\SOFTWARE\Policies\Microsoft\Edge\WebView2\UserDataFolder',$name,$old,$oldKind)}else{Remove-ItemProperty -LiteralPath $key -Name $name}
            }
        }
    }
    # No override: a passing unavailable-runtime check proves actual creation
    # failed in this clean guest, unlike the host's deliberately absent path.
    if($prerequisite.passed -and -not (Test-Path -LiteralPath 'C:\Input\RuntimeInstaller.exe') -and -not (Test-Path -LiteralPath 'C:\RuntimeInput\msedgewebview2.exe')){
        @{passed=$true;scope='Clean guest ZIP extraction/fresh startup and actual unavailable WebView2 remediation';runtimeUnavailable=$true;playback='Not tested: install the documented Runtime prerequisite first';filesVerified=$manifest.Count} | ConvertTo-Json | Set-Content -LiteralPath "$output\result.json" -Encoding utf8
    }else{
        $copiedRuntime=Test-Path -LiteralPath 'C:\RuntimeInput\msedgewebview2.exe'
        if($copiedRuntime){
            Copy-Item -LiteralPath 'C:\RuntimeInput' -Destination 'C:\Runtime' -Recurse
            $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER='C:\Runtime'
            @{diagnosticOnly=$true;version=[Diagnostics.FileVersionInfo]::GetVersionInfo('C:\Runtime\msedgewebview2.exe').ProductVersion;sha256=(Get-FileHash -LiteralPath 'C:\Runtime\msedgewebview2.exe').Hash} | ConvertTo-Json | Set-Content -LiteralPath "$output\copied-runtime.json" -Encoding utf8
        }elseif($prerequisite.passed){
            Copy-Item -LiteralPath 'C:\Input\RuntimeInstaller.exe' -Destination 'C:\RuntimeInstaller.exe'
            $signature=Get-AuthenticodeSignature -LiteralPath 'C:\RuntimeInstaller.exe'
            $memory=Get-CimInstance Win32_OperatingSystem
            @{signatureStatus=[string]$signature.Status;signatureMessage=$signature.StatusMessage;signer=$signature.SignerCertificate.Subject;freeMemoryKiB=$memory.FreePhysicalMemory;totalMemoryKiB=$memory.TotalVisibleMemorySize;systemDriveFreeBytes=(Get-PSDrive C).Free} | ConvertTo-Json | Set-Content -LiteralPath "$output\installer-environment.json" -Encoding utf8
            $install=Start-Process -FilePath 'C:\RuntimeInstaller.exe' -ArgumentList '/silent /install' -WindowStyle Hidden -PassThru
            if(-not $install.WaitForExit(180000)){$install.Kill();throw 'Guest-only offline Runtime installation timed out.'}
            @{exitCode=$install.ExitCode;installerSha256=(Get-FileHash -LiteralPath 'C:\RuntimeInstaller.exe').Hash} | ConvertTo-Json | Set-Content -LiteralPath "$output\runtime-install.json" -Encoding utf8
            if($install.ExitCode -ne 0){
                Save-InstallerDiagnostics
                throw "Guest-only Runtime installation failed: $($install.ExitCode)"
            }
        }
        if($guestMarker.networkForPrerequisite){
            Get-NetAdapter | Where-Object {$_.Status -ne 'Disabled'} | Disable-NetAdapter -Confirm:$false
            $adapters=@(Get-NetAdapter | Select-Object Name,Status)
            if(@($adapters | Where-Object {$_.Status -ne 'Disabled'}).Count){throw 'Guest networking could not be disabled before playback.'}
            @{disabledBeforePlayback=$true;adapters=$adapters} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath "$output\offline-playback.json" -Encoding utf8
        }
        New-Item -ItemType Directory -Path 'C:\Games' | Out-Null
        Copy-Item -LiteralPath 'C:\Fixtures\Official' -Destination 'C:\Games\Official' -Recurse
        Copy-Item -LiteralPath 'C:\Fixtures\Native' -Destination 'C:\Games\Native' -Recurse
        New-Item -ItemType Directory -Path 'C:\Scope','C:\Outside' | Out-Null
        Set-Content -LiteralPath 'C:\Scope\scope.html' -Value '<!doctype html><title>Scope fixture</title>'
        Set-Content -LiteralPath 'C:\Outside\sentinel.txt' -Value 'Sandbox scope sentinel'
        New-Item -ItemType Junction -Path 'C:\Scope\linked' -Value 'C:\Outside' | Out-Null
        New-Item -ItemType Junction -Path 'C:\Scope\scope_saves' -Value 'C:\Outside' | Out-Null
        $stories=@('sugarcube','harlowe','chapbook','snowman') | ForEach-Object {"C:\Games\Official\$($_)_cssselectors_example.html"}
        $stories+= 'C:\Games\Native\local-assets\local-assets.html'
        $stories | ConvertTo-Json | Set-Content -LiteralPath 'C:\stories.json' -Encoding utf8
        $smoke=Run-App 'native-quality' @{TWINEPLAYER_NATIVE_DATA_ROOT='C:\TestData\quality';TWINEPLAYER_NATIVE_SMOKE_INPUT='C:\stories.json';TWINEPLAYER_NATIVE_RESOURCE_LINK_FIXTURE='C:\Scope\scope.html'} 180
        if(-not $smoke.passed){throw $smoke.error}
        @{passed=$true;scope='Clean guest ZIP extraction/fresh startup and offline five-story native quality suite';runtimeInitiallyUnavailable=[bool]$prerequisite.passed;copiedRuntimeDiagnosticOnly=$copiedRuntime;evergreenInstallerValidated=(-not $copiedRuntime -and [bool]$prerequisite.passed);filesVerified=$manifest.Count} | ConvertTo-Json | Set-Content -LiteralPath "$output\result.json" -Encoding utf8
    }
}catch{
    @{passed=$false;error=$_.Exception.ToString()} | ConvertTo-Json | Set-Content -LiteralPath "$output\result.json" -Encoding utf8
}finally{Start-Process -FilePath "$env:SystemRoot\System32\shutdown.exe" -ArgumentList '/s /t 0' -WindowStyle Hidden}
