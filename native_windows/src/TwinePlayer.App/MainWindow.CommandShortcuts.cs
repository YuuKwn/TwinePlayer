using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using TwinePlayer.Native.Core;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private IReadOnlyList<PinnedConsoleCommand> _pinnedCommands = [];
    private Guid? _pinsGameId;
    private bool _shortcutRunning;

    private void ApplyPinnedCommands()
    {
        if (CompactPinnedCommands is null || ComfortableCommands is null || _closed) return;
        CompactPinnedCommands.Children.Clear();
        foreach (var button in ComfortableCommands.Children.OfType<Button>().Where(button => button.Tag is PinnedConsoleCommand).ToArray())
            ComfortableCommands.Children.Remove(button);
        var visible = _player.Story?.Id == _pinsGameId && _pinnedCommands.Count > 0;
        CompactPinnedCommands.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
        if (!visible || _pinsGameId is not { } gameId) return;
        Button CreateButton(bool comfortable)
        {
            return new Button
            {
                Style = (Style)Root.Resources["SidebarButtonStyle"],
                MinHeight = comfortable ? _barPreferences.Normalized.TargetSize : 44,
                IsEnabled = !_shortcutRunning && Loading.Visibility != Visibility.Visible && !_closing
            };
        }
        foreach (var pin in _pinnedCommands)
        {
            foreach (var comfortable in new[] { false, true })
            {
                var button = CreateButton(comfortable);
                button.Tag = pin;
                button.Content = new TextBlock { Text = pin.Label, TextWrapping = TextWrapping.Wrap, TextTrimming = TextTrimming.CharacterEllipsis, MaxLines = 2, TextAlignment = _sidebarExpanded ? TextAlignment.Left : TextAlignment.Center };
                button.HorizontalContentAlignment = HorizontalAlignment.Stretch;
                AutomationProperties.SetName(button, "Run command: " + pin.Label);
                ToolTipService.SetToolTip(button, pin.Label + "\n" + pin.Command);
                button.Click += async (_, _) => await RunPinnedCommandAsync(gameId, pin);
                var menu = new MenuFlyout();
                var rename = new MenuFlyoutItem { Text = "Rename shortcut…" };
                rename.Click += async (_, _) => { if (_player.Story?.Id == gameId) await ShowPinCommandAsync(pin.Command, pin.Label); };
                var unpin = new MenuFlyoutItem { Text = "Unpin from sidebar" };
                unpin.Click += async (_, _) => await UnpinCommandAsync(gameId, pin.Command);
                menu.Items.Add(rename); menu.Items.Add(unpin); button.ContextFlyout = menu;
                (comfortable ? ComfortableCommands.Children : CompactPinnedCommands.Children).Add(button);
            }
        }
    }

    private async Task RunPinnedCommandAsync(Guid gameId, PinnedConsoleCommand pin)
    {
        if (_shortcutRunning || _closed || _closing || _saveDialogOpen || _saveActionInProgress || Loading.Visibility == Visibility.Visible || _player.Story?.Id != gameId || _pinsGameId != gameId || !_pinnedCommands.Contains(pin)) return;
        var session = _console;
        _shortcutRunning = true; ApplyPinnedCommands();
        try
        {
            var succeeded = await RunConsoleAsync(pin.Command, fromSidebar: true);
            if (succeeded && ReferenceEquals(session, _console)) ViewModel.Status = "Ran " + pin.Label + ".";
        }
        finally
        {
            _shortcutRunning = false; ApplyPinnedCommands();
            if (ReferenceEquals(session, _console)) RestoreStoryFocus();
        }
    }

    private async void ConsolePinSaved_Click(object sender, RoutedEventArgs e)
    {
        if (SavedCommands.SelectedItem is string command) await ShowPinCommandAsync(command);
        else ViewModel.Status = "Select a saved command to pin to this game's sidebar.";
    }

    private async Task ShowPinCommandAsync(string command, string? currentLabel = null)
    {
        if (_player.Story is not { } story) return;
        var session = _console;
        try
        {
            var existing = _pinnedCommands.FirstOrDefault(pin => pin.Command == command);
            var name = new TextBox { Header = "Button name", MaxLength = 40, Text = currentLabel ?? existing?.Label ?? command[..Math.Min(command.Length, 40)] };
            AutomationProperties.SetName(name, "Shortcut button name");
            var content = new StackPanel { Spacing = 12 };
            content.Children.Add(new TextBlock { Text = "Tap this shortcut to run the command while playing. It is available across all saves of this game.", TextWrapping = TextWrapping.Wrap });
            content.Children.Add(name);
            content.Children.Add(new TextBlock { Text = command, TextWrapping = TextWrapping.Wrap, MaxLines = 4, TextTrimming = TextTrimming.CharacterEllipsis });
            var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = existing is null ? "Pin command to sidebar" : "Rename command shortcut", Content = content, PrimaryButtonText = existing is null ? "Pin" : "Save", SecondaryButtonText = existing is null ? "" : "Unpin", CloseButtonText = "Cancel", DefaultButton = ContentDialogButton.Primary };
            void Validate() => dialog.IsPrimaryButtonEnabled = !string.IsNullOrWhiteSpace(name.Text);
            name.TextChanged += (_, _) => Validate(); Validate();
            var action = await dialog.ShowAsync();
            if (!ReferenceEquals(session, _console) || _closed) return;
            if (action == ContentDialogResult.Secondary) { await UnpinCommandAsync(story.Id, command); return; }
            if (action != ContentDialogResult.Primary) return;
            await _commandStore.PinAsync(story.Id, command, name.Text);
            if (ReferenceEquals(session, _console)) { await LoadSavedCommandsAsync(); ViewModel.Status = "Shortcut saved for this game."; }
        }
        catch (Exception error) { if (!_closed && ReferenceEquals(session, _console)) ShowCommandError(error.Message); }
    }

    private async Task UnpinCommandAsync(Guid gameId, string command)
    {
        if (_player.Story?.Id != gameId || _closed) return;
        var session = _console;
        try
        {
            await _commandStore.UnpinAsync(gameId, command);
            if (ReferenceEquals(session, _console)) { await LoadSavedCommandsAsync(); ViewModel.Status = "Shortcut removed. The console command is still saved."; }
        }
        catch (Exception error) { if (!_closed && ReferenceEquals(session, _console)) ShowCommandError(error.Message); }
        finally { if (ReferenceEquals(session, _console)) RestoreStoryFocus(); }
    }

    private void ShowCommandError(string message)
    {
        ErrorBar.Title = "Command shortcut"; ErrorBar.Message = message; ErrorBar.IsOpen = true;
        ViewModel.Status = "Command action failed. Review the error and retry.";
    }
}
