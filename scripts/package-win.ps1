$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$releaseRoot = Join-Path $projectRoot "release\DownloadVideo"
$distRoot = Join-Path $releaseRoot "dist"
$releaseRootFull = [System.IO.Path]::GetFullPath($releaseRoot)
$projectRootFull = [System.IO.Path]::GetFullPath($projectRoot)

if (-not $releaseRootFull.StartsWith($projectRootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release directory is outside the project directory: $releaseRootFull"
}

if (Test-Path $releaseRootFull) {
  Remove-Item -LiteralPath $releaseRootFull -Recurse -Force
}

npm run build

New-Item -ItemType Directory -Force -Path $releaseRootFull | Out-Null
New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

npx pkg .\dist\server\launcher.js --targets node22-win-x64 --output (Join-Path $releaseRootFull "DownloadVideo.exe")

Copy-Item -LiteralPath (Join-Path $projectRoot "dist\client") -Destination (Join-Path $distRoot "client") -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "bin") -Destination (Join-Path $releaseRootFull "bin") -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $releaseRootFull "downloads") | Out-Null

Write-Host "Windows release package created: $releaseRootFull"
