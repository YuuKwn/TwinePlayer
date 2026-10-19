using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Player;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private bool _saveDialogOpen;
    private Controls.SaveManagerPanel? _activeSaveManager;
    private bool _saveManagerIsSave;
    private string? _restoreId;
    private TaskCompletionSource<bool>? _restoreCompletion;
    private TaskCompletionSource<byte[]>? _captureCompletion;
    private string? _captureId;
    private TaskCompletionSource<bool>? _testLoadRequest;
    private TaskCompletionSource<bool>? _testSaveRequest;
    private bool _saveSmokeMode;
    private bool _saveActionInProgress;

    private async Task RunSaveActionAsync(Func<Task> action)
    {
        if (_saveActionInProgress || _saveDialogOpen) { ViewModel.Status = "Finish the current save/load action first."; return; }
        _saveActionInProgress = true; SaveButton.IsEnabled = LoadButton.IsEnabled = false;
        SyncSaveButtons();
        try { await action(); }
        finally
        {
            _saveActionInProgress = false;
            if (!_closed)
            {
                SaveButton.IsEnabled = LoadButton.IsEnabled = !_closing && !_isInputLab && _player.Story is not null;
                SyncSaveButtons();
            }
        }
    }

    private async void Save_Click(object sender, RoutedEventArgs e)
    {
        if (_activeSaveManager is { IsOpen: true } && _saveManagerIsSave) { _activeSaveManager.Hide(); return; }
        try
        {
            await RunSaveActionAsync(async () => await ShowSaveManagerAsync(await CaptureBytesAsync(_opening?.Token ?? default)));
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { if (!_closed) ShowSaveError(error.Message); }
    }

    private async void Load_Click(object sender, RoutedEventArgs e)
    {
        if (_activeSaveManager is { IsOpen: true } && !_saveManagerIsSave) { _activeSaveManager.Hide(); return; }
        try
        {
            await RunSaveActionAsync(async () =>
            {
                var detected = await _player.ExecuteScriptAsync("window.__twinePlayerDetectEngine()", _opening?.Token ?? default);
                if (detected == "\"unknown\"") throw new NotSupportedException("Native save/load supports SugarCube 1 and 2. This story does not expose a supported save API.");
                await ShowSaveManagerAsync(null);
            });
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { if (!_closed) ShowSaveError(error.Message); }
    }

    private async void OnStoryMessage(object? sender, BridgeMessage message)
    {
        if (_closed || _closing) return;
        try
        {
            switch (message.Type)
            {
                case "input-activation": ObserveActivation(message.Text ?? "unknown"); break;
                case "native-input-diagnostic": _diagnostics.Record(message.Input); RefreshDiagnosticDisplay(); break;
                case "identity":
                    if (!string.IsNullOrWhiteSpace(message.Text)) ViewModel.Title = message.Text;
                    _currentIfid = message.Level;
                    await LoadSavedCommandsAsync();
                    break;
                case "log":
                    AppendConsole(message.Text ?? "", message.Level ?? "normal");
                    if (message.Level == "error") ShowSaveError(message.Text ?? "The story reported an error.");
                    break;
                case "load-result":
                    if (message.OperationId != _restoreId) break;
                    if (message.Success) _restoreCompletion?.TrySetResult(true);
                    else _restoreCompletion?.TrySetException(new InvalidDataException(message.Text ?? "The game rejected the save."));
                    break;
                case "save-bytes":
                    if (message.OperationId is not null)
                    { if (message.OperationId == _captureId) _captureCompletion?.TrySetResult(message.Bytes!); }
                    else if (!_saveSmokeMode && !_saveActionInProgress) await RunSaveActionAsync(() => ShowSaveManagerAsync(message.Bytes, message.Text));
                    break;
                case "save-result":
                    if (message.OperationId == _captureId) _captureCompletion?.TrySetException(new InvalidDataException(message.Text ?? "The game could not create a save."));
                    break;
                case "save-request":
                    if (_saveSmokeMode) _testSaveRequest?.TrySetResult(true);
                    else Save_Click(this, new RoutedEventArgs());
                    break;
                case "load-request":
                    if (_saveSmokeMode) _testLoadRequest?.TrySetResult(true);
                    else Load_Click(this, new RoutedEventArgs());
                    break;
                case "image-preview": await ShowImageAsync(message.Text!, message.Level ?? ""); break;
                case "image-context": ShowImageContext(message.Text!, message.Level ?? ""); break;
                case "image-data":
                    if (message.OperationId is { } imageId && _imageRequests.TryGetValue(imageId, out var request))
                    { if (message.Success) request.TrySetResult(message.Bytes!); else request.TrySetException(new InvalidDataException(message.Text ?? "Image retrieval failed.")); }
                    break;
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { if (!_closed) ShowSaveError(error.Message); }
    }

    private void ShowSaveError(string message)
    {
        ErrorBar.Title = "Save/load operation failed";
        ErrorBar.Message = message;
        ErrorBar.IsOpen = true;
        ViewModel.Status = "Save/load failed. The current story remains available; review the error and retry.";
    }

    private async Task<byte[]> CaptureBytesAsync(CancellationToken token)
    {
        if (_captureCompletion is not null) throw new InvalidOperationException("Another save capture is in progress.");
        _captureCompletion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        _captureId = Guid.NewGuid().ToString();
        var document = _player.DocumentGeneration;
        try
        {
            var result = await _bridge.CaptureAsync(token, _captureId);
            if (result.Error is not null) throw new InvalidDataException(result.Error);
            if (!result.Pending) return result.Bytes!;
            ViewModel.Status = "The game is preparing a native disk save…";
            var bytes = await _captureCompletion.Task.WaitAsync(TimeSpan.FromSeconds(15), token);
            if (document != _player.DocumentGeneration) throw new OperationCanceledException("The story navigated during capture.");
            return bytes;
        }
        finally { await CancelNativeSaveAsync(_captureId, document); _captureId = null; _captureCompletion = null; }
    }

    private async Task RestoreBytesAsync(byte[] bytes, CancellationToken token)
    {
        _restoreId = Guid.NewGuid().ToString();
        _restoreCompletion = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var document = _player.DocumentGeneration;
        try
        {
            var result = await _bridge.RestoreAsync(bytes, _restoreId, token);
            if (!TwineBridge.IsOk(result)) throw new InvalidDataException(TwineBridge.Error(result));
            if (result.TryGetProperty("pending", out var pending) && pending.ValueKind == JsonValueKind.True)
            {
                ViewModel.Status = "Waiting for the game to finish loading its save…";
                await _restoreCompletion.Task.WaitAsync(TimeSpan.FromSeconds(15), token);
                if (document != _player.DocumentGeneration) throw new OperationCanceledException("The story navigated during restore.");
                ViewModel.Status = "The game finished loading its save.";
            }
            else ViewModel.Status = "Save restored by the game.";
            ErrorBar.IsOpen = false;
        }
        catch (Exception error) when (error is not OperationCanceledException)
        { if (!_closed) ShowSaveError(error.Message); throw; }
        finally { await CancelNativeSaveAsync(_restoreId, document); _restoreId = null; _restoreCompletion = null; }
    }

    private async Task CancelNativeSaveAsync(string? id, long document)
    {
        if (_closed || document != _player.DocumentGeneration) return;
        try { await _player.ExecuteScriptAsync($"window.__twinePlayerCancelNativeSave?.({JsonSerializer.Serialize(id)})"); }
        catch (Exception error) when (error is OperationCanceledException or ObjectDisposedException or InvalidOperationException or System.Runtime.InteropServices.COMException) { }
    }

    private async Task<bool> ConfirmSaveActionAsync(string title, string description, string action)
    {
        var confirm = new ContentDialog { XamlRoot = Root.XamlRoot, Title = title, Content = new TextBlock { Text = description, TextWrapping = TextWrapping.Wrap }, PrimaryButtonText = action, CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
        return await confirm.ShowAsync() == ContentDialogResult.Primary;
    }

    private async Task ShowSaveManagerAsync(byte[]? captured, string? suggested = null)
    {
        if (_saveDialogOpen || _player.Story is not { } story) return;
        _saveDialogOpen = true;
        var token = _opening?.Token ?? default;
        var document = _player.DocumentGeneration;
        var createSaveRequested = false;
        try
        {
            var isSave = captured is not null;
            var filename = new TextBox { Header = "Save filename", Text = suggested ?? $"save_{DateTime.Now:yyyyMMdd_HHmmss}.save", Visibility = isSave ? Visibility.Visible : Visibility.Collapsed };
            var list = new ListView { MinWidth = Math.Max(160, Math.Min(400, Root.ActualWidth - 96)), MaxHeight = 300, SelectionMode = ListViewSelectionMode.Single };
            AutomationProperties.SetName(list, "Save files with modification dates and sizes");
            var error = new TextBlock { TextWrapping = TextWrapping.Wrap };
            AutomationProperties.SetLiveSetting(error, Microsoft.UI.Xaml.Automation.Peers.AutomationLiveSetting.Assertive);
            var content = new StackPanel { Spacing = 12 };
            content.Children.Add(new TextBlock { Text = "Saves remain beside this game in its _saves folder. SugarCube controls the save format.", TextWrapping = TextWrapping.Wrap });
            var createSave = new Button { Content = "Create a new save…", Visibility = isSave ? Visibility.Collapsed : Visibility.Visible };
            content.Children.Add(createSave);
            content.Children.Add(filename);
            content.Children.Add(list);
            content.Children.Add(error);
            var dialog = new Controls.SaveManagerPanel { Title = isSave ? "Save game" : "Load game", Content = content, PrimaryButtonText = isSave ? "Save" : "Load", SecondaryButtonText = "Delete selected", CloseButtonText = "Cancel", IsSecondaryButtonEnabled = false };
            createSave.Click += (_, _) => { createSaveRequested = true; dialog.Hide(); };
            void UpdateActions()
            {
                dialog.IsSecondaryButtonEnabled = list.SelectedItem is SaveEntry;
                if (!isSave) { dialog.IsPrimaryButtonEnabled = list.SelectedItem is SaveEntry; return; }
                try { SaveRules.Filename(filename.Text); dialog.IsPrimaryButtonEnabled = true; filename.Description = "Choose a filename ending in .save."; }
                catch (ArgumentException invalid)
                {
                    dialog.IsPrimaryButtonEnabled = false;
                    filename.Description = string.IsNullOrWhiteSpace(filename.Text) ? "Enter a filename ending in .save." : invalid.Message;
                }
            }
            filename.TextChanged += (_, _) => UpdateActions();
            list.SelectionChanged += (_, _) => { if (isSave && list.SelectedItem is SaveEntry selected) filename.Text = selected.Filename; UpdateActions(); };
            UpdateActions();
            var refresh = true;
            while (!_closed && _player.Story?.Id == story.Id)
            {
                token.ThrowIfCancellationRequested();
                if (refresh)
                {
                    var saves = await _saves.ListAsync(story.FilePath, token);
                    list.ItemsSource = saves;
                    UpdateActions();
                    if (saves.Count == 0) error.Text = "No sidecar saves yet.";
                    refresh = false;
                }
                _activeSaveManager = dialog; _saveManagerIsSave = isSave;
                SaveButton.IsEnabled = isSave; LoadButton.IsEnabled = !isSave; SyncSaveButtons();
                var action = await dialog.ShowAsync(SaveManagerHost);
                _activeSaveManager = null;
                SaveButton.IsEnabled = LoadButton.IsEnabled = false; SyncSaveButtons();
                if (action == ContentDialogResult.None) { if (createSaveRequested) break; return; }
                token.ThrowIfCancellationRequested();
                if (_player.Story?.Id != story.Id || document != _player.DocumentGeneration) throw new OperationCanceledException("The story changed while the save dialog was open.");
                try
                {
                    if (action == ContentDialogResult.Secondary)
                    {
                        if (list.SelectedItem is not SaveEntry selected) { error.Text = "Select a save to delete."; continue; }
                        if (!await ConfirmSaveActionAsync("Delete save?", $"Delete {selected.Filename}?", "Delete")) continue;
                        await _saves.DeleteAsync(story.FilePath, selected.Filename, token);
                        refresh = true;
                        error.Text = "Save deleted.";
                    }
                    else if (isSave)
                    {
                        var name = SaveRules.Filename(filename.Text);
                        var exists = (await _saves.ListAsync(story.FilePath, token)).Any(s => s.Filename.Equals(name, StringComparison.OrdinalIgnoreCase));
                        if (exists && !await ConfirmSaveActionAsync("Overwrite save?", $"Replace {name}? The previous save remains intact if writing fails.", "Overwrite")) continue;
                        await _saves.WriteAsync(story.FilePath, name, captured!, exists, token);
                        ErrorBar.IsOpen = false;
                        ViewModel.Status = $"Saved {name}.";
                        return;
                    }
                    else
                    {
                        if (list.SelectedItem is not SaveEntry selected) { error.Text = "Select a save to load."; continue; }
                        await RestoreBytesAsync(await _saves.ReadAsync(story.FilePath, selected.Filename, token), token);
                        return;
                    }
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception failure) { error.Text = failure.Message; ViewModel.Status = "Save operation failed; the dialog remains available to retry."; }
            }
        }
        finally
        {
            _activeSaveManager?.Hide(); _activeSaveManager = null; _saveDialogOpen = false;
            if (!_closed)
            {
                if (!_saveActionInProgress) SaveButton.IsEnabled = LoadButton.IsEnabled = !_closing && !_isInputLab && _player.Story is not null;
                SyncSaveButtons(); _browser?.Focus(FocusState.Programmatic);
            }
        }
        if (createSaveRequested && !_closed && document == _player.DocumentGeneration)
            await ShowSaveManagerAsync(await CaptureBytesAsync(token));
    }

    private void SyncSaveButtons()
    {
        foreach (var button in ComfortableCommands.Children.OfType<Button>())
        {
            if (button.Tag as string == "save") button.IsEnabled = SaveButton.IsEnabled;
            if (button.Tag as string == "load") button.IsEnabled = LoadButton.IsEnabled;
        }
    }
}
