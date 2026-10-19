using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using System.Reflection;
using TwinePlayer.Native.Core;
using Windows.ApplicationModel.DataTransfer;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private readonly InputDiagnostics _diagnostics = new();
    private TextBox? _diagnosticDisplay;
    private static readonly string DiagnosticBuildName = typeof(MainWindow).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion.Split('+')[0] ?? "unknown";
    private string DiagnosticReport() => _diagnostics.Report(DiagnosticBuildName, typeof(MainWindow).Assembly.GetName().Version?.ToString() ?? "unknown");
    private void RefreshDiagnosticDisplay() { if (_diagnosticDisplay is not null) _diagnosticDisplay.Text = DiagnosticReport(); }
    private async Task ApplyInputDiagnosticsAsync()
    {
        if (_player.Story is not null) await _player.ExecuteScriptAsync("window.__twinePlayerNativeSetInputDiagnostics(" + (_diagnostics.Enabled ? "true" : "false") + ")");
    }
    private async Task EnableDiagnosticsAsync(bool enabled)
    { _diagnostics.Enable(enabled); _chromeContacts.Clear(); await ApplyInputDiagnosticsAsync(); RefreshDiagnosticDisplay(); }
    private async void InputDiagnostics_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var panel = new StackPanel { Spacing = 12, MinWidth = Math.Max(160, Math.Min(350, Root.ActualWidth - 96)) };
            var enable = new ToggleSwitch { Header = "Record input metadata (this session only)", IsOn = _diagnostics.Enabled };
            enable.Toggled += async (_, _) => { try { await EnableDiagnosticsAsync(enable.IsOn); } catch (Exception error) { ShowPresentationError(error.Message); } };
            var label = new TextBox { Header = "Scenario label (session only; do not enter personal information)", Text = _diagnostics.ScenarioLabel, MaxLength = 64 }; label.TextChanged += (_, _) => { _diagnostics.SetScenarioLabel(label.Text); RefreshDiagnosticDisplay(); };
            _diagnosticDisplay = new TextBox { Text = DiagnosticReport(), IsReadOnly = true, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap, Height = Math.Max(120, Math.Min(320, Root.ActualHeight - 420)) }; AutomationProperties.SetName(_diagnosticDisplay, "Privacy-safe input report");
            var buttons = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
            var copy = new Button { Content = "Copy report" }; copy.Click += (_, _) => { var data = new DataPackage(); data.SetText(DiagnosticReport()); Clipboard.SetContent(data); };
            var clear = new Button { Content = "Clear events" }; clear.Click += (_, _) => { _diagnostics.Clear(); _chromeContacts.Clear(); RefreshDiagnosticDisplay(); };
            buttons.Children.Add(copy); buttons.Children.Add(clear);
            panel.Children.Add(new TextBlock { Text = "Disabled by default. Keeps at most 200 events in memory. Reports contain device/category/contact counts and build identity; no story text, paths, coordinates, raw keys or timestamps. Scenario labels are copied exactly after sanitization.", TextWrapping = TextWrapping.Wrap });
            panel.Children.Add(enable); panel.Children.Add(label); panel.Children.Add(_diagnosticDisplay); panel.Children.Add(buttons);
            await new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Input diagnostics", Content = new ScrollViewer { Content = panel, MaxHeight = Math.Max(180, Root.ActualHeight - 200) }, CloseButtonText = "Close" }.ShowAsync();
        }
        catch (Exception error) { ShowPresentationError(error.Message); }
        finally { _diagnosticDisplay = null; RestoreStoryFocus(); }
    }
    private async void InputLab_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Open offline Input Lab?", Content = "The bundled lab replaces the current story view. Save your game first. It adds no library entry and requires no network. Input diagnostics start disabled; enable them explicitly in More → Input diagnostics.", PrimaryButtonText = "Open Input Lab", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
            await LaunchInputLabAsync();
        }
        catch (Exception error) { ShowPresentationError(error.Message); }
        finally { RestoreStoryFocus(); }
    }
    private async Task LaunchInputLabAsync()
    {
        await EnableDiagnosticsAsync(false); _diagnostics.Clear(); _diagnostics.SetScenarioLabel("");
        await OpenAsync(Path.Combine(AppContext.BaseDirectory, "Assets", "InputLab", "input_lab.html"), inputLab: true);
        ViewModel.Title = "Offline Input Lab";
    }
}
