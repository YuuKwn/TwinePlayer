[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PayloadDirectory,
    [Parameter(Mandatory)][string]$CompilerPath,
    [Parameter(Mandatory)][string]$BootstrapperPath,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9._-]+$')][string]$ReleaseTag,
    [ValidatePattern('^\d+\.\d+\.\d+$')][string]$AppVersion = '1.0.0'
)
$ErrorActionPreference = 'Stop'
$PayloadDirectory = (Resolve-Path -LiteralPath $PayloadDirectory).Path
$CompilerPath = (Resolve-Path -LiteralPath $CompilerPath).Path
$BootstrapperPath = (Resolve-Path -LiteralPath $BootstrapperPath).Path
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
foreach ($value in @($PayloadDirectory, $CompilerPath, $BootstrapperPath, $OutputDirectory)) {
    if ($value.Contains('"') -or $value.Contains("`n") -or $value.Contains("`r")) { throw 'Invalid build path.' }
}
if ($OutputDirectory.StartsWith($PayloadDirectory + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $OutputDirectory -eq $PayloadDirectory) { throw 'Installer output must be outside the immutable payload.' }
$identity = Get-Content -Raw -LiteralPath (Join-Path $PayloadDirectory 'build-identity.json') | ConvertFrom-Json
$manifest = @(Get-Content -Raw -LiteralPath (Join-Path $PayloadDirectory 'SHA256.json') | ConvertFrom-Json)
$prefix = $PayloadDirectory.TrimEnd('\') + '\'
$expected = @('SHA256.json')
foreach ($entry in $manifest) {
    $file = [IO.Path]::GetFullPath((Join-Path $PayloadDirectory $entry.path))
    if (-not $file.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Invalid payload path: $($entry.path)" }
    if ((Get-Item -LiteralPath $file).Length -ne $entry.bytes -or
        (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Payload mismatch: $($entry.path)" }
    $expected += $entry.path.Replace('/', '\')
}
$actual = @(Get-ChildItem -LiteralPath $PayloadDirectory -File -Recurse | ForEach-Object { $_.FullName.Substring($prefix.Length) })
if (Compare-Object ($expected | Sort-Object -Unique) ($actual | Sort-Object)) { throw 'Unlisted or missing payload files.' }
if (-not (Test-Path -LiteralPath (Join-Path $PayloadDirectory 'TwinePlayer.Native.exe'))) { throw 'Native executable is missing.' }
foreach ($tool in @(@{Path=$CompilerPath; Publisher='Pyrsys B.V.'}, @{Path=$BootstrapperPath; Publisher='Microsoft Corporation'})) {
    $signature = Get-AuthenticodeSignature -LiteralPath $tool.Path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notlike "*CN=$($tool.Publisher),*") {
        throw "Invalid publisher signature: $($tool.Path)"
    }
}
$compilerVersion = (& $CompilerPath --version | Out-String).Trim()
if ([Version]$compilerVersion -lt [Version]'7.1.0') { throw 'Inno Setup 7.1.0 or later is required.' }
$displayVersion = $ReleaseTag -replace '^(native-)?v', ''
$name = "TwinePlayer-$displayVersion-windows-x64-Setup"
$installer = Join-Path $OutputDirectory "$name.exe"
if (Test-Path -LiteralPath $installer) { throw 'Refusing to overwrite an existing installer.' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
& $CompilerPath /Qp "/DPayloadDirectory=$PayloadDirectory" "/DBootstrapperPath=$BootstrapperPath" `
    "/DOutputDirectory=$OutputDirectory" "/DInstallerName=$name" "/DAppVersion=$AppVersion" `
    "/DDisplayVersion=$displayVersion" (Join-Path $PSScriptRoot '..\installer\TwinePlayer.Native.iss')
if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed: $LASTEXITCODE" }
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$provenance = [ordered]@{
    installer = [IO.Path]::GetFileName($installer)
    sha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
    bytes = (Get-Item -LiteralPath $installer).Length
    releaseTag = $ReleaseTag
    createdUtc = [DateTime]::UtcNow.ToString('o')
    installerSourceCommit = (& git -C $sourceRoot rev-parse HEAD)
    installerSources = @('native_windows/installer/TwinePlayer.Native.iss','native_windows/tools/package-installer.ps1') | ForEach-Object {
        @{path=$_; sha256=(Get-FileHash -LiteralPath (Join-Path $sourceRoot $_) -Algorithm SHA256).Hash}
    }
    applicationBuild = $identity
    payloadManifestSha256 = (Get-FileHash -LiteralPath (Join-Path $PayloadDirectory 'SHA256.json') -Algorithm SHA256).Hash
    payloadFiles = $actual.Count
    compilerVersion = $compilerVersion
    compilerSha256 = (Get-FileHash -LiteralPath $CompilerPath -Algorithm SHA256).Hash
    bootstrapperVersion = (Get-Item -LiteralPath $BootstrapperPath).VersionInfo.ProductVersion
    bootstrapperSha256 = (Get-FileHash -LiteralPath $BootstrapperPath -Algorithm SHA256).Hash
    signed = $false
}
$provenance | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath "$installer.provenance.json" -Encoding utf8
"$($provenance.sha256)  $($provenance.installer)" | Set-Content -LiteralPath "$installer.sha256" -Encoding ascii
Write-Output $installer
