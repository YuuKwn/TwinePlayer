using System.Diagnostics;
using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using TwinePlayer.Native.App.Services;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private CancellationTokenSource? _browserMigration;
    private sealed record StorageChoice(string Kind, string Name, int Index, string Label) { public override string ToString() => Label; }
    private async void ImportBrowserData_Click(object sender, RoutedEventArgs e)
    {
        if (_browserMigration is not null) return;
        if (_player.Story is not null || LibraryList.SelectedItem is not LibraryGame game) { ViewModel.Status = "Return to the library and select the game that should receive the legacy browser data."; return; }
        BrowserProfileCopy? snapshot = null;
        try
        {
            var source = new TextBox { Header = "Closed Flutter WebView2 user-data folder", Text = BrowserProfileSnapshot.DefaultSource, MinWidth = Math.Max(160, Math.Min(450, Root.ActualWidth - 96)) };
            var content = new StackPanel { Spacing = 12 }; content.Children.Add(new TextBlock { Text = "Close Flutter first. A read-only-source profile backup and a separate working copy are created before previewing localStorage, IndexedDB and cookies. Legacy games shared one origin: select only data belonging to the selected game. No import runs automatically.", TextWrapping = TextWrapping.Wrap }); content.Children.Add(source);
            var choose = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Preview browser data for " + game.Title, Content = content, PrimaryButtonText = "Copy profile and preview", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            if (await choose.ShowAsync() != ContentDialogResult.Primary) return;
            EnsureSingleNativeWindow();
            _browserMigration = new CancellationTokenSource(); var token = _browserMigration.Token;
            OpenButton.IsEnabled = LibraryList.IsEnabled = false; ViewModel.Status = "Creating verified browser-profile backup; original files remain read-only…";
            snapshot = await BrowserProfileSnapshot.CreateAsync(source.Text, Path.Combine(_database.Root, "migration-backups"), token);
            using var legacy = await BrowserStorageWorkspace.OpenAsync(Viewport, snapshot.WorkingProfile, "twineplayer.local", token);
            var catalog = await legacy.CatalogAsync(token); var cookies = await legacy.CookiesAsync();
            var choices = new List<StorageChoice>();
            foreach (var item in catalog.GetProperty("localStorage").EnumerateArray()) { var name = item.GetProperty("name").GetString()!; choices.Add(new("localStorage", name, -1, $"localStorage · {name} · {item.GetProperty("characters").GetInt64():N0} characters")); }
            foreach (var item in catalog.GetProperty("databases").EnumerateArray()) { var name = item.GetProperty("name").GetString()!; choices.Add(new("database", name, -1, $"IndexedDB · {name} · version {item.GetProperty("version").GetInt64()}")); }
            var index = 0; foreach (var cookie in cookies.EnumerateArray()) { var name = cookie.GetProperty("name").GetString()!; choices.Add(new("cookie", name, index++, $"Cookie · {name} · path {cookie.GetProperty("path").GetString()}")); }
            var list = new ListView { ItemsSource = choices, SelectionMode = ListViewSelectionMode.Multiple, MaxHeight = Math.Max(150, Root.ActualHeight - 400) }; Microsoft.UI.Xaml.Automation.AutomationProperties.SetName(list, "Legacy browser items to import");
            var panel = new StackPanel { Spacing = 12, MinWidth = Math.Max(160, Math.Min(500, Root.ActualWidth - 96)) };
            panel.Children.Add(new TextBlock { Text = $"Target: {game.Title}\nOrigin: https://{game.Identity.HostName}\n{choices.Count} items. Nothing is selected by default. Existing native keys/databases/cookies are kept; conflicts are skipped and reported. Session storage and other remote origins are not copied. Unsupported value types/partitioned cookies fail visibly. Backup: {snapshot.BackupDirectory}", TextWrapping = TextWrapping.Wrap });
            panel.Children.Add(list); var select = new Button { Content = "Select all shown (shared legacy data)" }; select.Click += (_, _) => list.SelectAll(); panel.Children.Add(select);
            var confirm = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Choose browser data to transfer", Content = new ScrollViewer { Content = panel, MaxHeight = Math.Max(200, Root.ActualHeight - 200) }, PrimaryButtonText = "Import selected without overwrite", IsPrimaryButtonEnabled = false, CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Close };
            list.SelectionChanged += (_, _) => confirm.IsPrimaryButtonEnabled = list.SelectedItems.Count != 0;
            if (await confirm.ShowAsync() != ContentDialogResult.Primary) return;
            var selected = list.SelectedItems.Cast<StorageChoice>().ToArray();
            var json = await legacy.ExportAsync(selected.Where(item => item.Kind == "localStorage").Select(item => item.Name).ToArray(), selected.Where(item => item.Kind == "database").Select(item => item.Name).ToArray(), token);
            var selectedCookies = selected.Where(item => item.Kind == "cookie").Select(item => cookies[item.Index].Clone()).ToArray();
            await File.WriteAllTextAsync(Path.Combine(snapshot.BackupDirectory, "selected-storage.json"), json, token);
            await File.WriteAllTextAsync(Path.Combine(snapshot.BackupDirectory, "selected-cookies.json"), JsonSerializer.Serialize(selectedCookies), token);
            await BrowserProfileSnapshot.VerifySourceAsync(snapshot, token);
            EnsureSingleNativeWindow();
            using var target = await BrowserStorageWorkspace.OpenAsync(Viewport, Path.Combine(_database.Root, "WebView2"), game.Identity.HostName, token);
            var imported = await target.ImportAsync(json, token); var cookiesImported = 0; var cookiesSkipped = 0;
            foreach (var cookie in selectedCookies) { token.ThrowIfCancellationRequested(); if (await target.AddCookieIfAbsentAsync(cookie)) cookiesImported++; else cookiesSkipped++; }
            var report = new { status = "complete", source = snapshot.Source, targetGameId = game.Id, targetOrigin = target.Origin, imported, cookiesImported, cookiesSkipped, sourcePreserved = true };
            await File.WriteAllTextAsync(Path.Combine(snapshot.BackupDirectory, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }), token);
            ViewModel.Status = $"Browser import completed; existing items were retained. Report: {snapshot.BackupDirectory}";
        }
        catch (OperationCanceledException) { if (!_closed) ViewModel.Status = "Browser import canceled. Existing native items and original source data were preserved; completed new items may remain."; }
        catch (Exception error)
        {
            if (snapshot is not null)
            {
                try { await File.WriteAllTextAsync(Path.Combine(snapshot.BackupDirectory, "failure-report.json"), JsonSerializer.Serialize(new { status = "failed", error = error.Message, existingNativeItemsPreserved = true, newItemsMayHaveCompleted = true })); }
                catch (Exception reportError) when (reportError is IOException or UnauthorizedAccessException) { System.Diagnostics.Debug.WriteLine("Migration report could not be saved: " + reportError.Message); }
            }
            if (!_closed) ShowPresentationError("Browser import failed; original data was preserved. " + error.Message + (snapshot is null ? "" : " Backup: " + snapshot.BackupDirectory));
        }
        finally { _browserMigration?.Dispose(); _browserMigration = null; if (!_closed) { OpenButton.IsEnabled = LibraryList.IsEnabled = true; RestoreStoryFocus(); } }
    }
    private static void EnsureSingleNativeWindow()
    {
        var processes = Process.GetProcessesByName("TwinePlayer.Native");
        try { if (processes.Any(process => process.Id != Environment.ProcessId)) throw new IOException("Close other native player windows before importing browser data."); }
        finally { foreach (var process in processes) process.Dispose(); }
    }
}
