using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Automation.Provider;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using TwinePlayer.Native.Core;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private async Task ExerciseCommandShortcutsAsync(string[] files, Func<string, ElementTheme, int, Task> capture)
    {
        static IEnumerable<DependencyObject> Walk(DependencyObject root)
        {
            yield return root;
            for (var index = 0; index < VisualTreeHelper.GetChildrenCount(root); index++)
                foreach (var child in Walk(VisualTreeHelper.GetChild(root, index))) yield return child;
        }
        static void Invoke(Button button)
            => ((IInvokeProvider)new ButtonAutomationPeer(button).GetPattern(PatternInterface.Invoke)).Invoke();
        async Task WaitFor(Func<bool> condition, string message)
        {
            for (var attempt = 0; attempt < 100; attempt++) { if (condition()) return; await Task.Delay(30); }
            throw new InvalidDataException(message);
        }
        ContentDialog? OpenDialog() => VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot).Select(popup => FindUxDialog(popup.Child)).FirstOrDefault();
        const string command = "window.__sidebarPinCount = (window.__sidebarPinCount || 0) + 1";
        var originalProfile = _interaction.Selected;
        await OpenAsync(files[0]);
        var gameId = _player.Story!.Id;
        await SaveConsoleAsync(command);
        SavedCommands.SelectedItem = command;
        ConsolePanel.Visibility = Visibility.Visible; ApplyConsoleLayout();
        Invoke(PinSavedCommandButton);
        await WaitFor(() => OpenDialog()?.Title as string == "Pin command to sidebar", "Pin action did not open its native naming dialog.");
        var dialog = OpenDialog()!;
        var name = FindUxElement<TextBox>(dialog)!;
        name.Text = " "; await Task.Delay(60);
        if (dialog.IsPrimaryButtonEnabled) throw new InvalidDataException("Blank shortcut names are enabled.");
        name.Text = "Add point"; await Task.Delay(60);
        if (!dialog.IsPrimaryButtonEnabled) throw new InvalidDataException("Valid shortcut name is disabled.");
        Invoke(Walk(dialog).OfType<Button>().First(button => button.Name == "PrimaryButton"));
        await WaitFor(() => _pinnedCommands.Count == 1, "Pin dialog did not persist the shortcut.");
        if (_pinnedCommands[0].Label != "Add point") throw new InvalidDataException("Shortcut label was not saved.");
        var rename = ShowPinCommandAsync(command, "Canceled name");
        await WaitFor(() => OpenDialog()?.Title as string == "Rename command shortcut", "Rename action did not open.");
        OpenDialog()!.Hide(); await rename;
        if (_pinnedCommands[0].Label != "Add point") throw new InvalidDataException("Canceled rename changed the shortcut.");
        ConsoleInput.Text = "unfinished console draft";
        ConsoleClose_Click(this, new RoutedEventArgs());
        _interaction.Select(InteractionProfile.Compact); _sidebarExpanded = false; ApplyInteractionLayout();
        Invoke(CompactPinnedCommands.Children.OfType<Button>().Single());
        await WaitFor(() => _console.Entries.Any(entry => entry.Level == "result" && entry.Message == "1"), "Sidebar button did not execute the command.");
        if (ConsolePanel.Visibility != Visibility.Collapsed || ConsoleInput.Text != "unfinished console draft" || await _player.ExecuteScriptAsync("window.__sidebarPinCount") != "1")
            throw new InvalidDataException("Sidebar execution opened the console, changed its draft or failed to change story state.");
        await capture("shortcuts-compact", ElementTheme.Dark, 640);
        _sidebarExpanded = true; ApplyInteractionLayout();
        await capture("shortcuts-expanded", ElementTheme.Light, 1200);
        _interaction.Select(InteractionProfile.Comfortable); ApplyInteractionLayout();
        Invoke(ComfortableCommands.Children.OfType<Button>().Single(button => button.Tag is PinnedConsoleCommand));
        await WaitFor(() => _console.Entries.Any(entry => entry.Level == "result" && entry.Message == "2"), "Comfortable shortcut did not execute.");
        await capture("shortcuts-comfortable-expanded", ElementTheme.Light, 640);
        _sidebarExpanded = false; ApplyInteractionLayout();
        await capture("shortcuts-comfortable", ElementTheme.Dark, 640);
        var pin = _pinnedCommands.Single();
        await OpenAsync(files[1]);
        if (_pinnedCommands.Count != 0 || CompactPinnedCommands.Visibility != Visibility.Collapsed || ComfortableCommands.Children.OfType<Button>().Any(button => button.Tag is PinnedConsoleCommand))
            throw new InvalidDataException("Another game inherited shortcuts.");
        await RunPinnedCommandAsync(gameId, pin);
        if (await _player.ExecuteScriptAsync("typeof window.__sidebarPinCount") != "\"undefined\"") throw new InvalidDataException("A stale shortcut ran in another game.");
        await OpenAsync(files[0]);
        if (_pinsGameId != gameId || _pinnedCommands.Single() != pin || ConsolePanel.Visibility != Visibility.Collapsed)
            throw new InvalidDataException("Shortcut did not survive story recreation with the console closed.");
        const string failing = "throw new Error('shortcut-smoke-error')";
        await SaveConsoleAsync(failing); await _commandStore.PinAsync(gameId, failing, "Fail visibly"); await LoadSavedCommandsAsync();
        await RunPinnedCommandAsync(gameId, _pinnedCommands.Single(item => item.Command == failing));
        if (!ErrorBar.IsOpen || !ErrorBar.Message.Contains("shortcut-smoke-error") || ConsolePanel.Visibility != Visibility.Collapsed)
            throw new InvalidDataException("Shortcut errors were not visible with the console closed.");
        ErrorBar.IsOpen = false;
        var unpin = ShowPinCommandAsync(command);
        await WaitFor(() => OpenDialog()?.Title as string == "Rename command shortcut", "Touch-accessible shortcut management did not open.");
        Invoke(Walk(OpenDialog()!).OfType<Button>().First(button => button.Name == "SecondaryButton"));
        await unpin;
        if (_pinnedCommands.Any(item => item.Command == command) || !(await _commandStore.GetAsync(ConsoleScope!)).Contains(command))
            throw new InvalidDataException("Unpin deleted the saved command or left a sidebar button.");
        await SaveConsoleAsync(failing, delete: true);
        await SaveConsoleAsync(command, delete: true);
        if (_pinnedCommands.Count != 0 || CompactPinnedCommands.Visibility != Visibility.Collapsed) throw new InvalidDataException("Deleting a saved command left its shortcut.");
        _interaction.Select(originalProfile); _sidebarExpanded = false; ApplyInteractionLayout();
    }
}
