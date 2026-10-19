using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
namespace TwinePlayer.Native.App;
public sealed partial class MainWindow
{
    private async void ResetBrowserData_Click(object sender, RoutedEventArgs e)
    {
        if (_player.Story is not { } story) { ViewModel.Status = "Open a story to reset its browser data."; return; }
        try
        {
            var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Reset this story's browser data?", Content = "This deletes browser localStorage, IndexedDB, cookies and cached data for this story and reloads it. In-browser progress may be lost. Export a sidecar save first. Other stories, library entries and existing .save files are preserved.", PrimaryButtonText = "Reset browser data", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;
            if (_player.Story?.Id != story.Id) throw new OperationCanceledException("The story changed while confirming reset.");
            await _player.ClearStoryBrowserDataAsync(); await OpenAsync(story.FilePath, _isInputLab);
            ViewModel.Status = "This story's browser data was reset. Sidecar saves and other stories were preserved.";
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { ShowPresentationError(error.Message); }
        finally { RestoreStoryFocus(); }
    }
}
