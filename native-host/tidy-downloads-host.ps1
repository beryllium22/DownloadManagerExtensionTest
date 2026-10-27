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

function Test-ReservedWindowsName {
  param([string]$Name)

  $stripped = $Name.Trim().TrimEnd('.', ' ')
  if ([string]::IsNullOrWhiteSpace($stripped)) {
    return $false
  }
  $base = ($stripped -split '\.', 2)[0].Trim()
  $reserved = @(
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
  )
  return $reserved -contains $base.ToUpperInvariant()
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
  $cleanSegments = New-Object System.Collections.Generic.List[string]
  foreach ($segment in $segments) {
    $normalized = $segment.Trim().TrimEnd('.', ' ')
    if ([string]::IsNullOrWhiteSpace($normalized) -or $normalized -eq "." -or $normalized -eq "..") {
      throw "Folder paths cannot contain blank, current, or parent directory segments."
    }

    if ($normalized.IndexOfAny($invalidChars) -ge 0) {
      throw "Folder names contain invalid Windows characters."
    }

    if (Test-ReservedWindowsName $normalized) {
      throw "Folder names cannot use reserved Windows device names."
    }

    $cleanSegments.Add($normalized)
  }

  return [IO.Path]::GetFullPath(($root.TrimEnd("\") + "\" + ($cleanSegments -join "\")))
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
  if ([string]::IsNullOrWhiteSpace($fileName) -or (Test-ReservedWindowsName $fileName)) {
    throw "The download name is not a safe Windows file name, so it was left in staging."
  }
  $destination = Join-Path $targetFolder $fileName
  if ($destination.Length -gt 259) {
    throw "The destination path is too long for Windows, so the download was left in staging."
  }

  $destinationExists = Test-Path -LiteralPath $destination
  $destinationIsFile = Test-Path -LiteralPath $destination -PathType Leaf
  if ($destinationExists -and -not $destinationIsFile) {
    throw "A folder already uses that name. The download was left in the staging folder."
  }
  if ($destinationIsFile) {
    $existing = Get-Item -LiteralPath $destination -Force
    if ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw "The destination is a link, so it was left untouched and the download stayed in staging."
    }
  }

  # "prompt" is Chrome's dialog for a normal Downloads folder. This helper has
  # no UI, so a full path keeps both files unless the user chose overwrite.
  $replaceExisting = [string]$Message.conflictAction -eq "overwrite" -and $destinationIsFile
  if (-not $replaceExisting) {
    if ($destinationExists) {
      $destination = Get-UniquePath $destination
    }
    Move-Item -LiteralPath $sourcePath -Destination $destination
    return @{
      ok = $true
      path = $destination
    }
  }

  # Copy the download into the target folder before the existing file moves.
  # The original download stays in staging until the new file is in place and
  # the previous file is only removed after that check succeeds.
  $token = [guid]::NewGuid().ToString("N")
  $incoming = Join-Path $targetFolder (".tidy-incoming-$token")
  $backup = Join-Path $targetFolder (".tidy-backup-$token")
  $sourceLength = (Get-Item -LiteralPath $sourcePath -Force).Length
  try {
    Copy-Item -LiteralPath $sourcePath -Destination $incoming
    $copiedLength = (Get-Item -LiteralPath $incoming -Force).Length
    if ($copiedLength -ne $sourceLength) {
      throw "The copied download did not match the original."
    }
    Move-Item -LiteralPath $destination -Destination $backup
    try {
      Move-Item -LiteralPath $incoming -Destination $destination
      $landed = Get-Item -LiteralPath $destination -Force
      if ($landed.PSIsContainer -or ($landed.Length -ne $sourceLength)) {
        throw "The new file was not stored correctly."
      }
    } catch {
      if ((Test-Path -LiteralPath $destination) -and (Test-Path -LiteralPath $backup)) {
        $failedNew = Join-Path $targetFolder (".tidy-failed-$token")
        Move-Item -LiteralPath $destination -Destination $failedNew
        Move-Item -LiteralPath $backup -Destination $destination
        if (Test-Path -LiteralPath $failedNew) {
          Remove-Item -LiteralPath $failedNew -Force
        }
      } elseif (Test-Path -LiteralPath $backup) {
        Move-Item -LiteralPath $backup -Destination $destination
      }
      throw
    }
    try {
      Remove-Item -LiteralPath $backup -Force
    } catch {
      $previousName = "{0} (previous){1}" -f [IO.Path]::GetFileNameWithoutExtension($fileName), [IO.Path]::GetExtension($fileName)
      $previous = Get-UniquePath (Join-Path $targetFolder $previousName)
      if (Test-Path -LiteralPath $backup) {
        Move-Item -LiteralPath $backup -Destination $previous
      }
    }
    if (Test-Path -LiteralPath $sourcePath) {
      Remove-Item -LiteralPath $sourcePath -Force -ErrorAction SilentlyContinue
    }
  } catch {
    if (Test-Path -LiteralPath $incoming) {
      Remove-Item -LiteralPath $incoming -Force
    }
    throw
  }

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
