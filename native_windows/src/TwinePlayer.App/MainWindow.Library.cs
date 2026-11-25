using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
using Windows.ApplicationModel.DataTransfer;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private IReadOnlyList<LibraryGame> _library = [];
    private Guid? _undoRemoval;
    private long _libraryRefresh;
    private bool _libraryReady;
    private bool _updatingLibraryItems;
    private Guid? _lastLibrarySelection;

    private async Task RefreshLibraryAsync(Guid? selection = null)
    {
        var generation = ++_libraryRefresh;
        try
        {
            var entries = await _database.ListAsync();
            if (_closed || generation != _libraryRefresh) return;
            _library = entries;
            _libraryReady = true;
            FilterLibrary(selection);
        }
        catch (Exception error)
        {
            if (_closed || generation != _libraryRefresh) return;
            LibrarySummary.Text = "Library could not be read.";
            LibrarySummary.Visibility = Visibility.Visible;
            LibraryOpenButton.Visibility = Visibility.Visible;
            ShowError(error.Message, "Unable to read the library");
        }
    }
    private void FilterLibrary(Guid? selection = null)
    {
        if (!_libraryReady) return;
        var query = LibrarySearch.Text.Trim();
        var filtered = _library.Where(g => g.Title.Contains(query, StringComparison.OrdinalIgnoreCase) || g.FilePath.Contains(query, StringComparison.OrdinalIgnoreCase));
        var ordered = LibrarySort.SelectedIndex switch
        {
            1 => filtered.OrderBy(g => g.Title, StringComparer.OrdinalIgnoreCase),
            2 => filtered.OrderBy(g => g.FilePath, StringComparer.OrdinalIgnoreCase),
            _ => filtered.OrderByDescending(g => g.LastPlayedUtc).ThenBy(g => g.Title, StringComparer.OrdinalIgnoreCase)
        };
        var selected = selection ?? _lastLibrarySelection;
        var visible = ordered.ToArray();
        _updatingLibraryItems = true;
        try
        {
            LibraryList.ItemsSource = visible;
            LibraryList.SelectedItem = selected is { } id ? visible.FirstOrDefault(game => game.Id == id) : null;
            _lastLibrarySelection = selected;
        }
        finally { _updatingLibraryItems = false; }
        var searching = query.Length > 0 && _library.Count > 0;
        var unavailable = visible.Count(game => game.Missing);
        var count = searching ? $"{visible.Length} of {_library.Count} games" : $"{_library.Count} {(_library.Count == 1 ? "game" : "games")}";
        LibrarySummary.Text = unavailable > 0 ? $"{count} · {unavailable} unavailable" : count;
        LibraryTools.Visibility = LibrarySummary.Visibility = _library.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        LibraryEmptyState.Visibility = visible.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
        LibraryEmptyScroll.Visibility = LibraryEmptyState.Visibility;
        LibraryList.Visibility = visible.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
        LibraryOpenButton.Visibility = _library.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
        LibraryEmptyTitle.Text = searching ? "No matching games" : "No games in your library yet";
        LibraryEmptyDescription.Text = searching ? "Try a different title or part of a file path." : "Open a Twine HTML file to play it and add it to the library. The file stays in its current folder.";
        EmptyOpenButton.Visibility = searching ? Visibility.Collapsed : Visibility.Visible;
        ClearSearchButton.Visibility = searching ? Visibility.Visible : Visibility.Collapsed;
        Announce(LibrarySummary);
        UpdateLibrarySelection();
    }
    private void ClearLibrarySearch_Click(object sender, RoutedEventArgs e) { LibrarySearch.Text = ""; LibrarySearch.Focus(FocusState.Programmatic); }
    private void LibrarySelection_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (_updatingLibraryItems) return;
        _lastLibrarySelection = (LibraryList.SelectedItem as LibraryGame)?.Id;
        UpdateLibrarySelection();
    }
    private void LibraryHeader_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (LibraryHeaderActions is null) return;
        var narrow = e.NewSize.Width < 400;
        Grid.SetRow(LibraryHeaderActions, narrow ? 1 : 0);
        Grid.SetColumn(LibraryHeaderActions, narrow ? 0 : 1);
        Grid.SetColumnSpan(LibraryHeaderActions, narrow ? 2 : 1);
    }
    private void LibraryTools_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (LibrarySort is null || LibrarySearch is null) return;
        var narrow = e.NewSize.Width < 720;
        Grid.SetRow(LibrarySort, narrow ? 1 : 0); Grid.SetColumn(LibrarySort, narrow ? 0 : 1);
        Grid.SetColumnSpan(LibrarySearch, narrow ? 2 : 1);
    }
    private void UpdateLibraryDensity(double height)
    {
        var compact = height < 600;
        Welcome.Padding = new Thickness(compact ? 16 : 24); Welcome.RowSpacing = compact ? 8 : 12;
        LibraryEmptyIcon.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        LibraryEmptyState.Margin = new Thickness(compact ? 8 : 16); LibraryEmptyState.Spacing = compact ? 8 : 12;
    }
    private void UpdateLibrarySelection()
    {
        if (PlaySelectedButton is null || RemoveSelectedButton is null) return;
        var selected = LibraryList.SelectedItem as LibraryGame;
        PlaySelectedButton.IsEnabled = selected is { Missing: false };
        RelinkSelectedButton.IsEnabled = CopySelectedButton.IsEnabled = RevealSelectedButton.IsEnabled = RemoveSelectedButton.IsEnabled = selected is not null;
        PlaySelectedButton.Visibility = RelinkSelectedButton.Visibility = selected is not null ? Visibility.Visible : Visibility.Collapsed;
        LibrarySelectionMore.Visibility = selected is not null ? Visibility.Visible : Visibility.Collapsed;
        UndoRemove.Visibility = _undoRemoval is not null ? Visibility.Visible : Visibility.Collapsed;
    }
    private void LibraryFilter_Changed(object sender, TextChangedEventArgs e) => FilterLibrary();
    private void LibrarySort_Changed(object sender, SelectionChangedEventArgs e) => FilterLibrary();
    private async void Library_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is not LibraryGame game) return;
        if (game.Missing)
        {
            LibraryList.SelectedItem = game;
            ViewModel.Status = "Game file unavailable. Choose Relink game to locate it.";
            return;
        }
        await PlayLibraryGameAsync(game);
    }
    private async Task PlayLibraryGameAsync(LibraryGame game)
    {
        try { if (!File.Exists(game.FilePath)) throw new FileNotFoundException("This story is missing. Use Relink to choose its replacement.", game.FilePath); await OpenAsync(game.FilePath); }
        catch (Exception error) { if (!_closed) ShowError(error.Message); }
    }
    private async void LibraryPlay_Click(object sender, RoutedEventArgs e) { if (LibraryList.SelectedItem is LibraryGame game) await PlayLibraryGameAsync(game); }
    private void Library_RightTapped(object sender, RightTappedRoutedEventArgs e)
    {
        for (var element = e.OriginalSource as DependencyObject; element is not null; element = VisualTreeHelper.GetParent(element))
            if (element is FrameworkElement { DataContext: LibraryGame game }) { LibraryList.SelectedItem = game; break; }
    }
    private void LibraryContext_Opening(object sender, object e)
    {
        var selected = LibraryList.SelectedItem as LibraryGame;
        ContextPlay.IsEnabled = selected is { Missing: false };
        ContextRelink.IsEnabled = ContextCopyPath.IsEnabled = ContextReveal.IsEnabled = ContextRemove.IsEnabled = selected is not null;
    }
    private void LibraryCopy_Click(object sender, RoutedEventArgs e)
    {
        if (LibraryList.SelectedItem is not LibraryGame game) return;
        try { var package = new DataPackage(); package.SetText(game.FilePath); Clipboard.SetContent(package); ViewModel.Status = "Story path copied."; }
        catch (Exception error) { ShowError(error.Message, "Unable to copy the game path"); }
    }
    private void LibraryReveal_Click(object sender, RoutedEventArgs e)
    {
        if (LibraryList.SelectedItem is not LibraryGame game) return;
        try
        {
            var start = new ProcessStartInfo("explorer.exe") { UseShellExecute = false };
            start.ArgumentList.Add("/select," + game.FilePath); Process.Start(start);
        }
        catch (Exception error) { ShowError(error.Message, "Unable to open the file location"); }
    }
    private async void LibraryRelink_Click(object sender, RoutedEventArgs e)
    {
        if (LibraryList.SelectedItem is not LibraryGame game) return;
        try
        {
            var picker = new Microsoft.Windows.Storage.Pickers.FileOpenPicker(AppWindow.Id);
            picker.FileTypeFilter.Add(".html"); picker.FileTypeFilter.Add(".htm");
            var result = await picker.PickSingleFileAsync(); if (result is null) return;
            if (!await ConfirmSaveActionAsync("Relink as the same story?", "The existing browser identity and settings will be retained. Original sidecar saves stay at their existing paths; they are not moved automatically.", "Relink")) return;
            await _database.RelinkAsync(game.Id, result.Path); await RefreshLibraryAsync();
            ViewModel.Status = "Story relinked with its existing native identity.";
        }
        catch (Exception error) { if (!_closed) ShowError(error.Message, "Unable to relink the game"); }
    }
    private async void LibraryRemove_Click(object sender, RoutedEventArgs e)
    {
        if (LibraryList.SelectedItem is not LibraryGame game) return;
        try
        {
            await _database.SetRemovedAsync(game.Id, true);
            _undoRemoval = game.Id;
            UndoRemove.IsEnabled = true;
            await RefreshLibraryAsync();
            ViewModel.Status = "Removed from library. Game files and saves remain on disk.";
            FocusLibrarySelection();
        }
        catch (Exception error) { if (!_closed) ShowError(error.Message, "Unable to remove the game"); }
    }
    private async void LibraryUndo_Click(object sender, RoutedEventArgs e)
    {
        if (_undoRemoval is not { } id) return;
        try
        {
            await _database.SetRemovedAsync(id, false);
            _undoRemoval = null;
            UndoRemove.IsEnabled = false;
            await RefreshLibraryAsync(id);
            ViewModel.Status = "Game restored to the library.";
            FocusLibrarySelection();
        }
        catch (Exception error) { if (!_closed) ShowError(error.Message, "Unable to undo removal"); }
    }
    private void FocusLibrarySelection()
    {
        if (_closed || Welcome.Visibility != Visibility.Visible) return;
        if (LibraryList.SelectedItem is LibraryGame game)
        {
            LibraryList.ScrollIntoView(game);
            LibraryList.UpdateLayout();
            if (LibraryList.ContainerFromItem(game) is Control item && item.Focus(FocusState.Programmatic)) return;
        }
        (EmptyOpenButton.IsLoaded && LibraryEmptyScroll.Visibility == Visibility.Visible && EmptyOpenButton.Visibility == Visibility.Visible
            ? (Control)EmptyOpenButton : LibrarySearch).Focus(FocusState.Programmatic);
    }
    private async void ImportFlutter_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var source = new TextBox { Header = "Flutter data folder", Text = FlutterImporter.DefaultSource, MinWidth = Math.Max(160, Math.Min(450, Root.ActualWidth - 96)) };
            var choose = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Preview Flutter data import", Content = source, PrimaryButtonText = "Preview", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            if (await choose.ShowAsync() != ContentDialogResult.Primary) return;
            var preview = await _importer.PreviewAsync(source.Text);
            var details = new StackPanel { Spacing = 10 };
            details.Children.Add(new TextBlock
            {
                Text = preview.Files.Count == 0 ? "No Flutter library or settings files found." : $"{preview.Games.Count} valid games · {preview.Duplicates} duplicates · {preview.Invalid.Count} warnings",
                TextWrapping = TextWrapping.Wrap, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold
            });
            details.Children.Add(new TextBlock { Text = "TwinePlayer creates a verified snapshot before import. Original files stay in place, and existing native entries and preferences take precedence. Use Browser data from Flutter to transfer browser storage.", TextWrapping = TextWrapping.Wrap });
            details.Children.Add(new TextBlock { Text = $"Source: {preview.Source}\nDestination: {_database.Root}", TextWrapping = TextWrapping.Wrap });
            if (preview.Invalid.Count > 0)
                details.Children.Add(new TextBlock { Text = string.Join("\n", preview.Invalid.Take(8)), TextWrapping = TextWrapping.Wrap });
            var confirm = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Review Flutter library import", Content = new ScrollViewer { Content = details, MaxHeight = Math.Max(160, Root.ActualHeight - 220) }, PrimaryButtonText = "Import with snapshot", IsPrimaryButtonEnabled = preview.Files.Count > 0, CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            if (await confirm.ShowAsync() != ContentDialogResult.Primary) return;
            var report = await _importer.ImportAsync(preview); await RefreshLibraryAsync();
            ViewModel.Status = $"Imported {report.Imported}; skipped {report.Skipped}; invalid/warnings {report.Invalid.Count}. Report: {report.SnapshotDirectory}";
        }
        catch (Exception error) { if (!_closed) ShowError(error.Message, "Unable to import Flutter data"); }
    }
}
