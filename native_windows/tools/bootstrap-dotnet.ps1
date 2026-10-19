[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$version = '10.0.402'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$root = Join-Path $repo "artifacts\toolchain\dotnet-$version"
if (Test-Path -LiteralPath (Join-Path $root 'dotnet.exe')) { Write-Output (Join-Path $root 'dotnet.exe'); return }
$metadata = Invoke-RestMethod 'https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json'
$sdk = @($metadata.releases | ForEach-Object { $_.sdks } | Where-Object { $_.version -eq $version }) | Select-Object -First 1
if (-not $sdk) { throw "Microsoft metadata does not list stable SDK $version." }
$file = $sdk.files | Where-Object { $_.rid -eq 'win-x64' -and $_.name -like '*.zip' } | Select-Object -First 1
if (-not $file -or -not $file.url.StartsWith('https://builds.dotnet.microsoft.com/')) { throw 'Expected Microsoft SDK download metadata.' }
New-Item -ItemType Directory -Path $root -Force | Out-Null
$archive = Join-Path $repo "artifacts\toolchain\dotnet-sdk-$version-win-x64.zip"
if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $file.url -OutFile $archive }
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA512).Hash -ne $file.hash) { throw 'SDK SHA-512 mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath $root -Force
Write-Output (Join-Path $root 'dotnet.exe')
