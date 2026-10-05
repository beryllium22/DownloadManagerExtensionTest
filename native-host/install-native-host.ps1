param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[a-p]{32}$")]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

$hostName = "com.tidy_downloads.host"
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherPath = Join-Path $hostRoot "tidy-downloads-host.cmd"
$generatedRoot = Join-Path $hostRoot "generated"
$manifestPath = Join-Path $generatedRoot "$hostName.json"

if (-not (Test-Path -LiteralPath $launcherPath)) {
  throw "Missing native host launcher: $launcherPath"
}

New-Item -ItemType Directory -Force -Path $generatedRoot | Out-Null

$manifest = [ordered]@{
  name = $hostName
  description = "Tidy Downloads file mover"
  path = $launcherPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

($manifest | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$registryKeys = @(
  "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$hostName",
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
