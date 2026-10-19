[CmdletBinding()]
param([Parameter(Mandatory)][string]$Installer, [string]$PreviousInstaller = '')
$ErrorActionPreference = 'Stop'
$Installer = (Resolve-Path -LiteralPath $Installer).Path
$provenance = Get-Content -Raw -LiteralPath "$Installer.provenance.json" | ConvertFrom-Json
if ((Get-FileHash -LiteralPath $Installer).Hash -ne $provenance.sha256) { throw 'Installer provenance hash mismatch.' }
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$root = Join-Path $repo ('artifacts\native-installer-test-' + [Guid]::NewGuid().ToString('N'))
$install = Join-Path $root 'Installed App'
$registration = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{B29F972B-8A70-4F5A-A457-A7E7D2247689}_is1'
$menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'TwinePlayer.lnk'
$desktop = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'TwinePlayer.lnk'
# Exercise the actual shipping identity, but never replace an existing install.
if ((Test-Path $registration) -or (Test-Path -LiteralPath $menu) -or (Test-Path -LiteralPath $desktop) -or
    (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Programs')) 'TwinePlayer Native.lnk')) -or
    (Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'TwinePlayer Native.lnk'))) {
    throw 'An existing native installation or shortcut is present. Use a disposable Windows user for this test.'
}
New-Item -ItemType Directory -Path $root | Out-Null
$data = Join-Path $root 'user-data'
$saves = Join-Path $root 'games\story_saves'
New-Item -ItemType Directory -Path $data, $saves | Out-Null
$sentinels = @( (Join-Path $data 'library-sentinel'), (Join-Path $saves 'existing.save') )
foreach ($file in $sentinels) { [IO.File]::WriteAllText($file, 'PRESERVE EXISTING USER DATA') }
$hashes = @{}
foreach ($file in $sentinels) { $hashes[$file] = (Get-FileHash -LiteralPath $file).Hash }
function Invoke-Setup([string]$Executable, [string[]]$Arguments) {
    $process = Start-Process -FilePath $Executable -ArgumentList $Arguments -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(180000)) { throw "Installer process timed out: $($process.Id)" }
    if ($process.ExitCode -ne 0) { throw "Installer exit code: $($process.ExitCode)" }
}
function Assert-Payload {
    if ((Get-FileHash -LiteralPath (Join-Path $install 'SHA256.json')).Hash -ne $provenance.payloadManifestSha256) {
        throw 'Installed manifest differs from the packaged release.'
    }
    $manifest = @(Get-Content -Raw -LiteralPath (Join-Path $install 'SHA256.json') | ConvertFrom-Json)
    foreach ($entry in $manifest) {
        $file = Join-Path $install $entry.path
        if ((Get-Item -LiteralPath $file).Length -ne $entry.bytes -or
            (Get-FileHash -LiteralPath $file).Hash -ne $entry.sha256) { throw "Installed payload mismatch: $($entry.path)" }
    }
    return $manifest.Count
}
$previousData = $env:TWINEPLAYER_NATIVE_DATA_ROOT
try {
    $env:TWINEPLAYER_NATIVE_DATA_ROOT = $data
    if ($PreviousInstaller) {
        Invoke-Setup (Resolve-Path -LiteralPath $PreviousInstaller).Path @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TASKS=desktopicon',
            ('/DIR="' + $install + '"'), ('/LOG="' + (Join-Path $root 'preview-install.log') + '"'))
        if (-not (Test-Path $registration)) { throw 'Previous installer did not register the upgrade identity.' }
        $legacyMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'TwinePlayer Native.lnk'
        if (-not (Test-Path -LiteralPath $legacyMenu)) { throw 'Preview shortcut is missing before upgrade.' }
        $passes = @('upgrade','reinstall')
    } else { $passes = @('install','reinstall') }
    foreach ($pass in $passes) {
        $arguments = @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/TASKS=desktopicon',('/LOG="' + (Join-Path $root "$pass.log") + '"'))
        if ($pass -eq 'install') { $arguments += ('/DIR="' + $install + '"') }
        Invoke-Setup $Installer $arguments
        $fileCount = Assert-Payload
        $registered = Get-ItemProperty $registration
        if ($registered.DisplayName -ne 'TwinePlayer 1.0.0' -or $registered.DisplayVersion -ne '1.0.0') { throw 'Installer still has preview product/version branding.' }
        if ($registered.InstallLocation.TrimEnd('\') -ne $install -or
            -not (Test-Path -LiteralPath $menu) -or -not (Test-Path -LiteralPath $desktop)) { throw 'Installation registration or shortcuts are missing.' }
        if (-not (Select-String -LiteralPath (Join-Path $root "$pass.log") -SimpleMatch 'WebView2 Runtime is already installed; bootstrapper skipped.' -Quiet)) {
            throw 'Expected the existing WebView2 Runtime to be reused on this host.'
        }
        $shell = New-Object -ComObject WScript.Shell
        foreach ($link in @($menu, $desktop)) {
            if ($shell.CreateShortcut($link).TargetPath -ne (Join-Path $install 'TwinePlayer.Native.exe')) { throw 'Shortcut points to the wrong executable.' }
        }
        Write-Output "PASS $pass, $fileCount application hashes, registration and shortcuts"
        if ($PreviousInstaller -and (Test-Path -LiteralPath $legacyMenu)) { throw 'Upgrade left the obsolete preview shortcut.' }
    }
    & (Join-Path $PSScriptRoot 'run-deployment-smoke.ps1') -Executable (Join-Path $install 'TwinePlayer.Native.exe')
    # In addition to app data and external saves, unowned files inside the install
    # directory must survive; uninstall must not use a wildcard directory delete.
    $unowned = Join-Path $install 'user-created-file.txt'
    [IO.File]::WriteAllText($unowned, 'PRESERVE UNOWNED FILE')
    $hashes[$unowned] = (Get-FileHash -LiteralPath $unowned).Hash
    $uninstaller = Join-Path $install 'unins000.exe'
    Invoke-Setup $uninstaller @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/LOG="' + (Join-Path $root 'uninstall.log') + '"'))
    if ((Test-Path $registration) -or (Test-Path -LiteralPath $menu) -or (Test-Path -LiteralPath $desktop) -or
        (Test-Path -LiteralPath (Join-Path $install 'TwinePlayer.Native.exe'))) { throw 'Uninstall left registered application files or shortcuts.' }
    foreach ($file in $hashes.Keys) {
        if ((Get-FileHash -LiteralPath $file).Hash -ne $hashes[$file]) { throw "User file changed: $file" }
    }
    $report = [ordered]@{passed=$true; installer=$Installer; sha256=(Get-FileHash -LiteralPath $Installer).Hash;
        applicationHashes=$fileCount; install=$true; upgradedFromPreview=[bool]$PreviousInstaller; reinstall=$true; shortcuts=$true; installedDeploymentChecks=4;
        uninstall=$true; preservedUserFiles=$hashes.Count; missingRuntimeInstall='not exercised on this host';
        notes='Silent lifecycle in an isolated install path, using the shipping AppId. Default-path visual and clean-machine testing are not inferred.'}
    $report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'report.json') -Encoding utf8
    Write-Output "PASS uninstall and user data preservation: $root"
} finally { $env:TWINEPLAYER_NATIVE_DATA_ROOT = $previousData }
