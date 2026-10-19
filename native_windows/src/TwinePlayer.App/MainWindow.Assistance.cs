using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Input;
using TwinePlayer.Native.Core;
using Windows.System;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private StoryAssistancePreferences _assistance = new();
    private Guid? _assistanceStory;
    private long _assistanceRevision;
    private CancellationTokenSource? _zoomResize;
    private AssistanceStatus? _assistanceStatus;
    private async Task LoadAssistanceAsync(CancellationToken token)
    {
        var story = _player.Story ?? throw new InvalidOperationException("No active story.");
        StoryAssistancePreferences preferences;
        try { preferences = await _assistanceStore.GetAsync(story, token); }
        catch (Exception error) when (error is System.Text.Json.JsonException or InvalidDataException)
        { preferences = new(); ShowPresentationError("Stored presentation preferences are invalid and were preserved: " + error.Message); }
        if (_player.Story?.Id != story.Id) throw new OperationCanceledException();
        _assistance = preferences; _assistanceStory = story.Id;
        await ReapplyAssistanceAsync(token);
    }
    private async Task ReapplyAssistanceAsync(CancellationToken token)
    {
        if (_browser is null || _player.Story?.Id != _assistanceStory) return;
        var story = _assistanceStory; var revision = _assistanceRevision;
        await _player.SetStoryZoomAsync(_assistance.ZoomFactor, _browser.ActualWidth, _browser.ActualHeight, Root.XamlRoot.RasterizationScale, token);
        for (var attempt = 0; attempt < 25; attempt++)
        {
            if (_player.Story?.Id != story || revision != _assistanceRevision) return;
            _assistanceStatus = await _bridge.ApplyAssistanceAsync(_assistance, token);
            if (_assistanceStatus.Verified || _assistanceStatus.Engine == "unknown" || !_assistance.ReadabilityEnabled && !_assistance.EnhancedChoices) break;
            await Task.Delay(100, token);
        }
    }
    private async Task SetAssistanceAsync(StoryAssistancePreferences preferences)
    {
        var story = _player.Story ?? throw new InvalidOperationException("Open a story first.");
        var token = _opening?.Token ?? default; var revision = ++_assistanceRevision;
        _assistance = preferences.Normalized; _assistanceStory = story.Id;
        if (!_isInputLab) await _assistanceStore.SaveAsync(story, _assistance, token);
        if (_player.Story?.Id == story.Id && revision == _assistanceRevision) await ReapplyAssistanceAsync(token);
    }
    private async void BrowserSizeChanged()
    {
        _zoomResize?.Cancel(); _zoomResize?.Dispose();
        _zoomResize = CancellationTokenSource.CreateLinkedTokenSource(_opening?.Token ?? default);
        var token = _zoomResize.Token;
        try { await Task.Delay(100, token); if (_browser is not null && _assistance.ZoomFactor != 1 && _player.Story?.Id == _assistanceStory) await _player.SetStoryZoomAsync(_assistance.ZoomFactor, _browser.ActualWidth, _browser.ActualHeight, Root.XamlRoot.RasterizationScale, token); }
        catch (OperationCanceledException) { }
        catch (Exception error) { if (!_closed) ShowPresentationError(error.Message); }
    }
    private async void ZoomIn_Click(object sender, RoutedEventArgs e) => await ChangeZoomAsync(.1);
    private async void ZoomOut_Click(object sender, RoutedEventArgs e) => await ChangeZoomAsync(-.1);
    private async void ZoomReset_Click(object sender, RoutedEventArgs e) => await ChangeZoomAsync(0);
    private async Task ChangeZoomAsync(double amount)
    {
        try { await SetAssistanceAsync(_assistance with { ZoomFactor = amount == 0 ? 1 : _assistance.ZoomFactor + amount }); ViewModel.Status = $"Story zoom: {_assistance.ZoomFactor:P0}"; }
        catch (OperationCanceledException) { }
        catch (Exception error) { ShowPresentationError(error.Message); }
    }
    private async void ZoomKey_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    { if (_player.Story is not null) { args.Handled = true; await ChangeZoomAsync(sender.Key == VirtualKey.Number0 ? 0 : sender.Key == VirtualKey.Subtract || (int)sender.Key == 189 ? -.1 : .1); } }
    private void ShowPresentationError(string message)
    { ErrorBar.Title = "Story presentation"; ErrorBar.Message = message; ErrorBar.IsOpen = true; ViewModel.Status = "Presentation action failed; the story remains available."; }
    private async void StorySettings_Click(object sender, RoutedEventArgs e)
    {
        if (_player.Story is null) { ViewModel.Status = "Open a story to configure its presentation."; return; }
        try
        {
            var panel = new StackPanel { Spacing = 12, MinWidth = Math.Max(160, Math.Min(390, Root.ActualWidth - 96)) };
            var zoom = Number("Story zoom", _assistance.ZoomFactor, .75, 1.75, .1);
            var choices = new ToggleSwitch { Header = "Enhanced choices", IsOn = _assistance.EnhancedChoices };
            var readable = new ToggleSwitch { Header = "Readability assistance (verified engines only)", IsOn = _assistance.ReadabilityEnabled };
            var text = Number("Text scale", _assistance.TextScale, .9, 1.3, .05);
            var line = Number("Line height", _assistance.LineHeight, 1.1, 2, .1);
            var paragraph = Number("Paragraph spacing", _assistance.ParagraphSpacing, .5, 2, .1);
            var lengthEnabled = new ToggleSwitch { Header = "Limit readable line length", IsOn = _assistance.ReadableLineLengthEnabled };
            var length = Number("Maximum line length (ch)", _assistance.ReadableLineLength, 45, 90, 5);
            var spacing = Number("Target spacing", _assistance.TargetSpacing, .75, 1.75, .1);
            var status = new TextBlock { Text = "Changes apply to this story. Readability and choice enhancements work with supported story formats.", TextWrapping = TextWrapping.Wrap };
            panel.Children.Add(status);
            panel.Children.Add(SettingsSection("Story display", "Zoom and choice enhancements are saved for this story.", true, zoom, choices));
            panel.Children.Add(SettingsSection("Readability", "Optional text adjustments for verified story engines.", _assistance.ReadabilityEnabled, readable, text, line, paragraph, lengthEnabled, length, spacing));
            void UpdateReadabilityControls()
            {
                text.IsEnabled = line.IsEnabled = paragraph.IsEnabled = lengthEnabled.IsEnabled = spacing.IsEnabled = readable.IsOn;
                length.IsEnabled = readable.IsOn && lengthEnabled.IsOn;
            }
            readable.Toggled += (_, _) => UpdateReadabilityControls(); lengthEnabled.Toggled += (_, _) => UpdateReadabilityControls(); UpdateReadabilityControls();
            var resetRow = new StackPanel { Spacing = 8 };
            var resetZoom = new Button { Content = "Reset zoom" }; resetZoom.Click += (_, _) => zoom.Value = 1;
            var resetReadability = new Button { Content = "Reset readability" }; resetReadability.Click += (_, _) => { readable.IsOn = false; text.Value = 1; line.Value = 1.4; paragraph.Value = 1; lengthEnabled.IsOn = false; length.Value = 72; spacing.Value = 1; };
            var resetAll = new Button { Content = "Reset all" }; resetAll.Click += (_, _) => { zoom.Value = 1; choices.IsOn = false; readable.IsOn = false; text.Value = 1; line.Value = 1.4; paragraph.Value = 1; lengthEnabled.IsOn = false; length.Value = 72; spacing.Value = 1; };
            resetRow.Children.Add(resetZoom); resetRow.Children.Add(resetReadability); resetRow.Children.Add(resetAll); panel.Children.Add(SettingsSection("Reset", "Choose what to restore, then select Apply to save.", false, resetRow));
            var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Story appearance", Content = new ScrollViewer { Content = panel, MaxHeight = Math.Max(200, Root.ActualHeight - 240) }, PrimaryButtonText = "Apply", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Primary };
            if (await dialog.ShowAsync() == ContentDialogResult.Primary)
            {
                await SetAssistanceAsync(new() { ZoomFactor = zoom.Value, EnhancedChoices = choices.IsOn, ReadabilityEnabled = readable.IsOn, TextScale = text.Value, LineHeight = line.Value, ParagraphSpacing = paragraph.Value, ReadableLineLengthEnabled = lengthEnabled.IsOn, ReadableLineLength = length.Value, TargetSpacing = spacing.Value });
                ViewModel.Status = "Story appearance saved.";
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { ShowPresentationError(error.Message); }
        finally { if (!_closed) _browser?.Focus(FocusState.Programmatic); }
    }
    private static NumberBox Number(string header, double value, double min, double max, double step)
    {
        var control = new NumberBox { Header = header, Value = value, Minimum = min, Maximum = max, SmallChange = step, LargeChange = step * 2, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact };
        AutomationProperties.SetName(control, header); return control;
    }
}
