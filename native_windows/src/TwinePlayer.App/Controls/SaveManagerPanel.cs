using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;

namespace TwinePlayer.Native.App.Controls;

// Modeless within the player viewport, leaving the sidebar available to toggle
// this manager. Destructive confirmations still use a modal ContentDialog.
public sealed class SaveManagerPanel : Grid
{
    private readonly TextBlock _title = new() { FontSize = 24, TextWrapping = TextWrapping.Wrap };
    private readonly ContentControl _body = new() { HorizontalContentAlignment = HorizontalAlignment.Stretch };
    private readonly Button _primary = new();
    private readonly Button _secondary = new();
    private readonly Button _close = new();
    private TaskCompletionSource<ContentDialogResult>? _completion;
    private Grid? _host;
    public bool IsOpen => _completion is not null;
    public string Title { get => _title.Text; set { _title.Text = value; AutomationProperties.SetName(this, value); } }
    public UIElement Content { get => (UIElement)_body.Content; set => _body.Content = value; }
    public string PrimaryButtonText { get => (string)_primary.Content; set => _primary.Content = value; }
    public string SecondaryButtonText { get => (string)_secondary.Content; set => _secondary.Content = value; }
    public string CloseButtonText { get => (string)_close.Content; set => _close.Content = value; }
    public bool IsPrimaryButtonEnabled { get => _primary.IsEnabled; set => _primary.IsEnabled = value; }
    public bool IsSecondaryButtonEnabled { get => _secondary.IsEnabled; set => _secondary.IsEnabled = value; }

    public SaveManagerPanel()
    {
        Width = 480; Margin = new Thickness(16); Padding = new Thickness(24);
        HorizontalAlignment = HorizontalAlignment.Center; VerticalAlignment = VerticalAlignment.Center;
        CornerRadius = new CornerRadius(8); BorderThickness = new Thickness(1);
        Style = (Style)Microsoft.UI.Xaml.Markup.XamlReader.Load("""
            <Style xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" TargetType="Grid">
                <Setter Property="Background" Value="{ThemeResource ApplicationPageBackgroundThemeBrush}" />
                <Setter Property="BorderBrush" Value="{ThemeResource CardStrokeColorDefaultBrush}" />
            </Style>
            """);
        var layout = new Grid { RowSpacing = 16 };
        layout.RowDefinitions.Add(new() { Height = GridLength.Auto });
        layout.RowDefinitions.Add(new() { Height = new GridLength(1, GridUnitType.Star) });
        layout.RowDefinitions.Add(new() { Height = GridLength.Auto });
        layout.Children.Add(_title);
        var scroll = new ScrollViewer { Content = _body, HorizontalScrollMode = ScrollMode.Disabled, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };
        Grid.SetRow(scroll, 1); layout.Children.Add(scroll);
        var actions = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right };
        foreach (var button in new[] { _secondary, _primary, _close }) actions.Children.Add(button);
        Grid.SetRow(actions, 2); layout.Children.Add(actions); Children.Add(layout);
        _primary.Style = (Style)Application.Current.Resources["AccentButtonStyle"];
        _primary.Click += (_, _) => Finish(ContentDialogResult.Primary);
        _secondary.Click += (_, _) => Finish(ContentDialogResult.Secondary);
        _close.Click += (_, _) => Hide();
        TabFocusNavigation = KeyboardNavigationMode.Cycle;
        KeyDown += (_, args) =>
        {
            if (args.Key == Windows.System.VirtualKey.Escape) { args.Handled = true; Hide(); }
            else if (args.Key == Windows.System.VirtualKey.Enter && args.OriginalSource is TextBox && _primary.IsEnabled)
            { args.Handled = true; Finish(ContentDialogResult.Primary); }
        };
    }

    public Task<ContentDialogResult> ShowAsync(Grid host)
    {
        if (_completion is not null) throw new InvalidOperationException("Save manager is already visible.");
        _completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var task = _completion.Task;
        _host = host; host.Children.Add(this); host.Visibility = Visibility.Visible;
        host.SizeChanged += HostSizeChanged; FitToHost();
        Loaded += FocusContent;
        return task;
    }
    private void HostSizeChanged(object sender, SizeChangedEventArgs args) => FitToHost();
    private void FitToHost()
    {
        MaxWidth = Math.Max(1, (_host?.ActualWidth ?? 512) - 32);
        MaxHeight = Math.Max(1, (_host?.ActualHeight ?? 640) - 32);
    }
    private void FocusContent(object sender, RoutedEventArgs args)
    {
        Loaded -= FocusContent;
        RestoreFocus();
    }
    internal void RestoreFocus()
    {
        if (FocusManager.FindFirstFocusableElement(this) is Control control) control.Focus(FocusState.Programmatic);
    }
    public void Hide() => Finish(ContentDialogResult.None);
    private void Finish(ContentDialogResult result)
    {
        var completion = _completion;
        if (completion is null) return;
        _completion = null; Loaded -= FocusContent;
        if (_host is { } host) { host.SizeChanged -= HostSizeChanged; host.Children.Remove(this); host.Visibility = Visibility.Collapsed; }
        _host = null; completion.TrySetResult(result);
    }
}
