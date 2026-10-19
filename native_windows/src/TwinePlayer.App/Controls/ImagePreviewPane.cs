using System.Text;
using System.Xml;
using System.Xml.Linq;
using Microsoft.UI.Input;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;
using Windows.Foundation;
using Windows.ApplicationModel.DataTransfer;
namespace TwinePlayer.Native.App.Controls;

public sealed class ImagePreviewPane : Grid
{
    internal ScrollViewer Viewer { get; }
    internal ToggleSwitch DoubleTap { get; }
    private readonly Image _image;
    private readonly TextBlock _status = new() { Text = "Loading image…", TextWrapping = TextWrapping.Wrap };
    private readonly double _width;
    private readonly double _height;
    private (Point Position, double X, double Y)? _drag;
    internal ImagePreviewPane(string source, string alt, double availableWidth, double availableHeight)
    {
        _width = Math.Max(250, Math.Min(1000, availableWidth)); _height = Math.Max(160, Math.Min(640, availableHeight));
        Width = _width; RowSpacing = 8;
        RowDefinitions.Add(new() { Height = GridLength.Auto }); RowDefinitions.Add(new() { Height = GridLength.Auto }); RowDefinitions.Add(new() { Height = GridLength.Auto });
        _image = new Image { Stretch = Stretch.Uniform, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
        AutomationProperties.SetName(_image, string.IsNullOrWhiteSpace(alt) ? "Story image" : alt);
        Viewer = new ScrollViewer { Content = _image, Width = _width, Height = _height, MinZoomFactor = 1, MaxZoomFactor = 6, ZoomMode = ZoomMode.Enabled, HorizontalScrollMode = ScrollMode.Enabled, VerticalScrollMode = ScrollMode.Enabled, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, HorizontalContentAlignment = HorizontalAlignment.Center, VerticalContentAlignment = VerticalAlignment.Center, IsHorizontalRailEnabled = false, IsVerticalRailEnabled = false };
        var commands = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        var copy = Button("Copy source", "Copy image source"); copy.Click += (_, _) => { var package = new DataPackage(); package.SetText(source); Clipboard.SetContent(package); };
        var plus = Button("+", "Zoom in image"); plus.Click += (_, _) => SetZoom(Viewer.ZoomFactor * 1.25);
        var minus = Button("−", "Zoom out image"); minus.Click += (_, _) => SetZoom(Viewer.ZoomFactor * .8);
        var reset = Button("Reset", "Reset image zoom"); reset.Click += (_, _) => SetZoom(1);
        DoubleTap = new() { Header = "Double-tap zoom", IsOn = false }; AutomationProperties.SetName(DoubleTap, "Enable double-tap zoom");
        DoubleTap.Toggled += (_, _) => { if (!DoubleTap.IsOn) SetZoom(1); };
        commands.Children.Add(copy); commands.Children.Add(minus); commands.Children.Add(plus); commands.Children.Add(reset); commands.Children.Add(DoubleTap);
        Children.Add(new ScrollViewer { Content = commands, Width = _width, HorizontalScrollMode = ScrollMode.Enabled, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollMode = ScrollMode.Disabled, VerticalScrollBarVisibility = ScrollBarVisibility.Disabled }); SetRow(_status, 1); Children.Add(_status);
        AutomationProperties.SetName(Viewer, "Image preview zoom and pan surface"); SetRow(Viewer, 2); Children.Add(Viewer);
        _image.DoubleTapped += (_, args) => { HandleDoubleTap(); args.Handled = true; };
        _image.PointerPressed += (_, args) =>
        {
            if (args.Pointer.PointerDeviceType != PointerDeviceType.Mouse || !args.GetCurrentPoint(Viewer).Properties.IsLeftButtonPressed) return;
            _drag = (args.GetCurrentPoint(Viewer).Position, Viewer.HorizontalOffset, Viewer.VerticalOffset); _image.CapturePointer(args.Pointer); args.Handled = true;
        };
        _image.PointerMoved += (_, args) => { if (_drag is not { } drag) return; var point = args.GetCurrentPoint(Viewer).Position; Viewer.ChangeView(drag.X - (point.X - drag.Position.X), drag.Y - (point.Y - drag.Position.Y), null, true); args.Handled = true; };
        _image.PointerReleased += (_, args) => { _drag = null; _image.ReleasePointerCapture(args.Pointer); };
        _image.PointerCanceled += (_, _) => { _drag = null; _image.ReleasePointerCaptures(); };
    }
    private static Button Button(string text, string name)
    { var control = new Button { Content = text, MinWidth = 44, MinHeight = 44 }; AutomationProperties.SetName(control, name); ToolTipService.SetToolTip(control, name); return control; }
    internal void SetZoom(double value) => Viewer.ChangeView(0, 0, (float)Math.Clamp(value, 1, 6), true);
    internal void HandleDoubleTap() { if (DoubleTap.IsOn) SetZoom(Viewer.ZoomFactor > 1 ? 1 : 2); }
    internal void ShowFailure(string error) => _status.Text = "Could not load image preview: " + error;
    internal async Task LoadAsync(byte[] bytes)
    {
        using var stream = new InMemoryRandomAccessStream();
        using (var writer = new DataWriter(stream)) { writer.WriteBytes(bytes); await writer.StoreAsync(); writer.DetachStream(); }
        stream.Seek(0);
        double width, height;
        var prefix = Encoding.UTF8.GetString(bytes, 0, Math.Min(bytes.Length, 4096)).TrimStart('\uFEFF', ' ', '\r', '\n', '\t');
        if (prefix.StartsWith('<') && prefix.Contains("<svg", StringComparison.OrdinalIgnoreCase))
        {
            var root = await Task.Run(() => ValidateSvg(bytes));
            var source = new SvgImageSource();
            if (await source.SetSourceAsync(stream) != SvgImageSourceLoadStatus.Success) throw new InvalidDataException("SVG could not be decoded.");
            width = source.RasterizePixelWidth > 0 ? source.RasterizePixelWidth : 800; height = source.RasterizePixelHeight > 0 ? source.RasterizePixelHeight : 600;
            var box = root.Attribute("viewBox")?.Value.Split(new[] { ' ', ',' }, StringSplitOptions.RemoveEmptyEntries);
            if (box?.Length == 4 && double.TryParse(box[2], System.Globalization.CultureInfo.InvariantCulture, out var bw) && double.TryParse(box[3], System.Globalization.CultureInfo.InvariantCulture, out var bh) && bw > 0 && bh > 0) { width = bw; height = bh; }
            _image.Source = source;
        }
        else
        {
            var decoder = await BitmapDecoder.CreateAsync(stream); width = decoder.PixelWidth; height = decoder.PixelHeight;
            if (width <= 0 || height <= 0 || width * height > 100000000) throw new InvalidDataException("Image dimensions exceed the preview decode limit.");
            var scale = Math.Min(1, 4096 / Math.Max(width, height));
            var source = new BitmapImage { DecodePixelWidth = (int)Math.Max(1, width * scale), DecodePixelHeight = (int)Math.Max(1, height * scale) };
            stream.Seek(0); await source.SetSourceAsync(stream); _image.Source = source;
        }
        var fit = Math.Min(1, Math.Min(_width / width, _height / height)); _image.Width = width * fit; _image.Height = height * fit;
        _status.Text = $"{width:N0} × {height:N0} · Zoom 1×–6× · Drag or use touch to pan enlarged images.";
    }
    private static XElement ValidateSvg(byte[] bytes)
    {
        using var memory = new MemoryStream(bytes);
        using var reader = XmlReader.Create(memory, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null, MaxCharactersInDocument = bytes.Length + 1L });
        var xml = XDocument.Load(reader); var root = xml.Root ?? throw new InvalidDataException("SVG has no root.");
        static void ValidateCss(string value)
        {
            if (value.Contains("@import", StringComparison.OrdinalIgnoreCase) || value.Contains('\\')) throw new InvalidDataException("External or escaped SVG style resources are not supported.");
            foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(value, "url\\s*\\(\\s*['\"]?([^'\"\\s)]+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                if (!match.Groups[1].Value.StartsWith('#')) throw new InvalidDataException("External SVG style resources are not supported.");
        }
        foreach (var style in root.DescendantsAndSelf().Where(element => element.Name.LocalName == "style")) ValidateCss(style.Value);
        foreach (var attribute in root.DescendantsAndSelf().Attributes())
        {
            if (attribute.Name.LocalName is "href" or "src" && !attribute.Value.StartsWith('#') && !System.Text.RegularExpressions.Regex.IsMatch(attribute.Value, "^data:image/(png|jpeg|gif|webp|bmp);base64,", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) throw new InvalidDataException("External or nested SVG references are not allowed in native previews.");
            if (attribute.Name.LocalName == "style" || attribute.Value.Contains("url", StringComparison.OrdinalIgnoreCase)) ValidateCss(attribute.Value);
        }
        return root;
    }
}
