$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -Raw -LiteralPath (Join-Path $projectRoot "manifest.json") | ConvertFrom-Json
$packageName = "tidy-downloads-for-brave-$($manifest.version)"
$distRoot = Join-Path $projectRoot "dist"
$targetRoot = Join-Path $distRoot $packageName
$archivePath = Join-Path $distRoot "$packageName.zip"

$resolvedProject = [IO.Path]::GetFullPath($projectRoot).TrimEnd("\")
$resolvedTarget = [IO.Path]::GetFullPath($targetRoot).TrimEnd("\")
$resolvedArchive = [IO.Path]::GetFullPath($archivePath)
if (-not $resolvedTarget.StartsWith("$resolvedProject\dist\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Package target escaped the project dist folder."
}
if (-not $resolvedArchive.StartsWith("$resolvedProject\dist\", [StringComparison]::OrdinalIgnoreCase)) {
  throw "Archive target escaped the project dist folder."
}

if (Test-Path -LiteralPath $targetRoot) {
  Remove-Item -LiteralPath $targetRoot -Recurse -Force
}
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

New-Item -ItemType Directory -Path $targetRoot -Force | Out-Null

$rootFiles = @(
  "README.md",
  "background.js",
  "first-run.html",
  "manifest.json",
  "options.html",
  "popup.html"
)
foreach ($file in $rootFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $targetRoot $file)
}

foreach ($directory in @("icons", "src", "styles")) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination (Join-Path $targetRoot $directory) -Recurse
}

$nativeTarget = Join-Path $targetRoot "native-host"
New-Item -ItemType Directory -Path $nativeTarget -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot "native-host") -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $nativeTarget $_.Name)
}

$archiveItems = Get-ChildItem -LiteralPath $targetRoot | Select-Object -ExpandProperty FullName
Compress-Archive -LiteralPath $archiveItems -DestinationPath $archivePath -CompressionLevel Optimal
Write-Host "Created $targetRoot"
Write-Host "Created $archivePath"
