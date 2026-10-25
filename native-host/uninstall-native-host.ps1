$ErrorActionPreference = "Stop"

$hostName = "com.tidy_downloads.host"
$registryKeys = @(
  "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$hostName",
  "HKCU:\Software\BraveSoftware\Brave-Browser-Beta\NativeMessagingHosts\$hostName",
  "HKCU:\Software\BraveSoftware\Brave-Browser-Dev\NativeMessagingHosts\$hostName",
  "HKCU:\Software\BraveSoftware\Brave-Browser-Nightly\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Chromium\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
)

foreach ($key in $registryKeys) {
  if (Test-Path -LiteralPath $key) {
    Remove-Item -LiteralPath $key -Force
  }
}

if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
  $installRoot = Join-Path $env:LOCALAPPDATA "Tidy Downloads\native-host"
  if (Test-Path -LiteralPath $installRoot) {
    Remove-Item -LiteralPath $installRoot -Recurse -Force
    Write-Host "Removed helper files: $installRoot"
  }
}

Write-Host "Removed native messaging host registry entries for $hostName."
