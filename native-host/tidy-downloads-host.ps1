$ErrorActionPreference = "Stop"

$stdinStream = [Console]::OpenStandardInput()
$stdoutStream = [Console]::OpenStandardOutput()
$utf8 = [Text.Encoding]::UTF8

function Read-ExactBytes {
  param([int]$Count)

  $buffer = New-Object byte[] $Count
  $offset = 0

  while ($offset -lt $Count) {
    $read = $stdinStream.Read($buffer, $offset, $Count - $offset)
    if ($read -le 0) {
      return $null
    }
    $offset += $read
  }

  return $buffer
}

function Read-NativeMessage {
  $lengthBytes = Read-ExactBytes 4
  if ($null -eq $lengthBytes) {
    return $null
  }

  $length = [BitConverter]::ToUInt32($lengthBytes, 0)
  if ($length -eq 0 -or $length -gt 67108864) {
    throw "Invalid message length."
  }

  $messageBytes = Read-ExactBytes ([int]$length)
  if ($null -eq $messageBytes) {
    return $null
  }

  return ($utf8.GetString($messageBytes) | ConvertFrom-Json)
}

function Send-NativeMessage {
  param([hashtable]$Message)

  $json = $Message | ConvertTo-Json -Compress -Depth 8
  $bytes = $utf8.GetBytes($json)
  $lengthBytes = [BitConverter]::GetBytes([uint32]$bytes.Length)
  $stdoutStream.Write($lengthBytes, 0, $lengthBytes.Length)
  $stdoutStream.Write($bytes, 0, $bytes.Length)
  $stdoutStream.Flush()
}

function Get-SafeAbsoluteFolder {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    throw "Choose a destination folder."
  }

  $fullPath = [IO.Path]::GetFullPath($Path)
  if ($fullPath -notmatch "^[A-Za-z]:\\") {
    throw "Only local Windows drive paths are supported, such as D:\Games\Skyrim\Mods."
  }

  $root = [IO.Path]::GetPathRoot($fullPath)
  if ($fullPath.TrimEnd("\") -eq $root.TrimEnd("\")) {
    throw "Choose a folder, not the root of a drive."
  }

  if ($fullPath -match "^[A-Za-z]:\\(Windows|Program Files|Program Files \(x86\))(\\|$)") {
    throw "System folders are blocked. Choose a normal personal folder or game folder."
  }

  if ($fullPath -match "\\AppData(\\|$)") {
    throw "AppData folders are blocked. Choose a normal personal folder or game folder."
  }

  $invalidChars = [IO.Path]::GetInvalidFileNameChars()
  $segments = $fullPath.Substring($root.Length).Split("\")
  foreach ($segment in $segments) {
    if ([string]::IsNullOrWhiteSpace($segment) -or $segment -eq "." -or $segment -eq "..") {
      throw "Folder paths cannot contain blank, current, or parent directory segments."
    }

    if ($segment.IndexOfAny($invalidChars) -ge 0) {
      throw "Folder names contain invalid Windows characters."
    }
  }

  return $fullPath
}

function Get-UniquePath {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $Path
  }

  $directory = [IO.Path]::GetDirectoryName($Path)
  $name = [IO.Path]::GetFileNameWithoutExtension($Path)
  $extension = [IO.Path]::GetExtension($Path)

  for ($index = 1; $index -lt 10000; $index++) {
    $candidate = Join-Path $directory ("{0} ({1}){2}" -f $name, $index, $extension)
    if (-not (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw "Could not create a unique destination filename."
}

function Move-Download {
  param($Message)

  $sourcePath = [IO.Path]::GetFullPath([string]$Message.sourcePath)
  $sourceFolder = [IO.Path]::GetDirectoryName($sourcePath)
  if (-not [string]::Equals([IO.Path]::GetFileName($sourceFolder), "Tidy Downloads Staging", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Only files from the Tidy Downloads staging folder can be moved."
  }
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Downloaded file was not found in the staging folder."
  }

  $targetFolder = Get-SafeAbsoluteFolder ([string]$Message.targetFolder)
  [IO.Directory]::CreateDirectory($targetFolder) | Out-Null

  $fileName = [IO.Path]::GetFileName($sourcePath)
  $destination = Join-Path $targetFolder $fileName

  if ([string]$Message.conflictAction -eq "overwrite" -and (Test-Path -LiteralPath $destination)) {
    Remove-Item -LiteralPath $destination -Force
  } else {
    $destination = Get-UniquePath $destination
  }

  Move-Item -LiteralPath $sourcePath -Destination $destination
  return @{
    ok = $true
    path = $destination
  }
}

while ($true) {
  try {
    $message = Read-NativeMessage
    if ($null -eq $message) {
      break
    }

    switch ([string]$message.action) {
      "ping" {
        Send-NativeMessage @{
          ok = $true
          name = "com.tidy_downloads.host"
        }
      }
      "moveDownload" {
        Send-NativeMessage (Move-Download $message)
      }
      default {
        Send-NativeMessage @{
          ok = $false
          error = "Unknown action."
        }
      }
    }
  } catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    Send-NativeMessage @{
      ok = $false
      error = $_.Exception.Message
    }
  }
}
