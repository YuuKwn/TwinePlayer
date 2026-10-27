using Microsoft.Extensions.Logging;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation;
using TwinePlayer.Native.App.Services;
using TwinePlayer.Native.App.ViewModels;
using TwinePlayer.Native.Player;
using TwinePlayer.Native.Persistence;
using TwinePlayer.Native.Core;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow : Window
{
    public PlayerViewModel ViewModel { get; }
    private readonly TwinePlayerService _player;
    private readonly ILogger<MainWindow> _logger;
    private readonly SaveService _saves;
    private readonly TwineBridge _bridge;
    private readonly NativeDatabase _database;
    private readonly FlutterImporter _importer;
    private readonly ConsoleCommandStore _commandStore;
    private readonly StoryAssistanceStore _assistanceStore;
    private WebView2? _browser;
    private CancellationTokenSource? _opening;
    private bool _closed;

    public MainWindow(PlayerViewModel viewModel, TwinePlayerService player, ILogger<MainWindow> logger, SaveService saves, NativeDatabase database, FlutterImporter importer, ConsoleCommandStore commandStore, StoryAssistanceStore assistanceStore)
    {
        ViewModel = viewModel;
        _player = player;
        _logger = logger;
        _saves = saves;
        _bridge = new TwineBridge(player);
        _database = database;
        _importer = importer;
        _commandStore = commandStore;
        _assistanceStore = assistanceStore;
        InitializeComponent();
        Title = "TwinePlayer 1.0";
        AppWindow.Resize(new Windows.Graphics.SizeInt32(1200, 820));
        AppWindow.SetIcon(Path.Combine(AppContext.BaseDirectory, "Assets", "app_icon.ico"));
        InitializeWindowing();
        InitializeStoryKeyboard();
        InitializeInteraction();
        _player.StatusChanged += (_, message) => { if (!_closed) ViewModel.Status = message; };
        _player.Failed += (_, message) => { if (!_closed) ShowError(message); };
        _player.MessageReceived += OnStoryMessage;
        _player.Navigated += async (_, _) => { try { await ReapplyAssistanceAsync(_opening?.Token ?? default); await ApplyInputDiagnosticsAsync(); } catch (OperationCanceledException) { } catch (Exception error) { if (!_closed) ShowPresentationError(error.Message); } };
        foreach (var key in new[] { 187, 107, 189, 109, 48 })
        {
            var accelerator = new Microsoft.UI.Xaml.Input.KeyboardAccelerator { Key = (Windows.System.VirtualKey)key, Modifiers = Windows.System.VirtualKeyModifiers.Control };
            accelerator.Invoked += ZoomKey_Invoked; Root.KeyboardAccelerators.Add(accelerator);
        }
        Root.Loaded += async (_, _) => await RefreshLibraryAsync();
        Root.SizeChanged += (_, args) => { UpdateLibraryDensity(args.NewSize.Height); UpdateSidebarWidth(); };
        Viewport.SizeChanged += (_, _) => { if (ConsolePanel.Visibility == Visibility.Visible) ApplyConsoleLayout(); };
        Closed += (_, _) => { _closed = true; _opening?.Cancel(); _browserMigration?.Cancel(); _zoomResize?.Cancel(); _completionRequest?.Cancel(); _player.Dispose(); _browser?.Close(); };
    }

    private async void OpenGame_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var picker = new Microsoft.Windows.Storage.Pickers.FileOpenPicker(AppWindow.Id);
            picker.FileTypeFilter.Add(".html");
            picker.FileTypeFilter.Add(".htm");
            var result = await picker.PickSingleFileAsync();
            if (result is not null && !_closed) await OpenAsync(result.Path);
        }
        catch (Exception error) { if (!_closed) ShowError(error.Message); _logger.LogError(error, "Open game failed"); }
    }

    internal async Task OpenAsync(string path, bool inputLab = false)
    {
        _activeSaveManager?.Hide();
        _opening?.Cancel();
        _opening?.Dispose();
        _opening = new CancellationTokenSource();
        var opening = _opening;
        var token = _opening.Token;
        OpenButton.IsEnabled = false;
        SaveButton.IsEnabled = LoadButton.IsEnabled = false;
        Loading.Visibility = Visibility.Visible;
        ErrorBar.IsOpen = false;
        ViewModel.Status = "Preparing story…";
        try
        {
            _isInputLab = inputLab;
            ResetConsole();
            _assistanceStory = null; _assistance = new(); _assistanceRevision++; _zoomResize?.Cancel();
            _player.Detach();
            if (_browser is not null) { Viewport.Children.Remove(_browser); _browser.Close(); }
            _browser = new WebView2();
            var browser = _browser;
            browser.SizeChanged += (_, _) => { if (browser == _browser) BrowserSizeChanged(); };
            browser.AddHandler(UIElement.PointerWheelChangedEvent, new Microsoft.UI.Xaml.Input.PointerEventHandler(async (_, args) =>
            {
                if ((Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(Windows.System.VirtualKey.Control) & Windows.UI.Core.CoreVirtualKeyStates.Down) == 0) return;
                var delta = args.GetCurrentPoint(browser).Properties.MouseWheelDelta;
                if (delta == 0) return; args.Handled = true; await ChangeZoomAsync(delta > 0 ? .1 : -.1);
            }), true);
            AutomationProperties.SetName(_browser, "Twine story");
            Viewport.Children.Add(_browser);
            await _player.OpenAsync(_browser, path, token, inputLab);
            token.ThrowIfCancellationRequested();
            var metadata = await Task.Run(() => GameMetadataReader.ReadAsync(path, token), token);
            if (!inputLab) await _database.RegisterAsync(path, metadata, played: true, cancellationToken: token);
            if (string.IsNullOrWhiteSpace(_currentIfid)) _currentIfid = metadata.Ifid;
            Welcome.Visibility = Visibility.Collapsed;
            HomeButton.IsEnabled = true;
            SaveButton.IsEnabled = LoadButton.IsEnabled = !inputLab;
            ViewModel.Title = Path.GetFileNameWithoutExtension(path);
            await LoadSavedCommandsAsync();
            if (!inputLab) await LoadAssistanceAsync(token);
            await ApplyInputDiagnosticsAsync(); ApplyInteractionLayout();
            _browser.Focus(FocusState.Programmatic);
        }
        catch (OperationCanceledException) { }
        catch (Exception) when (token.IsCancellationRequested || !ReferenceEquals(opening, _opening)) { }
        catch (Exception error)
        {
            if (!_closed && ReferenceEquals(opening, _opening))
            {
                _player.Detach();
                ResetConsole();
                if (_browser is not null) { Viewport.Children.Remove(_browser); _browser.Close(); _browser = null; }
                Welcome.Visibility = Visibility.Visible; HomeButton.IsEnabled = SaveButton.IsEnabled = LoadButton.IsEnabled = false;
                ApplyInteractionLayout(); ShowError(error.Message);
            }
            _logger.LogError(error, "Story initialization failed"); throw;
        }
        finally { if (!_closed && ReferenceEquals(opening, _opening)) { OpenButton.IsEnabled = true; Loading.Visibility = Visibility.Collapsed; ApplyPinnedCommands(); } }
    }

    private async void Home_Click(object sender, RoutedEventArgs e)
    {
        try { await RequestHomeAsync(); }
        catch (Exception error) { if (!_closed) ShowPresentationError(error.Message); }
    }

    private bool _homeConfirmationOpen;
    private async Task RequestHomeAsync()
    {
        if (_homeConfirmationOpen || _closed || _closing || _player.Story is not { } story) return;
        if (_saveActionInProgress && _activeSaveManager is not { IsOpen: true })
        { ViewModel.Status = "Finish the current save/load action before leaving the game."; return; }
        _homeConfirmationOpen = true;
        try
        {
            var confirm = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Return to library?",
                Content = "Unsaved progress will be lost. Save your game before leaving.",
                PrimaryButtonText = "Leave game", CloseButtonText = "Stay in game", DefaultButton = ContentDialogButton.Close };
            if (await confirm.ShowAsync() != ContentDialogResult.Primary || _closed || _closing || _player.Story?.Id != story.Id) return;
            _activeSaveManager?.Hide();
            await _saves.WaitForIdleAsync();
            ReturnHome();
            await RefreshLibraryAsync();
        }
        finally
        {
            _homeConfirmationOpen = false;
            if (_activeSaveManager is { IsOpen: true } panel) panel.RestoreFocus(); else RestoreStoryFocus();
        }
    }

    private void ReturnHome()
    {
        _opening?.Cancel();
        ResetConsole();
        _assistanceStory = null; _zoomResize?.Cancel();
        _player.Detach();
        _isInputLab = false; ApplyInteractionLayout();
        if (_browser is not null) { Viewport.Children.Remove(_browser); _browser.Close(); _browser = null; }
        Welcome.Visibility = Visibility.Visible;
        HomeButton.IsEnabled = false;
        SaveButton.IsEnabled = LoadButton.IsEnabled = false;
        ErrorBar.IsOpen = false;
        ViewModel.Title = "Library";
        ViewModel.Status = "Ready";
        RestoreStoryFocus();
    }

    private void ShowError(string message)
    {
        ErrorBar.Title = "Unable to play story";
        ErrorBar.Message = message;
        ErrorBar.IsOpen = true;
        ViewModel.Status = "The story could not be loaded. You can choose another game or return Home.";
    }

    // Invoked only by the locally launched integration runner, never by story content.
    internal void ScheduleSmoke(string input, string output)
    {
        var started = false;
        Root.Loaded += async (_, _) =>
        {
            if (started) return;
            started = true;
            var results = new List<object>();
            try
            {
                var files = System.Text.Json.JsonSerializer.Deserialize<string[]>(await File.ReadAllTextAsync(input))
                    ?? throw new InvalidDataException("Smoke input must list story paths.");
                foreach (var file in files)
                {
                    await OpenAsync(file);
                    if (_player.Core is null || _player.Story is null) throw new InvalidOperationException("Native browser did not initialize.");
                    // Harlowe/Chapbook may create their first passage after NavigationCompleted.
                    for (var attempt = 0; attempt < 80; attempt++)
                    {
                        var length = await _player.Core.ExecuteScriptAsync("(!/sugarcube/i.test(document.querySelector('tw-storydata')?.getAttribute('format')||'')||document.querySelector('#passages .passage'))?(document.body?.innerText.length||0):0");
                        if (int.TryParse(length, out var count) && count > 0) break;
                        await Task.Delay(100);
                    }
                    var snapshot = await _player.Core.ExecuteScriptAsync("JSON.stringify({title:document.title,format:document.querySelector('tw-storydata')?.getAttribute('format'),passage:window.SugarCube?.State?.passage||document.querySelector('tw-passage')?.getAttribute('name'),passageCount:document.querySelectorAll('#passages .passage,tw-passage').length,body:document.body.innerText.length,origin:location.origin,previous:localStorage.getItem('native-smoke-marker'),assets:window.nativeAssetReady===true,css:getComputedStyle(document.body).getPropertyValue('--native-asset-check').trim(),image:document.querySelector('#asset-image')?.naturalWidth||0})");
                    var inner = System.Text.Json.JsonSerializer.Deserialize<string>(snapshot)!;
                    using var data = System.Text.Json.JsonDocument.Parse(inner);
                    if (data.RootElement.GetProperty("body").GetInt32() == 0) throw new InvalidDataException("Story has no rendered body content.");
                    var expectPersisted = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_SMOKE_EXPECT_PERSISTED") == "1";
                    var previous = data.RootElement.GetProperty("previous");
                    if (expectPersisted ? previous.GetString() != "retained" : previous.ValueKind != System.Text.Json.JsonValueKind.Null)
                        throw new InvalidDataException(expectPersisted ? "Story lost storage across application restart." : "Different stories shared localStorage.");
                    if (data.RootElement.TryGetProperty("format", out var format) && format.GetString()?.Equals("SugarCube", StringComparison.OrdinalIgnoreCase) == true && data.RootElement.GetProperty("passageCount").GetInt32() == 0)
                        throw new InvalidDataException("SugarCube did not render a playable passage.");
                    if (file.EndsWith("local-assets.html", StringComparison.OrdinalIgnoreCase))
                    {
                        var interaction = await _player.Core.ExecuteScriptAsync("(()=>{document.querySelector('button').click();const field=document.querySelector('input');field.focus();field.value='native input';window.scrollTo(0,500);return document.querySelector('#passage').textContent==='Second passage'&&field.value==='native input'&&document.activeElement===field&&window.scrollY>0})()");
                        if (interaction != "true") throw new InvalidDataException("DOM passage/form/focus/scroll fixture failed.");
                    }
                    await _player.Core.ExecuteScriptAsync("localStorage.setItem('native-smoke-marker','retained')");
                    var originalOrigin = _player.Story.HostName;
                    await OpenAsync(file);
                    var retained = await _player.Core!.ExecuteScriptAsync("localStorage.getItem('native-smoke-marker')");
                    if (retained != "\"retained\"" || _player.Story!.HostName != originalOrigin) throw new InvalidDataException("Story lost persistent browser storage on reopen.");
                    if (file.EndsWith("local-assets.html", StringComparison.OrdinalIgnoreCase) &&
                        (!data.RootElement.GetProperty("assets").GetBoolean() || data.RootElement.GetProperty("css").GetString() != "passed" || data.RootElement.GetProperty("image").GetInt32() == 0))
                        throw new InvalidDataException("Relative script, CSS or image failed.");
                    var presentation = await ExercisePresentationAsync(file);
                    results.Add(new { file, passed = true, snapshot = data.RootElement.Clone(), retainedAcrossRecreation = true, presentation });
                }
                await RefreshLibraryAsync();
                var library = await _database.ListAsync();
                if (library.Count != files.Length) throw new InvalidDataException("Library registration lost or duplicated stories.");
                LibrarySearch.Text = files[^1];
                await Task.Delay(100); // WinUI queues TextChanged after the property update.
                if (LibraryList.Items.Count != 1) throw new InvalidDataException($"Library path search found {LibraryList.Items.Count} entries for {LibrarySearch.Text}.");
                LibrarySearch.Text = ""; LibrarySort.SelectedIndex = 1;
                await Task.Delay(100);
                var titles = LibraryList.Items.Cast<TwinePlayer.Native.Core.LibraryGame>().Select(g => g.Title).ToArray();
                if (!titles.SequenceEqual(titles.Order(StringComparer.OrdinalIgnoreCase))) throw new InvalidDataException("Library title sorting failed.");
                var startingPlacement = CapturePlacement();
                for (var cycle = 0; cycle < 3; cycle++)
                {
                    ToggleFullscreen(); await Task.Delay(100);
                    if (!IsFullscreen) throw new InvalidDataException("AppWindow did not enter fullscreen.");
                    ToggleFullscreen(); await Task.Delay(100);
                    if (IsFullscreen) throw new InvalidDataException("AppWindow did not exit fullscreen.");
                }
                var restoredPlacement = CapturePlacement();
                if (startingPlacement.Width != restoredPlacement.Width || startingPlacement.Height != restoredPlacement.Height)
                    throw new InvalidDataException("Fullscreen did not restore the original window size.");
                if (await _player.ExecuteScriptAsync("!!window.SugarCube?.Engine") == "true")
                {
                    await _player.ExecuteScriptAsync("SugarCube.Engine.play(SugarCube.State.passage)");
                    var canUndo = await _player.ExecuteScriptAsync("SugarCube.State.index>0");
                    if (canUndo == "true")
                    {
                        var beforeUndo = int.Parse(await _player.ExecuteScriptAsync("SugarCube.State.index"));
                        await UndoStoryAsync();
                        if (int.Parse(await _player.ExecuteScriptAsync("SugarCube.State.index")) != beforeUndo - 1) throw new InvalidDataException("Story undo did not restore the prior engine history entry.");
                    }
                }
                if (await _bridge.RunCommandAsync("1 + 1") != "2") throw new InvalidDataException("Console did not execute in the story.");
                await _bridge.RunCommandAsync("window.__nativeConsoleSmoke=41");
                var completions = await _bridge.CompleteAsync("window.__nativeConsole");
                if (!completions.Contains("window.__nativeConsoleSmoke")) throw new InvalidDataException("Console completion did not inspect the story context.");
                var scope = ConsoleScope ?? throw new InvalidDataException("Console has no story scope.");
                await _commandStore.SaveAsync(scope, "1 + 1");
                await OpenAsync(files[^1]);
                if (scope != ConsoleScope || !(await _commandStore.GetAsync(scope)).Contains("1 + 1")) throw new InvalidDataException("Saved console command did not survive story reopen.");
                ConsolePanel.Visibility = Visibility.Visible; ConsoleLayout.SelectedIndex = 0; ApplyConsoleLayout();
                if (Grid.GetColumn(ConsolePanel) != 0) throw new InvalidDataException("Console overlay layout failed.");
                ConsoleLayout.SelectedIndex = 1; ApplyConsoleLayout();
                Root.UpdateLayout(); ApplyConsoleLayout();
                var consoleViewportWidth = Viewport.ActualWidth;
                if (Grid.GetColumn(ConsolePanel) != (consoleViewportWidth >= 760 ? 1 : 0)) throw new InvalidDataException($"Console responsive layout failed at {consoleViewportWidth} DIP.");
                Viewport.Width = 600; Root.UpdateLayout(); ApplyConsoleLayout();
                if (Grid.GetColumn(ConsolePanel) != 0) throw new InvalidDataException("Console did not fall back to overlay in a narrow viewport.");
                Viewport.Width = double.NaN; Root.UpdateLayout(); ApplyConsoleLayout();
                await RunConsoleAsync("throw new Error('native-console-smoke-error')");
                if (_console.Entries[^1].Level != "error" || !_console.Entries[^1].Message.Contains("native-console-smoke-error")) throw new InvalidDataException("Console error was not shown.");
                await _commandStore.SaveAsync(scope, "1 + 1", true);
                ConsoleClose_Click(this, new RoutedEventArgs());
                await ExerciseInputAsync(files[^1]);
                var quality = await ExerciseQualityAsync(files);
                var invalidRejected = false;
                try { await OpenAsync(Path.Combine(Path.GetDirectoryName(input)!, "missing.html")); }
                catch (FileNotFoundException) { invalidRejected = true; }
                if (!invalidRejected) throw new InvalidDataException("Missing story was not rejected.");
                await File.WriteAllTextAsync(output, System.Text.Json.JsonSerializer.Serialize(new { passed = true, missingFileRejected = true, librarySearchAndSort = true, fullscreenCycles = 3, windowSizeRestored = true, consoleExecutionCompletionStorageLayouts = true, adaptiveInputDiagnosticsOfflineLab = true, quality, results }, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
            }
            catch (Exception error)
            {
                _logger.LogError(error, "Native smoke suite failed");
                await File.WriteAllTextAsync(output, System.Text.Json.JsonSerializer.Serialize(new { passed = false, error = error.ToString(), results }, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
            }
            finally { await RequestCloseAsync(); }
        };
    }
}

