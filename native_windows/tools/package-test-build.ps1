[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidateRange(1,9)][int]$Phase,
    [string]$BuildId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
    [string]$Dotnet = '',
    [string]$Notes = ''
)
$ErrorActionPreference = 'Stop'
if ($BuildId -notmatch '^[a-zA-Z0-9-]+$') { throw 'Invalid build ID.' }
$native = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repo = [IO.Path]::GetFullPath((Join-Path $native '..'))
if (-not $Dotnet) {
    $localSdk = Join-Path $repo 'artifacts\toolchain\dotnet-10.0.402\dotnet.exe'
    $Dotnet = if (Test-Path -LiteralPath $localSdk) { $localSdk } else { 'dotnet' }
}
$artifactName = "TwinePlayer-Native-phase-$Phase-TEST-$BuildId-windows-x64"
$artifact = Join-Path $repo "artifacts\$artifactName"
if (Test-Path -LiteralPath $artifact) { throw 'Artifact exists; choose a new BuildId.' }
$dirty = & git -C $repo status --porcelain -- native_windows docs/winui-native-migration-plan.md
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect native source status.' }
if ($dirty) { throw 'Commit the native phase changes before packaging so the build has exact provenance.' }
$commit = & git -C $repo rev-parse HEAD
Push-Location $native
try {
    $sdkVersion = & $Dotnet --version
    & $Dotnet publish src/TwinePlayer.App/TwinePlayer.App.csproj -c Release -r win-x64 --self-contained true --no-restore -o $artifact
    if ($LASTEXITCODE -ne 0) { throw 'Native portable publish failed.' }
} finally { Pop-Location }
if (-not (Test-Path -LiteralPath (Join-Path $artifact 'TwinePlayer.Native.pri'))) { throw 'Portable application PRI missing.' }
$version = [Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $artifact 'TwinePlayer.Native.exe')).ProductVersion
if ($version -notlike "*-phase$Phase-test*") { throw "Build identity doesn't match Phase $Phase : $version" }
Copy-Item -LiteralPath (Join-Path $native "docs\PHASE-$Phase.md") -Destination $artifact
if ($Notes) { Copy-Item -LiteralPath (Join-Path $native $Notes) -Destination $artifact }
$testNotes = if ($Notes) { [IO.Path]::GetFileName($Notes) } else { "PHASE-$Phase.md" }
@"
TWINEPLAYER NATIVE — PHASE $Phase TEST BUILD
Build: $BuildId
Source commit: $commit
Version: $version

Extract the entire folder and run TwinePlayer.Native.exe. Keep all DLLs and
assets together. Requires Windows 11 build 22621 or later and the Microsoft
Edge WebView2 Evergreen Runtime. If the browser cannot start, install/repair
that runtime. .NET and Windows App SDK are included.

This is a marked native test build. Read $testNotes for implemented
features and unverified checks. Earlier phase ZIPs remain available.
Native data: %LOCALAPPDATA%\TwinePlayer.Native (separate from Flutter and WPF).
Original game files and adjacent save files remain at their current locations.
No private games, personal user data or browser profiles are included.
"@ | Set-Content -LiteralPath (Join-Path $artifact 'TEST-BUILD.txt') -Encoding utf8
$sources = & git -C $repo ls-files native_windows docs/winui-native-migration-plan.md shared/webview/twine-bridge.js flutter_app/assets/input_lab.html
$identity = [ordered]@{
    phase=$Phase; buildId=$BuildId; version=$version; commit=$commit
    packagedUtc=[DateTime]::UtcNow.ToString('O'); sdk=$sdkVersion
    sourceHashes=@($sources | ForEach-Object { [ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash} })
}
$identity | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $artifact 'build-identity.json') -Encoding utf8
$manifest = @(Get-ChildItem -LiteralPath $artifact -File -Recurse | Sort-Object FullName | ForEach-Object {
    [ordered]@{path=$_.FullName.Substring($artifact.Length+1).Replace('\','/');bytes=$_.Length;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
})
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $artifact 'SHA256.json') -Encoding utf8
$zip = "$artifact.zip"
Compress-Archive -LiteralPath $artifact -DestinationPath $zip -CompressionLevel Optimal
[ordered]@{file=[IO.Path]::GetFileName($zip);sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash} | ConvertTo-Json | Set-Content -LiteralPath "$zip.sha256.json" -Encoding utf8
Write-Output "EXE=$artifact\TwinePlayer.Native.exe"
Write-Output "ZIP=$zip"
Write-Output "FILES=$($manifest.Count)"
