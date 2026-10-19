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

    private async Task RefreshLibraryAsync()
    {
        var generation = ++_libraryRefresh;
        try
        {
            var entries = await _database.ListAsync();
            if (_closed || generation != _libraryRefresh) return;
            _library = entries; FilterLibrary();
        }
        catch (Exception error) { if (!_closed) { LibrarySummary.Text = "Library could not be read."; ShowError(error.Message); } }
    }
    private void FilterLibrary()
    {
        if (LibraryList is null || LibrarySearch is null || LibrarySort is null) return;
        var query = LibrarySearch.Text.Trim();
        var filtered = _library.Where(g => g.Title.Contains(query, StringComparison.OrdinalIgnoreCase) || g.FilePath.Contains(query, StringComparison.OrdinalIgnoreCase));
        var ordered = LibrarySort.SelectedIndex switch
        {
            1 => filtered.OrderBy(g => g.Title, StringComparer.OrdinalIgnoreCase),
            2 => filtered.OrderBy(g => g.FilePath, StringComparer.OrdinalIgnoreCase),
            _ => filtered.OrderByDescending(g => g.LastPlayedUtc).ThenBy(g => g.Title, StringComparer.OrdinalIgnoreCase)
        };
        var selected = (LibraryList.SelectedItem as LibraryGame)?.Id;
        var visible = ordered.ToArray(); LibraryList.ItemsSource = visible;
        LibraryList.SelectedItem = selected is { } id ? visible.FirstOrDefault(game => game.Id == id) : null;
        LibrarySummary.Text = _library.Count == 0 ? "Your library is ready for its first story." : $"{visible.Length} shown · {_library.Count} games" + (_library.Any(g => g.Missing) ? $" · {_library.Count(g => g.Missing)} unavailable" : "");
        if (LibraryEmptyState is not null)
        {
            var searching = query.Length > 0;
            LibraryEmptyState.Visibility = visible.Length == 0 ? Visibility.Visible : Visibility.Collapsed;
            LibraryEmptyScroll.Visibility = LibraryEmptyState.Visibility;
            LibraryList.Visibility = visible.Length == 0 ? Visibility.Collapsed : Visibility.Visible;
            LibraryEmptyTitle.Text = searching ? "No matching stories" : "Your next story starts here";
            LibraryEmptyDescription.Text = searching ? "Try a different title or part of a file path." : "Open a Twine HTML game to add it to your library. Your games stay in their current folders.";
            EmptyOpenButton.Visibility = searching ? Visibility.Collapsed : Visibility.Visible;
            ClearSearchButton.Visibility = searching ? Visibility.Visible : Visibility.Collapsed;
        }
        UpdateLibrarySelection();
    }
    private void ClearLibrarySearch_Click(object sender, RoutedEventArgs e) { LibrarySearch.Text = ""; LibrarySearch.Focus(FocusState.Programmatic); }
    private void LibrarySelection_Changed(object sender, SelectionChangedEventArgs e) => UpdateLibrarySelection();
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
        Welcome.Padding = new Thickness(compact ? 16 : 24); Welcome.RowSpacing = compact ? 8 : 16;
        LibraryTagline.Visibility = LibraryEmptyIcon.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
        LibraryEmptyDescription.Visibility = compact ? Visibility.Collapsed : Visibility.Visible;
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
        if (e.ClickedItem is LibraryGame game) await PlayLibraryGameAsync(game);
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
    private void LibraryCopy_Click(object sender, RoutedEventArgs e)
    {
        if (LibraryList.SelectedItem is not LibraryGame game) return;
        try { var package = new DataPackage(); package.SetText(game.FilePath); Clipboard.SetContent(package); ViewModel.Status = "Story path copied."; }
        catch (Exception error) { ShowError(error.Message); }
    }
    private void LibraryReveal_Click(object sender, RoutedEventArgs e)
    {
        if (LibraryList.SelectedItem is not LibraryGame game) return;
        try
        {
            var start = new ProcessStartInfo("explorer.exe") { UseShellExecute = false };
            start.ArgumentList.Add("/select," + game.FilePath); Process.Start(start);
        }
        catch (Exception error) { ShowError(error.Message); }
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
        catch (Exception error) { if (!_closed) ShowError(error.Message); }
    }
    private async void LibraryRemove_Click(object sender, RoutedEventArgs e)
    {
        if (LibraryList.SelectedItem is not LibraryGame game) return;
        try { await _database.SetRemovedAsync(game.Id, true); _undoRemoval = game.Id; UndoRemove.IsEnabled = true; await RefreshLibraryAsync(); ViewModel.Status = "Removed from library. Game, saves and browser data remain available. Undo restores the entry."; }
        catch (Exception error) { if (!_closed) ShowError(error.Message); }
    }
    private async void LibraryUndo_Click(object sender, RoutedEventArgs e)
    {
        if (_undoRemoval is not { } id) return;
        try { await _database.SetRemovedAsync(id, false); _undoRemoval = null; UndoRemove.IsEnabled = false; await RefreshLibraryAsync(); }
        catch (Exception error) { if (!_closed) ShowError(error.Message); }
    }
    private async void ImportFlutter_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var source = new TextBox { Header = "Flutter data folder", Text = FlutterImporter.DefaultSource, MinWidth = Math.Max(160, Math.Min(450, Root.ActualWidth - 96)) };
            var choose = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Preview Flutter data import", Content = source, PrimaryButtonText = "Preview", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            if (await choose.ShowAsync() != ContentDialogResult.Primary) return;
            var preview = await _importer.PreviewAsync(source.Text);
            var details = $"Source: {preview.Source}\nNative destination: {_database.Root}\n\n{preview.Files.Count} source files · {preview.Games.Count} valid games · {preview.Duplicates} duplicates · {preview.Invalid.Count} invalid entries/warnings\n\nOriginal files stay read-only. A checksum snapshot is saved before conversion. Existing native entries/preferences are retained. Browser localStorage/IndexedDB/cookies are not imported.\n\n" + string.Join("\n", preview.Invalid.Take(8));
            var confirm = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Import preview", Content = new ScrollViewer { Content = new TextBlock { Text = details, TextWrapping = TextWrapping.Wrap }, MaxHeight = 420 }, PrimaryButtonText = "Import with snapshot", IsPrimaryButtonEnabled = preview.Files.Count > 0, CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            if (await confirm.ShowAsync() != ContentDialogResult.Primary) return;
            var report = await _importer.ImportAsync(preview); await RefreshLibraryAsync();
            ViewModel.Status = $"Imported {report.Imported}; skipped {report.Skipped}; invalid/warnings {report.Invalid.Count}. Report: {report.SnapshotDirectory}";
        }
        catch (Exception error) { if (!_closed) ShowError(error.Message); }
    }
}
