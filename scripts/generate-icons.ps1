param()

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [System.Drawing.RectangleF]$Rectangle,
    [float]$Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $arc = [System.Drawing.RectangleF]::new($Rectangle.X, $Rectangle.Y, $diameter, $diameter)
  $path.AddArc($arc, 180, 90)
  $arc.X = $Rectangle.Right - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $Rectangle.Bottom - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = $Rectangle.X
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()
  return $path
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconDirectory = Join-Path $projectRoot "icons"
$masterSize = 512
$master = [System.Drawing.Bitmap]::new($masterSize, $masterSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($master)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

try {
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $backgroundPath = New-RoundedRectanglePath ([System.Drawing.RectangleF]::new(22, 22, 468, 468)) 112
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(70, 45),
    [System.Drawing.PointF]::new(445, 470),
    [System.Drawing.Color]::FromArgb(255, 255, 155, 103),
    [System.Drawing.Color]::FromArgb(255, 191, 53, 26)
  )
  $graphics.FillPath($gradient, $backgroundPath)

  $highlight = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(75, 255, 255, 255), 5)
  $graphics.DrawPath($highlight, $backgroundPath)

  $folderPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $folderPath.StartFigure()
  $folderPath.AddLine(95, 202, 204, 202)
  $folderPath.AddLine(204, 202, 249, 245)
  $folderPath.AddLine(417, 245, 417, 391)
  $folderPath.AddLine(417, 391, 95, 391)
  $folderPath.CloseFigure()
  $folderFill = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(34, 255, 255, 255))
  $graphics.FillPath($folderFill, $folderPath)

  $whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 27)
  $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawPath($whitePen, $folderPath)
  $graphics.DrawLine($whitePen, 256, 110, 256, 295)
  $graphics.DrawLines($whitePen, @(
    [System.Drawing.Point]::new(207, 247),
    [System.Drawing.Point]::new(256, 296),
    [System.Drawing.Point]::new(305, 247)
  ))

  foreach ($size in @(16, 32, 48, 128)) {
    $target = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $targetGraphics = [System.Drawing.Graphics]::FromImage($target)
    try {
      $targetGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $targetGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $targetGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $targetGraphics.DrawImage($master, [System.Drawing.Rectangle]::new(0, 0, $size, $size))
      $target.Save((Join-Path $iconDirectory "icon$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $targetGraphics.Dispose()
      $target.Dispose()
    }
  }
} finally {
  if ($whitePen) { $whitePen.Dispose() }
  if ($folderFill) { $folderFill.Dispose() }
  if ($folderPath) { $folderPath.Dispose() }
  if ($highlight) { $highlight.Dispose() }
  if ($gradient) { $gradient.Dispose() }
  if ($backgroundPath) { $backgroundPath.Dispose() }
  $graphics.Dispose()
  $master.Dispose()
}

Write-Output "Generated Tidy Downloads icons: 16, 32, 48, 128 pixels."
