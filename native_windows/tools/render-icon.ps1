# Render the original, code-authored SVG paths using WPF; no external packages.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationCore, WindowsBase
$assets=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\src\TwinePlayer.App\Assets'))
[xml]$svg=Get-Content -Raw -LiteralPath (Join-Path $assets 'app_icon.svg')
$frames=@()
foreach($size in @(16,20,24,32,40,48,64,128,256)) {
    $visual=New-Object Windows.Media.DrawingVisual
    $drawing=$visual.RenderOpen()
    $drawing.PushTransform((New-Object Windows.Media.ScaleTransform ($size/256.0),($size/256.0)))
    foreach($path in $svg.svg.path) {
        $fill=$null; $pen=$null
        if($path.fill -and $path.fill -ne 'none') { $fill=New-Object Windows.Media.SolidColorBrush ([Windows.Media.ColorConverter]::ConvertFromString($path.fill)) }
        if($path.stroke) {
            $brush=New-Object Windows.Media.SolidColorBrush ([Windows.Media.ColorConverter]::ConvertFromString($path.stroke))
            $pen=New-Object Windows.Media.Pen $brush,([double]$path.'stroke-width')
            $pen.StartLineCap=$pen.EndLineCap=[Windows.Media.PenLineCap]::Round
        }
        $drawing.DrawGeometry($fill,$pen,[Windows.Media.Geometry]::Parse($path.d))
    }
    $drawing.Pop(); $drawing.Close()
    $bitmap=New-Object Windows.Media.Imaging.RenderTargetBitmap $size,$size,96,96,([Windows.Media.PixelFormats]::Pbgra32)
    $bitmap.Render($visual)
    $encoder=New-Object Windows.Media.Imaging.PngBitmapEncoder
    $encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bitmap))
    $stream=New-Object IO.MemoryStream; $encoder.Save($stream)
    $frames+=@{size=$size; bytes=$stream.ToArray()}; $stream.Dispose()
}
[IO.File]::WriteAllBytes((Join-Path $assets 'app_icon.png'),$frames[-1].bytes)
$icon=[IO.File]::Create((Join-Path $assets 'app_icon.ico'))
try {
    $writer=New-Object IO.BinaryWriter $icon
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset=6+16*$frames.Count
    foreach($frame in $frames) {
        $dimension=if($frame.size -eq 256){0}else{$frame.size}
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frame.bytes.Length); $writer.Write([uint32]$offset); $offset+=$frame.bytes.Length
    }
    foreach($frame in $frames) { $writer.Write([byte[]]$frame.bytes) }
    $writer.Flush()
} finally { $icon.Dispose() }
Write-Output 'Rendered original TwinePlayer icon: SVG, 256px PNG, nine-size ICO.'
