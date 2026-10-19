[CmdletBinding()]
param([string]$Label = 'phase-0-reference-20261016')
$ErrorActionPreference = 'Stop'
if ($Label -notmatch '^phase-0-reference-[a-zA-Z0-9-]+$') { throw 'Invalid reference artifact label.' }
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$source = Join-Path $repo 'flutter_app\build\windows\x64\runner\Release'
$artifact = Join-Path $repo "artifacts\TwinePlayer-winui-$Label-windows-x64"
if (Test-Path -LiteralPath $artifact) { throw "Artifact already exists; use a new label: $artifact" }
if (-not (Test-Path -LiteralPath (Join-Path $source 'twine_player_flutter.exe'))) { throw 'Build the unchanged Flutter reference first.' }
New-Item -ItemType Directory -Path $artifact | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $artifact -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'native_windows\docs') -Destination (Join-Path $artifact 'migration-docs') -Recurse
@'
PHASE 0 REFERENCE BASELINE — THIS IS THE FLUTTER REFERENCE, NOT WINUI

Run twine_player_flutter.exe to compare the reference behavior. The binary is
rebuilt from unchanged Flutter source at local base c450a3c, version 1.0.0+10.
The migration inventory and contracts are in migration-docs/.
Phase 1 will provide the first WinUI MVP; migration is not complete.

This reference uses normal Flutter app data and game sidecars. Intentional
save/overwrite/delete actions change those files as in the original app.
Keep backups when manually testing existing progress. No private games or
user data are included in this package.
'@ | Set-Content -LiteralPath (Join-Path $artifact 'PHASE-0-REFERENCE-README.txt') -Encoding utf8
$sourceFiles = @(
  'flutter_app\lib\src\twine_player_app.dart',
  'flutter_app\lib\src\services\webview_scripts.dart',
  'flutter_app\lib\src\services\save_service.dart',
  'flutter_app\pubspec.yaml',
  'test\fixtures\story-assistance-official\sugarcube_cssselectors_example.html',
  'test\fixtures\story-assistance-official\harlowe_cssselectors_example.html',
  'test\fixtures\story-assistance-official\chapbook_cssselectors_example.html',
  'test\fixtures\story-assistance-official\snowman_cssselectors_example.html'
)
$identity = [ordered]@{
  phase = 0; label = $Label; application = 'Flutter reference baseline (not WinUI)'
  builtFromBase = 'c450a3c'; version = '1.0.0+10'; packagedUtc = [DateTime]::UtcNow.ToString('O')
  flutter = '3.47.0'; dart = '3.13.0'; webViewRuntime = '155.0.4283.45'
  sourceHashes = @($sourceFiles | ForEach-Object {
    [ordered]@{ path = $_.Replace('\','/'); sha256 = (Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash }
  })
}
$identity | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $artifact 'build-identity.json') -Encoding utf8
$manifest = @(Get-ChildItem -LiteralPath $artifact -Recurse -File | Sort-Object FullName | ForEach-Object {
  [ordered]@{path = $_.FullName.Substring($artifact.Length + 1).Replace('\','/'); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
})
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $artifact 'SHA256.json') -Encoding utf8
$zip = "$artifact.zip"
if (Test-Path -LiteralPath $zip) { throw 'ZIP already exists.' }
Compress-Archive -LiteralPath $artifact -DestinationPath $zip -CompressionLevel Optimal
[ordered]@{zip = [IO.Path]::GetFileName($zip); sha256 = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash; files = $manifest.Count} | ConvertTo-Json | Set-Content -LiteralPath "$zip.sha256.json" -Encoding utf8
Write-Output "EXE=$artifact\twine_player_flutter.exe"
Write-Output "ZIP=$zip"
Write-Output "FILES=$($manifest.Count)"
