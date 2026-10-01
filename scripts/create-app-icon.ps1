$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconProjectRoot = Split-Path -Parent $PSScriptRoot
$iconPublic = Join-Path $iconProjectRoot 'public'
$iconSvg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="aoki edition notebook">
  <rect width="64" height="64" rx="18" fill="#A693AC"/>
  <rect x="15" y="18" width="30" height="35" rx="5" fill="#6B5175"/>
  <path d="M23 11H40L49 20V45Q49 49 45 49H23Q19 49 19 45V15Q19 11 23 11Z" fill="#F0EEE9"/>
  <path d="M40 11V20H49Z" fill="#D7CFDA"/>
  <path d="M27 28H40M27 35H37" fill="none" stroke="#806488" stroke-width="3" stroke-linecap="round"/>
  <circle cx="28" cy="42" r="2" fill="#A693AC"/>
</svg>
'@
[IO.File]::WriteAllText((Join-Path $iconPublic 'icon.svg'), $iconSvg, [Text.UTF8Encoding]::new($false))
function New-IconRoundRect([single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
  $shape = [Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = 2 * $radius
  $shape.AddArc($x,$y,$diameter,$diameter,180,90)
  $shape.AddArc(($x+$width-$diameter),$y,$diameter,$diameter,270,90)
  $shape.AddArc(($x+$width-$diameter),($y+$height-$diameter),$diameter,$diameter,0,90)
  $shape.AddArc($x,($y+$height-$diameter),$diameter,$diameter,90,90)
  $shape.CloseFigure()
  return $shape
}
$iconFrames = @()
foreach ($iconSize in @(16,32,48,64,128,256)) {
  $bitmap = [Drawing.Bitmap]::new($iconSize,$iconSize,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([Drawing.Color]::Transparent)
  $graphics.ScaleTransform(($iconSize/64.0),($iconSize/64.0))
  $brushes = @('#A693AC','#6B5175','#F0EEE9','#D7CFDA') | ForEach-Object { [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml($_)) }
  $background = New-IconRoundRect 0 0 64 64 18
  $back = New-IconRoundRect 15 18 30 35 5
  $graphics.FillPath($brushes[0],$background)
  $graphics.FillPath($brushes[1],$back)
  $cover = [Drawing.Drawing2D.GraphicsPath]::new()
  $cover.AddLine(23,11,40,11); $cover.AddLine(40,11,49,20); $cover.AddLine(49,20,49,45)
  $cover.AddBezier(49,45,49,48,48,49,45,49); $cover.AddLine(45,49,23,49)
  $cover.AddBezier(23,49,20,49,19,48,19,45); $cover.AddLine(19,45,19,15)
  $cover.AddBezier(19,15,19,12,20,11,23,11); $cover.CloseFigure()
  $graphics.FillPath($brushes[2],$cover)
  $foldPoints = [Drawing.PointF[]]@([Drawing.PointF]::new(40,11),[Drawing.PointF]::new(40,20),[Drawing.PointF]::new(49,20))
  $graphics.FillPolygon($brushes[3],$foldPoints)
  $pen = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#806488'),3)
  $pen.StartCap = [Drawing.Drawing2D.LineCap]::Round; $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($pen,27,28,40,28); $graphics.DrawLine($pen,27,35,37,35)
  $graphics.FillEllipse($brushes[0],26,40,4,4)
  $memory = [IO.MemoryStream]::new(); $bitmap.Save($memory,[Drawing.Imaging.ImageFormat]::Png)
  $iconFrames += @{Size=$iconSize;Bytes=$memory.ToArray()}
  if ($iconSize -eq 256) { [IO.File]::WriteAllBytes((Join-Path $iconPublic 'icon.png'),$memory.ToArray()) }
  $memory.Dispose(); $pen.Dispose(); $cover.Dispose(); $back.Dispose(); $background.Dispose()
  foreach ($brush in $brushes) { $brush.Dispose() }
  $graphics.Dispose(); $bitmap.Dispose()
}
$iconStream = [IO.MemoryStream]::new(); $iconWriter = [IO.BinaryWriter]::new($iconStream)
$iconWriter.Write([uint16]0); $iconWriter.Write([uint16]1); $iconWriter.Write([uint16]$iconFrames.Count)
$iconOffset = 6 + 16 * $iconFrames.Count
foreach ($frame in $iconFrames) {
  $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
  $iconWriter.Write([byte]$dimension); $iconWriter.Write([byte]$dimension); $iconWriter.Write([byte]0); $iconWriter.Write([byte]0)
  $iconWriter.Write([uint16]1); $iconWriter.Write([uint16]32); $iconWriter.Write([uint32]$frame.Bytes.Length); $iconWriter.Write([uint32]$iconOffset)
  $iconOffset += $frame.Bytes.Length
}
foreach ($frame in $iconFrames) { $iconWriter.Write([byte[]]$frame.Bytes) }
[IO.File]::WriteAllBytes((Join-Path $iconPublic 'icon.ico'),$iconStream.ToArray())
$iconWriter.Dispose(); $iconStream.Dispose()
$verifiedIcon = [Drawing.Icon]::new((Join-Path $iconPublic 'icon.ico'))
Write-Output "Created notebook SVG, 256px PNG and 6-size Windows ICO ($($verifiedIcon.Width)x$($verifiedIcon.Height) default)."
$verifiedIcon.Dispose()
