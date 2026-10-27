using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using TwinePlayer.Native.Core;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    // Explicit test mode only: isolated database, no browser content or OS settings changes.
    internal void ScheduleUxSmoke(string input, string report)
    {
        var started = false;
        Root.Loaded += async (_, _) =>
        {
            if (started) return; started = true;
            var output = Path.GetDirectoryName(Path.GetFullPath(report))!;
            var captures = new List<string>();
            var menuLabels = Array.Empty<string>();
            try
            {
                await RefreshLibraryAsync();
                if (Title != "TwinePlayer 1.1" || NativeTitleBar.Title != "TwinePlayer 1.1" || NativeTitleBar.IconSource is not BitmapIconSource || !File.Exists(Path.Combine(AppContext.BaseDirectory, "Assets", "app_icon.png")))
                    throw new InvalidDataException($"Official branding mismatch: title={Title}; subtitle={NativeTitleBar.Subtitle}; icon={NativeTitleBar.IconSource?.GetType().FullName}; PNG={File.Exists(Path.Combine(AppContext.BaseDirectory, "Assets", "app_icon.png"))}.");
                if (_library.Count != 0) throw new InvalidDataException("UX smoke requires a new isolated library.");
                async Task Capture(string name, ElementTheme theme, int width, FrameworkElement? target = null, int height = 820)
                {
                    Root.RequestedTheme = theme;
                    // XAML RenderTargetBitmap cannot capture compositor Mica. Flatten its
                    // background to the native theme color only for these layout PNGs.
                    Root.Background = new SolidColorBrush(theme == ElementTheme.Dark ? Windows.UI.Color.FromArgb(255, 32, 32, 32) : Windows.UI.Color.FromArgb(255, 243, 243, 243));
                    var scale = Root.XamlRoot.RasterizationScale;
                    AppWindow.Resize(new((int)Math.Round(width * scale), (int)Math.Round(height * scale)));
                    await Task.Delay(180); Root.UpdateLayout();
                    var element = target ?? Root;
                    if (target is not null && !target.IsLoaded) throw new InvalidDataException("Popup detached before its layout capture.");
                    if (target is not null) target.RequestedTheme = theme;
                    var bitmap = new RenderTargetBitmap();
                    await bitmap.RenderAsync(element, Math.Max(1, (int)element.ActualWidth), Math.Max(1, (int)element.ActualHeight));
                    using var reader = DataReader.FromBuffer(await bitmap.GetPixelsAsync());
                    var pixels = new byte[reader.UnconsumedBufferLength]; reader.ReadBytes(pixels);
                    using var stream = new InMemoryRandomAccessStream();
                    var encoder = await BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream);
                    encoder.SetPixelData(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Premultiplied, (uint)bitmap.PixelWidth, (uint)bitmap.PixelHeight, 96, 96, pixels);
                    await encoder.FlushAsync(); stream.Seek(0);
                    using var encoded = new DataReader(stream.GetInputStreamAt(0));
                    await encoded.LoadAsync((uint)stream.Size); var png = new byte[(int)stream.Size]; encoded.ReadBytes(png);
                    await File.WriteAllBytesAsync(Path.Combine(output, name + ".png"), png); captures.Add(name);
                }
                await Capture("empty-light", ElementTheme.Light, 1200);
                if (LibraryEmptyState.Visibility != Visibility.Visible || SaveButton.Visibility != Visibility.Collapsed || PlaySelectedButton.IsEnabled)
                    throw new InvalidDataException("Empty library showed unavailable player actions.");
                await Capture("empty-dark", ElementTheme.Dark, 1200);
                await Capture("empty-short", ElementTheme.Light, 640, height: 480);
                var openPosition = EmptyOpenButton.TransformToVisual(LibraryEmptyScroll).TransformPoint(new Windows.Foundation.Point());
                if (openPosition.Y < 0 || openPosition.Y + EmptyOpenButton.ActualHeight > LibraryEmptyScroll.ActualHeight + 1)
                    throw new InvalidDataException("Short-window empty state clips its Open action.");
                var files = JsonSerializer.Deserialize<string[]>(await File.ReadAllTextAsync(input)) ?? [];
                foreach (var file in files) await _database.RegisterAsync(file, await GameMetadataReader.ReadAsync(file), played: true);
                await _database.RegisterAsync(Path.Combine(output, "missing-story.html"), new GameMetadata("An unavailable story", "UX fixture", null));
                await RefreshLibraryAsync();
                if (LibraryList.Items.Count != files.Length + 1 || LibraryEmptyState.Visibility != Visibility.Collapsed) throw new InvalidDataException("Populated library layout did not replace the empty state.");
                LibraryList.SelectedItem = _library.First(game => game.Missing);
                if (PlaySelectedButton.IsEnabled || !RelinkSelectedButton.IsEnabled) throw new InvalidDataException("Missing game action availability is incorrect.");
                await Capture("library-light", ElementTheme.Light, 1200);
                await Capture("library-dark", ElementTheme.Dark, 1200);
                CollapseBar_Click(this, new RoutedEventArgs());
                await Capture("library-expanded", ElementTheme.Light, 1200);
                VerifySidebarPresentation(true);
                CollapseBar_Click(this, new RoutedEventArgs());
                await Capture("library-narrow", ElementTheme.Light, 640);
                if (Grid.GetRow(LibrarySort) != 1 || Grid.GetColumnSpan(LibrarySearch) != 2 || LibrarySearch.ActualWidth > Welcome.ActualWidth)
                    throw new InvalidDataException("Narrow library tools did not reflow.");
                await Capture("library-short", ElementTheme.Light, 640, height: 480);
                if (LibraryList.ActualHeight < 40 || LibraryTagline.Visibility != Visibility.Collapsed) throw new InvalidDataException("Short-window library did not preserve usable list space.");
                LibrarySearch.Text = "no-match-ux-fixture"; await Task.Delay(100);
                if (LibraryList.Items.Count != 0 || ClearSearchButton.Visibility != Visibility.Visible || EmptyOpenButton.Visibility != Visibility.Collapsed)
                    throw new InvalidDataException("Search empty state is incorrect.");
                await Capture("search-empty", ElementTheme.Dark, 640);
                ClearLibrarySearch_Click(this, new RoutedEventArgs()); await Task.Delay(100);
                if (LibraryList.Items.Count != files.Length + 1) throw new InvalidDataException("Clear search did not restore games.");
                InteractionSettings_Click(this, new RoutedEventArgs()); await Task.Delay(200);
                ContentDialog? dialog = null;
                foreach (var popup in VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot))
                    if (FindUxDialog(popup.Child) is { } candidate) { dialog = candidate; break; }
                if (dialog is null) throw new InvalidDataException("Interaction settings did not open.");
                try { await Capture("interaction-settings", ElementTheme.Light, 640, dialog); }
                finally { dialog.Hide(); }
                await Task.Delay(150);
                await OpenAsync(files[0]);
                if (NativeTitleBar.IsBackButtonVisible || SaveButton.Visibility != Visibility.Visible || HomeButton.Visibility != Visibility.Visible || Grid.GetColumn(RightSidebar) != 1 || Root.RowDefinitions.Count != 2)
                    throw new InvalidDataException("Player chrome did not replace library chrome.");
                await Capture("player-sidebar-compact", ElementTheme.Dark, 1200);
                VerifySidebarPresentation(false);
                VerifyUxAccessKeys();
                var sidebarPosition = RightSidebar.TransformToVisual(Root).TransformPoint(new Windows.Foundation.Point());
                if (sidebarPosition.X < Viewport.ActualWidth - 1 || Math.Abs(RightSidebar.ActualHeight - (Viewport.ActualHeight - 8)) > 2)
                    throw new InvalidDataException("Sidebar is not at the right edge for the full content height.");
                CollapseBar_Click(this, new RoutedEventArgs());
                await Capture("player-sidebar-expanded", ElementTheme.Dark, 1200);
                VerifySidebarPresentation(true);
                _interaction.Select(InteractionProfile.Comfortable); _barPreferences = new() { Size = BarSize.Large }; ApplyInteractionLayout();
                await Capture("player-sidebar-comfortable", ElementTheme.Light, 1200);
                foreach (var alignment in new[] { BarAlignment.Start, BarAlignment.End, BarAlignment.Center })
                {
                    _barPreferences = _barPreferences with { Alignment = alignment }; ApplyInteractionLayout(); await Task.Delay(50); Root.UpdateLayout();
                    var free = ComfortableLayout.ActualHeight - ComfortableCommands.ActualHeight;
                    var top = ComfortableCommands.TransformToVisual(ComfortableLayout).TransformPoint(new Windows.Foundation.Point()).Y;
                    var expected = alignment == BarAlignment.Start ? 0 : alignment == BarAlignment.End ? free : free / 2;
                    if (free > 2 && Math.Abs(top - expected) > 2) throw new InvalidDataException("Sidebar vertical placement did not move its commands.");
                }
                if (ComfortableBar.Visibility != Visibility.Visible || ComfortableCommands.Orientation != Orientation.Vertical || ComfortableScroll.VerticalScrollMode != ScrollMode.Auto)
                    throw new InvalidDataException("Touch sidebar is not vertical and scrollable.");
                VerifyUxAccessKeys();
                var more = BuildPlayerMoreMenu();
                if (!more.Items.OfType<MenuFlyoutSubItem>().Any(item => item.Text == "Story zoom") || !more.Items.OfType<MenuFlyoutSubItem>().Any(item => item.Text == "Tools") || more.Items[^1] is not MenuFlyoutItem { Text: "Reset this story's browser data…" })
                    throw new InvalidDataException("Player menu lost contextual groups or separated reset action.");
                more.ShowAt(ComfortablePinned.Children.Cast<Button>().Single(button => button.Tag as string == "more")); await Task.Delay(120);
                var presenter = VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot).Select(popup => FindUxElement<MenuFlyoutPresenter>(popup.Child)).FirstOrDefault(element => element is not null);
                try
                {
                    if (presenter is null || !presenter.IsLoaded || presenter.ActualHeight <= 0) throw new InvalidDataException("Grouped native menu did not open.");
                    // Native flyout pixels are not captured by RenderTargetBitmap.
                    // Inspect its actual loaded automation tree instead of counting
                    // a transparent bitmap as visual evidence.
                    var peer = FrameworkElementAutomationPeer.CreatePeerForElement(presenter);
                    menuLabels = peer?.GetChildren()?.Select(child => child.GetName()).ToArray() ?? [];
                    if (!menuLabels.Contains("Open game…") || !menuLabels.Contains("Tools")) throw new InvalidDataException("Native menu automation did not expose its actions.");
                }
                finally { more.Hide(); }
                await Capture("player-sidebar-short", ElementTheme.Dark, 640, height: 480);
                if (ComfortableScroll.ScrollableHeight <= 0 || Viewport.ActualWidth < 300) throw new InvalidDataException("Short sidebar lost scroll access or obscured too much story width.");
                CollapseBar_Click(this, new RoutedEventArgs());
                await Capture("player-sidebar-icons", ElementTheme.Light, 640, height: 480);
                VerifySidebarPresentation(false);
                if (ComfortableBar.Visibility != Visibility.Visible || ComfortableScroll.Visibility != Visibility.Visible || ComfortablePinned.Visibility != Visibility.Visible)
                    throw new InvalidDataException("Icon rail hid its player commands.");
                VerifyUxAccessKeys();
                var iconWidth = RightSidebar.ActualWidth;
                CollapseBar_Click(this, new RoutedEventArgs());
                await Capture("player-sidebar-expanded-short", ElementTheme.Light, 640, height: 480);
                VerifySidebarPresentation(true);
                if (RightSidebar.ActualWidth < iconWidth * 2) throw new InvalidDataException("Expanded sidebar did not meaningfully change width.");
                var consoleColors = new List<Windows.UI.Color>();
                ConsolePanel.Visibility = Visibility.Visible;
                foreach (var theme in new[] { ElementTheme.Light, ElementTheme.Dark })
                {
                    ConsoleLayout.SelectedIndex = 0; ApplyConsoleLayout();
                    await Capture("console-overlay-" + theme.ToString().ToLowerInvariant(), theme, 1200);
                    if (ConsolePanel.Background is not SolidColorBrush { Color.A: 255 } surface || Grid.GetColumn(ConsolePanel) != 0 || ConsoleColumn.Width.Value != 0)
                        throw new InvalidDataException("Overlay console is not an opaque themed surface over the story.");
                    consoleColors.Add(surface.Color);
                    ConsoleLayout.SelectedIndex = 1; ApplyConsoleLayout();
                    await Capture("console-docked-" + theme.ToString().ToLowerInvariant(), theme, 1200);
                    if (ConsolePanel.Background is not SolidColorBrush { Color.A: 255 } || Grid.GetColumn(ConsolePanel) != 1)
                        throw new InvalidDataException("Docked console lost its opaque surface.");
                }
                if (consoleColors[0] == consoleColors[1]) throw new InvalidDataException("Console surface did not follow light/dark theme changes.");
                await ExerciseConsolePanesAsync((name, theme, width, height) => Capture(name, theme, width, height: height));
                ConsoleClose_Click(this, new RoutedEventArgs());
                StorySettings_Click(this, new RoutedEventArgs()); await Task.Delay(200);
                dialog = VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot).Select(popup => FindUxDialog(popup.Child)).FirstOrDefault(candidate => candidate?.Title as string == "Story appearance");
                if (dialog is null) throw new InvalidDataException("Story appearance settings did not open.");
                if (dialog.DefaultButton != ContentDialogButton.Primary) throw new InvalidDataException("Settings Apply is not the primary action.");
                try
                {
                    await Capture("story-appearance-light", ElementTheme.Light, 640, dialog);
                    await Capture("story-appearance-dark", ElementTheme.Dark, 640, dialog);
                }
                finally { dialog.Hide(); }
                await Task.Delay(150);
                // Only this disposable fixture copy is used for form validation.
                // The generated selection payload is never loaded into an engine.
                var formGame = Path.Combine(output, "save-form-fixture.html"); File.Copy(files[0], formGame);
                await OpenAsync(formGame);
                await _saves.WriteAsync(formGame, "selection.save", System.Text.Encoding.UTF8.GetBytes("{\"fixture\":true}"), false);
                var manager = ShowSaveManagerAsync(null); await Task.Delay(150);
                var savePanel = _activeSaveManager;
                if (savePanel is null || savePanel.Title != "Load game") throw new InvalidDataException("Load form did not open.");
                try
                {
                    if (savePanel.IsPrimaryButtonEnabled || savePanel.IsSecondaryButtonEnabled) throw new InvalidDataException("Load/delete are enabled without a selection.");
                    var saveList = FindUxElement<ListView>(savePanel) ?? throw new InvalidDataException("Load list is absent.");
                    saveList.SelectedIndex = 0; await Task.Delay(60);
                    if (!savePanel.IsPrimaryButtonEnabled || !savePanel.IsSecondaryButtonEnabled) throw new InvalidDataException("Selected save did not enable Load/delete.");
                    await Capture("load-selected", ElementTheme.Light, 640, savePanel);
                    await Capture("load-sidebar-available", ElementTheme.Light, 1200);
                }
                finally { savePanel.Hide(); await manager; }
                manager = ShowSaveManagerAsync(System.Text.Encoding.UTF8.GetBytes("{\"fixture\":true}"), "bad/name.save"); await Task.Delay(150);
                savePanel = _activeSaveManager;
                if (savePanel is null || savePanel.Title != "Save game") throw new InvalidDataException("Save form did not open.");
                try
                {
                    var name = FindUxElement<TextBox>(savePanel) ?? throw new InvalidDataException("Save filename field is absent.");
                    if (savePanel.IsPrimaryButtonEnabled || name.Description is not string { Length: > 0 }) throw new InvalidDataException("Invalid filename has no inline guard.");
                    await Capture("save-inline-validation", ElementTheme.Dark, 640, savePanel);
                    name.Text = "recovered.save"; await Task.Delay(60);
                    if (!savePanel.IsPrimaryButtonEnabled) throw new InvalidDataException("Correcting the filename did not enable Save.");
                    name.Text = ""; await Task.Delay(60);
                    if (savePanel.IsPrimaryButtonEnabled) throw new InvalidDataException("Empty filename enabled Save.");
                }
                finally { savePanel.Hide(); await manager; }
                if ((await _saves.ListAsync(formGame)).Count != 1) throw new InvalidDataException("Canceled form validation wrote an extra save.");
                await ExerciseCommandShortcutsAsync(files, (name, theme, width) => Capture(name, theme, width));
                await ExerciseHomeConfirmationAsync();
                if (_player.Story is not null || Welcome.Visibility != Visibility.Visible || NativeTitleBar.IsBackButtonEnabled || SaveButton.Visibility != Visibility.Collapsed)
                    throw new InvalidDataException("Sidebar library action did not return to a usable library.");
                await File.WriteAllTextAsync(report, JsonSerializer.Serialize(new { passed = true, captures, menuLabels, scope = "Native XAML layout renders; Mica/WebView/native-flyout pixels excluded; menu uses actual UIA; no physical/client certification", contextualActions = true, missingSelection = true, narrowReflow = true, searchRecovery = true, rightSidebar = true, sidebarIconsAndLabels = true, opaqueThemedConsole = true, sidebarLibrary = true, nativeSettings = true, accessKeysNoVisibleCollisions = true, groupedNativeMenu = true, saveLoadInlineValidation = true, settingsPrimaryAction = true, perGameCommandShortcuts = true, scrollableResizableConsolePanes = true }));
            }
            catch (Exception error) { await File.WriteAllTextAsync(report, JsonSerializer.Serialize(new { passed = false, error = error.ToString(), captures })); }
            finally { await RequestCloseAsync(); }
        };
    }
    private async Task ExerciseConsolePanesAsync(Func<string, ElementTheme, int, int, Task> capture)
    {
        var commands = Enumerable.Range(0, 50).Select(index => $"window.__savedListSmoke = {index}").ToArray();
        SavedCommands.ItemsSource = commands;
        for (var index = 0; index < 80; index++) AppendConsole("History item " + index, "normal");
        ConsoleLayout.SelectedIndex = 0; ApplyConsoleLayout();
        await capture("console-lists-overlay", ElementTheme.Dark, 1200, 820);
        var savedScroll = FindUxElement<ScrollViewer>(SavedCommands) ?? throw new InvalidDataException("Saved commands have no scroll container.");
        var historyScroll = FindUxElement<ScrollViewer>(ConsoleLogs) ?? throw new InvalidDataException("Console history has no scroll container.");
        if (savedScroll.ScrollableHeight <= 0 || historyScroll.ScrollableHeight <= 0 || SavedCommands.ItemsPanelRoot is not ItemsStackPanel { Orientation: Orientation.Vertical })
            throw new InvalidDataException("Console lists do not scroll vertically within their containers.");
        var historyOffset = historyScroll.VerticalOffset;
        savedScroll.ChangeView(null, savedScroll.ScrollableHeight, null, true); await Task.Delay(80);
        if (savedScroll.VerticalOffset <= 0 || Math.Abs(historyScroll.VerticalOffset - historyOffset) > 1)
            throw new InvalidDataException("Saved commands cannot scroll independently of history.");
        SavedCommands.SelectedItem = commands[^1];
        ConsoleRunSaved_Click(this, new RoutedEventArgs()); await Task.Delay(80);
        if (await _player.ExecuteScriptAsync("window.__savedListSmoke") != "49") throw new InvalidDataException("A scrolled saved command could not be selected and run.");
        var historyHeight = ConsoleHistoryRow.ActualHeight; var savedHeight = ConsoleSavedRow.ActualHeight;
        ConsoleDivider_DragDelta(ConsoleResizeThumb, new Microsoft.UI.Xaml.Controls.Primitives.DragDeltaEventArgs(0, -70)); Root.UpdateLayout();
        if (ConsoleHistoryRow.ActualHeight >= historyHeight - 1 || ConsoleSavedRow.ActualHeight <= savedHeight + 1)
            throw new InvalidDataException("Dragging up did not give space to saved commands.");
        await capture("console-lists-saved-expanded", ElementTheme.Light, 1200, 820);
        historyHeight = ConsoleHistoryRow.ActualHeight;
        ConsoleDivider_DragDelta(ConsoleResizeThumb, new Microsoft.UI.Xaml.Controls.Primitives.DragDeltaEventArgs(0, 110)); Root.UpdateLayout();
        if (ConsoleHistoryRow.ActualHeight <= historyHeight + 1) throw new InvalidDataException("Dragging down did not give space to history.");
        var share = _consoleHistoryShare;
        ConsoleLayout.SelectedIndex = 1; ApplyConsoleLayout();
        await capture("console-lists-docked", ElementTheme.Dark, 1200, 820);
        if (Math.Abs(share - _consoleHistoryShare) > .01 || Grid.GetColumn(ConsolePanel) != 1) throw new InvalidDataException("Changing console layout lost the divider position.");
        ResizeConsolePanes(double.MaxValue); Root.UpdateLayout();
        if (ConsoleSavedRow.ActualHeight < 99) throw new InvalidDataException("History resizing collapsed saved commands.");
        ResizeConsolePanes(0); Root.UpdateLayout();
        if (ConsoleHistoryRow.ActualHeight < 99) throw new InvalidDataException("Saved-command resizing collapsed history.");
        ResizeConsolePanes((ConsolePanes.ActualHeight - ConsoleDivider.ActualHeight) * .6);
        await capture("console-lists-short", ElementTheme.Light, 640, 480);
        if (ConsoleHistoryRow.ActualHeight <= 0 || ConsoleSavedRow.ActualHeight <= 0 || SavedCommands.ActualHeight < 32 || ConsoleLogs.ActualHeight < 32)
            throw new InvalidDataException("Short-window console lost a list viewport.");
        var inputPosition = ConsoleInput.TransformToVisual(ConsolePanel).TransformPoint(new Windows.Foundation.Point());
        if (inputPosition.Y + ConsoleInput.ActualHeight > ConsolePanel.ActualHeight) throw new InvalidDataException("Resized lists clipped console input.");
        await LoadSavedCommandsAsync();
    }
    private static ContentDialog? FindUxDialog(DependencyObject? root)
        => FindUxElement<ContentDialog>(root);

    private static void InvokeUxButton(Button button)
    {
        if (!button.IsEnabled || button.Visibility != Visibility.Visible) throw new InvalidDataException("Sidebar action is unavailable.");
        var peer = FrameworkElementAutomationPeer.CreatePeerForElement(button);
        ((Microsoft.UI.Xaml.Automation.Provider.IInvokeProvider)peer.GetPattern(PatternInterface.Invoke)).Invoke();
    }
    private void AssertSidebarHitTarget(Button button)
    {
        var point = button.TransformToVisual(Root).TransformPoint(new(button.ActualWidth / 2, button.ActualHeight / 2));
        var hit = VisualTreeHelper.FindElementsInHostCoordinates(point, Root).FirstOrDefault();
        while (hit is not null && hit != button) hit = VisualTreeHelper.GetParent(hit) as UIElement;
        if (hit != button) throw new InvalidDataException("The save manager blocks its sidebar toggle's hit target.");
    }
    private async Task ExerciseHomeConfirmationAsync()
    {
        await _player.ExecuteScriptAsync("window.__nativeHomeMarker='preserved'");
        var core = _player.Core;
        var managerTask = ShowSaveManagerAsync(null);
        for (var i = 0; i < 100 && _activeSaveManager is not { IsOpen: true }; i++) await Task.Delay(20);
        var openManager = _activeSaveManager ?? throw new InvalidDataException("Home preservation test needs an open save manager.");
        async Task<ContentDialog> WaitConfirmation()
        {
            for (var i = 0; i < 100; i++)
            {
                var prompt = VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot).Select(p => FindUxDialog(p.Child)).FirstOrDefault(d => d?.Title as string == "Return to library?");
                if (prompt is not null) return prompt;
                await Task.Delay(20);
            }
            throw new InvalidDataException("Home did not request confirmation.");
        }
        foreach (var profile in new[] { InteractionProfile.Compact, InteractionProfile.Comfortable })
        {
            _interaction.Select(profile); ApplyInteractionLayout(); await Task.Delay(80);
            var home = profile == InteractionProfile.Compact ? HomeButton : ComfortableCommands.Children.OfType<Button>().Single(b => b.Tag as string == "back");
            InvokeUxButton(home);
            var prompt = await WaitConfirmation();
            if (prompt.DefaultButton != ContentDialogButton.Close || prompt.CloseButtonText != "Stay in game" || _player.Core != core)
                throw new InvalidDataException("Home confirmation did not default to preserving the game.");
            prompt.Hide();
            for (var i = 0; i < 100 && _homeConfirmationOpen; i++) await Task.Delay(20);
            if (_player.Core != core || await _player.ExecuteScriptAsync("window.__nativeHomeMarker") != "\"preserved\"")
                throw new InvalidDataException("Canceling Home lost the current game state.");
            if (_activeSaveManager != openManager || !openManager.IsOpen) throw new InvalidDataException("Canceling Home discarded the open save manager.");
        }
        openManager.Hide(); await managerTask;
        var request = RequestHomeAsync();
        var confirm = await WaitConfirmation();
        Button? FindLeave(DependencyObject root)
        {
            if (root is Button { Content: "Leave game" } button) return button;
            for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++) if (FindLeave(VisualTreeHelper.GetChild(root, i)) is { } child) return child;
            return null;
        }
        InvokeUxButton(FindLeave(confirm) ?? throw new InvalidDataException("Leave game action is missing."));
        await request;
        if (_player.Story is not null || _browser is not null || Welcome.Visibility != Visibility.Visible) throw new InvalidDataException("Confirmed Home did not leave the game.");
    }
    private void VerifySidebarPresentation(bool expanded)
    {
        IEnumerable<ContentControl> commands = ComfortableBar.Visibility == Visibility.Visible
            ? ComfortableCommands.Children.Concat(ComfortablePinned.Children).Cast<ContentControl>()
            : CompactBar.Children.OfType<ContentControl>().Concat(LibraryActions.Children.OfType<ContentControl>()).Append(CompactMoreButton).Where(button => button.Visibility == Visibility.Visible);
        foreach (var button in commands)
        {
            if (expanded ? button.Content is not StackPanel { Children.Count: 2 } content || content.Children[0] is not FontIcon || content.Children[1] is not TextBlock { Text.Length: > 0 } : button.Content is not FontIcon)
                throw new InvalidDataException("Sidebar presentation does not match its icon/label state.");
        }
        if (expanded ? RightSidebar.ActualWidth < 176 : RightSidebar.ActualWidth > 80) throw new InvalidDataException("Sidebar state width is incorrect.");
    }
    private static T? FindUxElement<T>(DependencyObject? root) where T : DependencyObject
    {
        if (root is T element) return element;
        if (root is null) return null;
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
            if (FindUxElement<T>(VisualTreeHelper.GetChild(root, i)) is { } found) return found;
        return null;
    }
    private void VerifyUxAccessKeys()
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void Visit(DependencyObject root)
        {
            if (root is UIElement { Visibility: Visibility.Collapsed }) return;
            if (root is UIElement { AccessKey.Length: > 0 } keyed && !seen.Add(keyed.AccessKey)) throw new InvalidDataException("Visible access keys collide: " + keyed.AccessKey);
            for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++) Visit(VisualTreeHelper.GetChild(root, i));
        }
        Visit(Root);
        if (seen.Count < 5) throw new InvalidDataException("Common commands do not expose access keys.");
    }
}
