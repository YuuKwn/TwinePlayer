using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using TwinePlayer.Native.Core;
using Windows.Graphics;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private WindowPlacement _normalPlacement = new(100, 100, 1200, 820);
    private WindowPlacement? _beforeFullscreen;
    private bool _placementInitialized;
    private bool _closing;
    private bool _closeReady;
    private bool IsFullscreen => AppWindow.Presenter.Kind == AppWindowPresenterKind.FullScreen;

    private void InitializeWindowing()
    {
        ExtendsContentIntoTitleBar = true; SetTitleBar(NativeTitleBar);
        SystemBackdrop = new MicaBackdrop();
        ApplyInteractionLayout();
        Root.Loaded += async (_, _) =>
        {
            if (_placementInitialized) return;
            _placementInitialized = true;
            try
            {
                var saved = await _database.GetPreferenceAsync("window-placement");
                if (saved is not null && JsonSerializer.Deserialize<WindowPlacement>(saved) is { } placement) ApplyPlacement(placement);
                else
                {
                    var scale = Root.XamlRoot.RasterizationScale;
                    AppWindow.Resize(new((int)Math.Round(1200 * scale), (int)Math.Round(820 * scale)));
                    ClampWindowToDisplay(); _normalPlacement = CapturePlacement();
                }
                Root.XamlRoot.Changed += (_, _) => { if (!IsFullscreen && !_closing) ClampWindowToDisplay(); if (!_closing && _browser is not null) BrowserSizeChanged(); };
                OpenButton.Focus(FocusState.Programmatic);
            }
            catch (Exception error) { if (!_closed) ShowError("Window placement could not be restored: " + error.Message); }
        };
        AppWindow.Changed += (_, change) =>
        {
            if (!IsFullscreen && AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Restored } && (change.DidPositionChange || change.DidSizeChange))
                _normalPlacement = new(AppWindow.Position.X, AppWindow.Position.Y, AppWindow.Size.Width, AppWindow.Size.Height);
            NativeTitleBar.Visibility = IsFullscreen ? Visibility.Collapsed : Visibility.Visible;
            HomeButton.Visibility = _player.Story is not null ? Visibility.Visible : Visibility.Collapsed;
            FullscreenButton.IsChecked = IsFullscreen;
        };
        AppWindow.Closing += async (_, args) =>
        {
            if (_closeReady) return;
            args.Cancel = true;
            await RequestCloseAsync();
        };
    }
    private void TitleBar_BackRequested(TitleBar sender, object args) { if (_player.Story is not null) Home_Click(sender, new RoutedEventArgs()); }
    private async Task RequestCloseAsync()
    {
        if (_closing) return;
        _closing = true; _opening?.Cancel(); _browserMigration?.Cancel();
        OpenButton.IsEnabled = SaveButton.IsEnabled = LoadButton.IsEnabled = false;
        try
        {
            await _saves.WaitForIdleAsync();
            await _database.SetPreferenceAsync("window-placement", JsonSerializer.Serialize(_beforeFullscreen ?? CapturePlacement()));
        }
        catch (Exception error) { _logger.LogError(error, "Could not persist window placement during close"); }
        finally { _closeReady = true; Close(); }
    }
    private WindowPlacement CapturePlacement() => AppWindow.Presenter is OverlappedPresenter { State: OverlappedPresenterState.Maximized }
        ? _normalPlacement with { Maximized = true }
        : new(AppWindow.Position.X, AppWindow.Position.Y, AppWindow.Size.Width, AppWindow.Size.Height);
    private void ApplyPlacement(WindowPlacement placement)
    {
        var display = DisplayArea.GetFromRect(new RectInt32(placement.X, placement.Y, Math.Max(1, placement.Width), Math.Max(1, placement.Height)), DisplayAreaFallback.Nearest);
        var area = display.WorkArea; var clamped = placement.Clamp(area.X, area.Y, area.Width, area.Height);
        AppWindow.MoveAndResize(new(clamped.X, clamped.Y, clamped.Width, clamped.Height)); _normalPlacement = clamped with { Maximized = false };
        if (clamped.Maximized && AppWindow.Presenter is OverlappedPresenter presenter) presenter.Maximize();
    }
    private void ClampWindowToDisplay()
    {
        if (AppWindow.Presenter is not OverlappedPresenter { State: OverlappedPresenterState.Restored }) return;
        var current = CapturePlacement(); var area = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest).WorkArea;
        var clamped = current.Clamp(area.X, area.Y, area.Width, area.Height);
        if (clamped != current) AppWindow.MoveAndResize(new(clamped.X, clamped.Y, clamped.Width, clamped.Height));
    }
    private void ToggleFullscreen()
    {
        try
        {
            if (IsFullscreen)
            {
                AppWindow.SetPresenter(AppWindowPresenterKind.Overlapped);
                if (_beforeFullscreen is { } saved) ApplyPlacement(saved);
                _beforeFullscreen = null;
            }
            else { _beforeFullscreen = CapturePlacement(); AppWindow.SetPresenter(AppWindowPresenterKind.FullScreen); }
            FullscreenButton.IsChecked = IsFullscreen;
            _browser?.Focus(FocusState.Programmatic);
        }
        catch (Exception error) { ShowError("Fullscreen transition failed: " + error.Message); }
    }
    private void Fullscreen_Click(object sender, RoutedEventArgs e) => ToggleFullscreen();
    private void FullscreenKey_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args) { ToggleFullscreen(); args.Handled = true; }
    private void EscapeKey_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args) { if (IsFullscreen) { ToggleFullscreen(); args.Handled = true; } }
    private async void UndoStory_Click(object sender, RoutedEventArgs e)
        => await UndoStoryAsync();
    private async Task UndoStoryAsync()
    {
        try
        {
            await _player.ExecuteScriptAsync("(()=>{const sc=window.SugarCube||{};if(sc.Engine&&typeof sc.Engine.backward==='function')return sc.Engine.backward();if(window.Engine&&typeof Engine.backward==='function')return Engine.backward();return window.history.back()})()", _opening?.Token ?? default);
            _browser?.Focus(FocusState.Programmatic);
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { ShowSaveError("Story undo failed: " + error.Message); }
    }
    private async void ReloadStory_Click(object sender, RoutedEventArgs e) { if (_player.Story is { } story) { try { await OpenAsync(story.FilePath, _isInputLab); } catch (Exception error) { ShowError(error.Message); } } }
}
