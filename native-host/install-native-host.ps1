param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-p]{32}$")]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$hostName = "com.tidy_downloads.host"
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceLauncher = Join-Path $hostRoot "tidy-downloads-host.cmd"
$sourceScript = Join-Path $hostRoot "tidy-downloads-host.ps1"

if (-not (Test-Path -LiteralPath $sourceLauncher)) {
  throw "Missing native host launcher: $sourceLauncher"
}
if (-not (Test-Path -LiteralPath $sourceScript)) {
  throw "Missing native host script: $sourceScript"
}
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
  throw "LOCALAPPDATA is not set, so the helper cannot be installed."
}

$installRoot = Join-Path $env:LOCALAPPDATA "Tidy Downloads\native-host"
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Copy-Item -LiteralPath $sourceScript -Destination (Join-Path $installRoot "tidy-downloads-host.ps1") -Force
Copy-Item -LiteralPath $sourceLauncher -Destination (Join-Path $installRoot "tidy-downloads-host.cmd") -Force

$launcherPath = Join-Path $installRoot "tidy-downloads-host.cmd"
$generatedRoot = Join-Path $installRoot "generated"
$manifestPath = Join-Path $generatedRoot "$hostName.json"

New-Item -ItemType Directory -Force -Path $generatedRoot | Out-Null

$manifest = [ordered]@{
  name = $hostName
  description = "Tidy Downloads file mover"
  path = $launcherPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 4), $utf8NoBom)

$registryKeys = @(
  "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$hostName",
  "Software\BraveSoftware\Brave-Browser-Beta\NativeMessagingHosts\$hostName",
  "Software\BraveSoftware\Brave-Browser-Dev\NativeMessagingHosts\$hostName",
  "Software\BraveSoftware\Brave-Browser-Nightly\NativeMessagingHosts\$hostName",
  "Software\Google\Chrome\NativeMessagingHosts\$hostName",
  "Software\Chromium\NativeMessagingHosts\$hostName",
  "Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
)

foreach ($relativeKey in $registryKeys) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($relativeKey)
  $key.SetValue("", $manifestPath, [Microsoft.Win32.RegistryValueKind]::String)
  $key.Close()
}

Write-Host "Installed native messaging host: $hostName"
Write-Host "Manifest: $manifestPath"
Write-Host "Allowed extension: chrome-extension://$ExtensionId/"
