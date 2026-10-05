$ErrorActionPreference = "Stop"

$hostName = "com.tidy_downloads.host"
$registryKeys = @(
  "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Chromium\NativeMessagingHosts\$hostName",
  "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
)

foreach ($key in $registryKeys) {
  if (Test-Path -LiteralPath $key) {
    Remove-Item -LiteralPath $key -Force
  }
}

Write-Host "Removed native messaging host registry entries for $hostName."
