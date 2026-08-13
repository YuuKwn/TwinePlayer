[CmdletBinding()]
param(
  [string]$FlutterExecutable = 'flutter',
  [switch]$SkipBuild,
  [switch]$SkipZip,
  [ValidateRange(0, 10)]
  [int]$SmokeCycles = 0
)

$ErrorActionPreference = 'Stop'
$flutterRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (Resolve-Path (Join-Path $flutterRoot '..')).Path
$releaseRoot = Join-Path $flutterRoot 'build\windows\x64\runner\Release'
$artifactRoot = Join-Path $repositoryRoot 'artifacts'
$artifactName = 'TwinePlayer-touch-phases-0-10-windows-x64'
$artifactDirectory = Join-Path $artifactRoot $artifactName
$zipPath = Join-Path $artifactRoot "$artifactName.zip"

function Assert-SafeArtifactPath([string]$Path) {
  $resolvedParent = [IO.Path]::GetFullPath($artifactRoot).TrimEnd('\') + '\'
  $resolvedPath = [IO.Path]::GetFullPath($Path)
  if (-not $resolvedPath.StartsWith($resolvedParent, [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetFileName($resolvedPath) -ne $artifactName) {
    throw "Refusing to write outside the exact generated artifact path: $resolvedPath"
  }
}

Assert-SafeArtifactPath $artifactDirectory
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null

if (-not $SkipBuild) {
  Push-Location $flutterRoot
  try {
    & $FlutterExecutable build windows --release --build-name 1.0.0 --build-number 10
    if ($LASTEXITCODE -ne 0) { throw "Flutter Windows release build failed ($LASTEXITCODE)." }
  } finally {
    Pop-Location
  }
}

$executable = Join-Path $releaseRoot 'twine_player_flutter.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
  throw "Release executable not found: $executable"
}

# Only replace the exact generated artifact directory. Phase 0-7 artifacts
# have a different name and are intentionally never touched by this script.
if (Test-Path -LiteralPath $artifactDirectory) {
  Remove-Item -LiteralPath $artifactDirectory -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
Copy-Item -Path (Join-Path $releaseRoot '*') -Destination $artifactDirectory -Recurse -Force

$files = Get-ChildItem -LiteralPath $artifactDirectory -File -Recurse | Sort-Object FullName
$releaseFiles = Get-ChildItem -LiteralPath $releaseRoot -File -Recurse | Sort-Object FullName
if ($releaseFiles.Count -ne $files.Count) {
  throw "Release/copy file-count mismatch ($($releaseFiles.Count) vs $($files.Count))."
}
for ($index = 0; $index -lt $releaseFiles.Count; $index++) {
  $releaseRelative = $releaseFiles[$index].FullName.Substring($releaseRoot.Length + 1).Replace('\', '/')
  $copiedRelative = $files[$index].FullName.Substring($artifactDirectory.Length + 1).Replace('\', '/')
  if ($releaseRelative -ne $copiedRelative) {
    throw "Release/copy inventory mismatch: $releaseRelative vs $copiedRelative"
  }
  $releaseHash = (Get-FileHash -LiteralPath $releaseFiles[$index].FullName -Algorithm SHA256).Hash
  $copiedHash = (Get-FileHash -LiteralPath $files[$index].FullName -Algorithm SHA256).Hash
  if ($releaseHash -ne $copiedHash) { throw "Release/copy hash mismatch: $releaseRelative" }
}
$manifestLines = [System.Collections.Generic.List[string]]::new()
$manifestLines.Add("artifact=$artifactName")
$manifestLines.Add('version=1.0.0+10')
$manifestLines.Add("generatedUtc=$([DateTime]::UtcNow.ToString('o'))")
$manifestLines.Add("fileCount=$($files.Count)")
foreach ($file in $files) {
  $relative = $file.FullName.Substring($artifactDirectory.Length + 1).Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToUpperInvariant()
  $manifestLines.Add("$hash  $relative")
}
$manifestPath = Join-Path $artifactRoot "$artifactName-manifest.txt"
Set-Content -LiteralPath $manifestPath -Value $manifestLines -Encoding utf8

if (-not $SkipZip) {
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Compress-Archive -Path (Join-Path $artifactDirectory '*') -DestinationPath $zipPath -CompressionLevel Optimal
  $zipVerify = Join-Path ([IO.Path]::GetTempPath()) ("twine-player-zip-" + [Guid]::NewGuid().ToString('N'))
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $zipVerifyFull = [IO.Path]::GetFullPath($zipVerify)
  if (-not $zipVerifyFull.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to extract ZIP outside the system temp directory: $zipVerifyFull"
  }
  New-Item -ItemType Directory -Force -Path $zipVerify | Out-Null
  try {
    Expand-Archive -LiteralPath $zipPath -DestinationPath $zipVerify -Force
    $zipFiles = Get-ChildItem -LiteralPath $zipVerify -File -Recurse | Sort-Object FullName
    if ($zipFiles.Count -ne $files.Count) { throw "ZIP/file count mismatch ($($zipFiles.Count) vs $($files.Count))." }
    for ($index = 0; $index -lt $files.Count; $index++) {
      $expectedRelative = $files[$index].FullName.Substring($artifactDirectory.Length + 1).Replace('\', '/')
      $actualRelative = $zipFiles[$index].FullName.Substring($zipVerify.Length + 1).Replace('\', '/')
      if ($expectedRelative -ne $actualRelative) { throw "ZIP inventory mismatch: $expectedRelative vs $actualRelative" }
      $expectedHash = (Get-FileHash -LiteralPath $files[$index].FullName -Algorithm SHA256).Hash
      $actualHash = (Get-FileHash -LiteralPath $zipFiles[$index].FullName -Algorithm SHA256).Hash
      if ($expectedHash -ne $actualHash) { throw "ZIP hash mismatch: $expectedRelative" }
    }
  } finally {
    if (Test-Path -LiteralPath $zipVerifyFull) {
      Remove-Item -LiteralPath $zipVerifyFull -Recurse -Force
    }
  }
}

if ($SmokeCycles -gt 0) {
  $artifactExecutable = Join-Path $artifactDirectory 'twine_player_flutter.exe'
  for ($cycle = 1; $cycle -le $SmokeCycles; $cycle++) {
    $process = Start-Process -FilePath $artifactExecutable -WorkingDirectory $artifactDirectory -PassThru
    Start-Sleep -Seconds 5
    if ($process.HasExited) {
      throw "Smoke cycle $cycle exited early with code $($process.ExitCode)."
    }
    if (-not $process.CloseMainWindow()) {
      Stop-Process -Id $process.Id -Force
      throw "Smoke cycle $cycle could not close its main window."
    }
    if (-not $process.WaitForExit(5000)) {
      Stop-Process -Id $process.Id -Force
      throw "Smoke cycle $cycle did not exit after close request."
    }
    if ($process.ExitCode -ne 0) {
      throw "Smoke cycle $cycle exited with code $($process.ExitCode)."
    }
    Write-Host "Smoke cycle $cycle/$SmokeCycles completed (process=$($process.Id))."
  }
}

$artifactHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToUpperInvariant()
$artifactExecutable = Join-Path $artifactDirectory 'twine_player_flutter.exe'
$executableHash = (Get-FileHash -LiteralPath $artifactExecutable -Algorithm SHA256).Hash.ToUpperInvariant()
Write-Host "Packaged $artifactName ($($files.Count) files)."
Write-Host "EXE SHA256: $executableHash"
Write-Host "Manifest SHA256: $artifactHash"
if (-not $SkipZip) {
  $zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToUpperInvariant()
  Write-Host "ZIP SHA256: $zipHash"
  Write-Host "ZIP: $zipPath"
}
