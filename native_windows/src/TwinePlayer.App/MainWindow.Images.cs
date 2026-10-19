using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using TwinePlayer.Native.App.Controls;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Player;
using Windows.ApplicationModel.DataTransfer;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private readonly Dictionary<string, TaskCompletionSource<byte[]>> _imageRequests = [];
    private bool _imagePreviewOpen;
    private ContentDialog? _activeImageDialog;
    private MenuFlyout? _activeImageMenu;
    private async Task<byte[]> ReadImageAsync(string source, CancellationToken token)
    {
        var story = _player.Story ?? throw new InvalidOperationException("No active story.");
        var address = await Task.Run(() => StoryImageRules.Resolve(source, story), token);
        if (address.Kind != "browser") return await Task.Run(() => ImageDataLoader.ReadAsync(address, token), token);
        var id = Guid.NewGuid().ToString(); var document = _player.DocumentGeneration;
        var completion = new TaskCompletionSource<byte[]>(TaskCreationOptions.RunContinuationsAsynchronously); _imageRequests.Add(id, completion);
        try
        {
            await _player.ExecuteScriptAsync($"window.__twinePlayerNativeReadImage({JsonSerializer.Serialize(address.Source)},{JsonSerializer.Serialize(id)});void 0", token);
            var bytes = await completion.Task.WaitAsync(TimeSpan.FromSeconds(15), token);
            if (_player.Story?.Id != story.Id || _player.DocumentGeneration != document) throw new OperationCanceledException("The story changed while loading the image.");
            return bytes;
        }
        finally { _imageRequests.Remove(id); }
    }
    private async Task ShowImageAsync(string source, string alt)
    {
        if (_imagePreviewOpen) return;
        _imagePreviewOpen = true;
        using var loading = CancellationTokenSource.CreateLinkedTokenSource(_opening?.Token ?? default);
        try
        {
            var pane = new ImagePreviewPane(source, alt, Root.ActualWidth - 120, Root.ActualHeight - 250);
            var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = string.IsNullOrWhiteSpace(alt) ? "Image preview" : alt, Content = pane, CloseButtonText = "Close preview", DefaultButton = ContentDialogButton.Close };
            _activeImageDialog = dialog;
            dialog.Resources["ContentDialogMaxWidth"] = Math.Max(320, Root.ActualWidth - 60);
            dialog.Closed += (_, _) => loading.Cancel();
            var shown = dialog.ShowAsync().AsTask();
            try { await pane.LoadAsync(await ReadImageAsync(source, loading.Token)); }
            catch (OperationCanceledException) { }
            catch (Exception error) { pane.ShowFailure(error.Message); }
            await shown;
        }
        finally { _imagePreviewOpen = false; _activeImageDialog = null; if (!_closed) _browser?.Focus(FocusState.Programmatic); }
    }
    private void ShowImageContext(string source, string alt)
    {
        if (_browser is null) return;
        var menu = new MenuFlyout();
        _activeImageMenu = menu;
        var preview = new MenuFlyoutItem { Text = "Preview image" };
        preview.Click += async (_, _) => { try { await ShowImageAsync(source, alt); } catch (Exception error) { ShowPresentationError(error.Message); } };
        var copy = new MenuFlyoutItem { Text = "Copy image source" };
        copy.Click += (_, _) => { try { var package = new DataPackage(); package.SetText(source); Clipboard.SetContent(package); } catch (Exception error) { ShowPresentationError(error.Message); } };
        menu.Items.Add(preview); menu.Items.Add(copy); menu.ShowAt(_browser, new Microsoft.UI.Xaml.Controls.Primitives.FlyoutShowOptions { Position = new Windows.Foundation.Point(_browser.ActualWidth / 2, _browser.ActualHeight / 2) });
    }
}
