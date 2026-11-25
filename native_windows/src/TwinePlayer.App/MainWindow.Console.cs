using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using TwinePlayer.Native.Core;
using Windows.System;
namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private ConsoleSession _console = new();
    private string? _currentIfid;
    private CancellationTokenSource? _completionRequest;
    private int _historyPosition;
    private int _savedCommandsRequest;
    private double _consoleHistoryShare = .6;
    private string? ConsoleScope => _player.Story is { } story ? ConsoleSession.Scope(story, _currentIfid) : null;
    private void InitializeConsolePresentation()
    {
        ConsoleLogs.RegisterPropertyChangedCallback(ItemsControl.ItemsSourceProperty, (_, _) => UpdateConsoleActions());
        SavedCommands.RegisterPropertyChangedCallback(ItemsControl.ItemsSourceProperty, (_, _) => UpdateConsoleActions());
        Completions.RegisterPropertyChangedCallback(ItemsControl.ItemsSourceProperty, (_, _) =>
            Completions.Visibility = Completions.ItemsSource is IReadOnlyCollection<string> { Count: > 0 } ? Visibility.Visible : Visibility.Collapsed);
    }
    private void ConsoleSelection_Changed(object sender, SelectionChangedEventArgs e) => UpdateConsoleActions();
    private void UpdateConsoleActions()
    {
        if (ConsoleHistoryEmpty is null || DeleteSavedCommandButton is null) return;
        var historyCommand = ConsoleLogs.SelectedItem is ConsoleEntry { Command: { Length: > 0 } };
        RerunCommandButton.IsEnabled = EditCommandButton.IsEnabled = SaveCommandButton.IsEnabled = historyCommand;
        var selected = SavedCommands.SelectedItem is string;
        RunSavedCommandButton.IsEnabled = PinSavedCommandButton.IsEnabled = DeleteSavedCommandButton.IsEnabled = selected;
        ConsoleHistoryEmpty.Visibility = ConsoleLogs.ItemsSource is ConsoleEntry[] { Length: > 0 } ? Visibility.Collapsed : Visibility.Visible;
        ConsoleSavedEmpty.Visibility = SavedCommands.ItemsSource is IReadOnlyCollection<string> { Count: > 0 } ? Visibility.Collapsed : Visibility.Visible;
    }
    private void ResetConsole()
    {
        _completionRequest?.Cancel(); _currentIfid = null; _console = new(); _historyPosition = 0; _savedCommandsRequest++;
        _pinnedCommands = []; _pinsGameId = null; ApplyPinnedCommands();
        if (ConsolePanel is null) return;
        ConsolePanel.Visibility = Visibility.Collapsed; ConsoleColumn.Width = new GridLength(0);
        ConsoleLogs.ItemsSource = null; SavedCommands.ItemsSource = null; Completions.ItemsSource = null; ConsoleInput.Text = "";
    }
    private void AppendConsole(string message, string level, string? command = null)
    {
        var selected = ConsoleLogs.SelectedItem as ConsoleEntry;
        _console.Append(message, level, command);
        var entries = _console.Entries.ToArray();
        ConsoleLogs.ItemsSource = entries;
        if (selected is not null && entries.Contains(selected)) ConsoleLogs.SelectedItem = selected;
        else if (entries.Length > 0) ConsoleLogs.ScrollIntoView(entries[^1]);
    }
    private async Task LoadSavedCommandsAsync()
    {
        if (ConsoleScope is not { } scope || _player.Story is not { } story) return;
        var request = ++_savedCommandsRequest;
        try
        {
            var saved = await _commandStore.GetAsync(scope);
            var pins = await _commandStore.GetPinnedAsync(story.Id);
            if (request != _savedCommandsRequest || scope != ConsoleScope || _player.Story?.Id != story.Id || _closed) return;
            var selected = SavedCommands.SelectedItem as string;
            SavedCommands.ItemsSource = saved;
            if (selected is not null && saved.Contains(selected)) SavedCommands.SelectedItem = selected;
            _pinnedCommands = pins; _pinsGameId = story.Id; ApplyPinnedCommands();
        }
        catch (Exception error) { if (!_closed && request == _savedCommandsRequest) { AppendConsole(error.Message, "error"); ShowCommandError(error.Message); } }
    }
    private async void ConsoleEntry_Click(object sender, RoutedEventArgs e)
    {
        if (_player.Story is null) { ViewModel.Status = "Open a story before using its developer console."; return; }
        if (ConsolePanel.Visibility == Visibility.Visible) { ConsoleClose_Click(sender, e); return; }
        ConsolePanel.Visibility = Visibility.Visible; ApplyConsoleLayout(); await LoadSavedCommandsAsync();
        if (!_closed && ConsolePanel.Visibility == Visibility.Visible) ConsoleInput.Focus(FocusState.Programmatic);
    }
    private void ConsoleClose_Click(object sender, RoutedEventArgs e) { ConsolePanel.Visibility = Visibility.Collapsed; ConsoleColumn.Width = new GridLength(0); _browser?.Focus(FocusState.Programmatic); }
    private void ConsoleLayout_Changed(object sender, SelectionChangedEventArgs e) { if (ConsolePanel is not null) ApplyConsoleLayout(); }
    private void ApplyConsoleLayout()
    {
        if (ConsoleInputHint is null || ConsolePanel is null || ConsoleLayout is null || Viewport is null) return;
        var side = ConsolePanel.Visibility == Visibility.Visible && ConsoleLayout.SelectedIndex == 1 && Viewport.ActualWidth >= 760;
        ConsolePanel.Width = Math.Min(440, Viewport.ActualWidth);
        var narrow = ConsolePanel.Width < 350;
        Grid.SetRow(ConsoleLayout, narrow ? 1 : 0);
        Grid.SetColumn(ConsoleLayout, narrow ? 0 : 1);
        Grid.SetColumnSpan(ConsoleLayout, narrow ? 3 : 1);
        Completions.MaxHeight = Math.Clamp(Viewport.ActualHeight / 6, 36, 100);
        ConsoleInputHint.Visibility = Viewport.ActualHeight < 500 ? Visibility.Collapsed : Visibility.Visible;
        Grid.SetColumn(ConsolePanel, side ? 1 : 0); ConsoleColumn.Width = new GridLength(side ? ConsolePanel.Width : 0);
        ConsolePanel.HorizontalAlignment = side ? HorizontalAlignment.Stretch : HorizontalAlignment.Right;
        ConsoleOverlayHint.Visibility = ConsoleLayout.SelectedIndex == 1 && !side ? Visibility.Visible : Visibility.Collapsed;
    }
    private void ResizeConsolePanes(double historyHeight)
    {
        var available = ConsolePanes.ActualHeight - ConsoleDivider.ActualHeight;
        if (available <= 0) return;
        var minimum = Math.Min(112, available / 2);
        _consoleHistoryShare = Math.Clamp(historyHeight, minimum, available - minimum) / available;
        ConsoleHistoryRow.Height = new GridLength(_consoleHistoryShare, GridUnitType.Star);
        ConsoleSavedRow.Height = new GridLength(1 - _consoleHistoryShare, GridUnitType.Star);
    }
    private void ConsolePanes_SizeChanged(object sender, SizeChangedEventArgs e)
    { if (ConsoleDivider is not null) ResizeConsolePanes(_consoleHistoryShare * (ConsolePanes.ActualHeight - ConsoleDivider.ActualHeight)); }
    private void ConsoleDivider_DragDelta(object sender, DragDeltaEventArgs e)
        => ResizeConsolePanes(_consoleHistoryShare * (ConsolePanes.ActualHeight - ConsoleDivider.ActualHeight) + e.VerticalChange);
    private void ConsoleDivider_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key is not (VirtualKey.Up or VirtualKey.Down or VirtualKey.Home or VirtualKey.End)) return;
        var available = ConsolePanes.ActualHeight - ConsoleDivider.ActualHeight;
        ResizeConsolePanes(e.Key switch { VirtualKey.Home => 0, VirtualKey.End => available, _ => _consoleHistoryShare * available + (e.Key == VirtualKey.Up ? -24 : 24) });
        e.Handled = true;
    }
    private async Task<bool> RunConsoleAsync(string command, bool fromSidebar = false)
    {
        command = command.Trim(); if (command.Length == 0 || _closed || _player.Story is null) return false;
        var session = _console;
        var document = _player.DocumentGeneration;
        bool IsCurrent() => !_closed && ReferenceEquals(session, _console) && document == _player.DocumentGeneration;
        AppendConsole("> " + command, "input", command); _historyPosition = _console.History.Count;
        var succeeded = false;
        try { var result = await _bridge.RunCommandAsync(command, _opening?.Token ?? default); if (IsCurrent()) { AppendConsole(result, "result"); succeeded = true; } }
        catch (OperationCanceledException) { }
        catch (Exception error) { if (IsCurrent()) { AppendConsole(error.Message, "error"); if (fromSidebar) ShowCommandError(error.Message); } }
        if (IsCurrent() && !fromSidebar)
        {
            if (ConsoleInput.Text.Trim() == command) ConsoleInput.Text = "";
            Completions.ItemsSource = null; ConsoleInput.Focus(FocusState.Programmatic);
        }
        return succeeded;
    }
    private async void ConsoleRun_Click(object sender, RoutedEventArgs e) => await RunConsoleAsync(ConsoleInput.Text);
    private async void ConsoleRerun_Click(object sender, RoutedEventArgs e) { if (ConsoleLogs.SelectedItem is ConsoleEntry { Command: { } command }) await RunConsoleAsync(command); }
    private void ConsoleUseLog_Click(object sender, RoutedEventArgs e)
    {
        if (ConsoleLogs.SelectedItem is not ConsoleEntry { Command: { } command }) return;
        ConsoleInput.Text = command;
        ConsoleInput.SelectionStart = command.Length;
        ConsoleInput.Focus(FocusState.Programmatic);
    }
    private async Task SaveConsoleAsync(string command, bool delete = false)
    {
        if (ConsoleScope is not { } scope) return;
        var session = _console;
        try { await _commandStore.SaveAsync(scope, command, delete, _player.Story?.Id); if (ReferenceEquals(session, _console)) await LoadSavedCommandsAsync(); }
        catch (Exception error) { AppendConsole(error.Message, "error"); }
    }
    private async void ConsoleSaveLog_Click(object sender, RoutedEventArgs e) { if (ConsoleLogs.SelectedItem is ConsoleEntry { Command: { } command }) await SaveConsoleAsync(command); }
    private async void ConsoleSaveInput_Click(object sender, RoutedEventArgs e) => await SaveConsoleAsync(ConsoleInput.Text);
    private void SavedCommand_Click(object sender, ItemClickEventArgs e) { if (e.ClickedItem is string command) { ConsoleInput.Text = command; ConsoleInput.Focus(FocusState.Programmatic); } }
    private async void ConsoleRunSaved_Click(object sender, RoutedEventArgs e) { if (SavedCommands.SelectedItem is string command) await RunConsoleAsync(command); }
    private async void ConsoleDeleteSaved_Click(object sender, RoutedEventArgs e) { if (SavedCommands.SelectedItem is string command) await SaveConsoleAsync(command, true); }
    private void DevTools_Click(object sender, RoutedEventArgs e) { try { _player.OpenDevTools(); } catch (Exception error) { AppendConsole(error.Message, "error"); } }
    private async void ConsoleInput_Changed(object sender, TextChangedEventArgs e)
    {
        _completionRequest?.Cancel(); _completionRequest?.Dispose(); _completionRequest = new();
        var token = _completionRequest.Token; var input = ConsoleInput.Text;
        if (SaveConsoleInputButton is not null)
            RunConsoleButton.IsEnabled = SaveConsoleInputButton.IsEnabled = !string.IsNullOrWhiteSpace(input);
        if (!ConsoleSession.LooksCompletable(input) || _player.Story is null) { Completions.ItemsSource = null; return; }
        try { await Task.Delay(160, token); var suggestions = await _bridge.CompleteAsync(input, token); if (!token.IsCancellationRequested && ConsoleInput.Text == input) Completions.ItemsSource = suggestions; }
        catch (OperationCanceledException) { }
        catch (Exception error) { if (!_closed) AppendConsole(error.Message, "error"); }
    }
    private void AcceptCompletion(string completion)
    {
        ConsoleInput.Text = ConsoleSession.ApplyCompletion(ConsoleInput.Text, completion);
        ConsoleInput.SelectionStart = ConsoleInput.Text.Length; Completions.ItemsSource = null; ConsoleInput.Focus(FocusState.Programmatic);
    }
    private void Completion_Click(object sender, ItemClickEventArgs e) { if (e.ClickedItem is string text) AcceptCompletion(text); }
    private async void ConsoleInput_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == VirtualKey.Tab && Completions.Items.Count > 0) { AcceptCompletion(Completions.SelectedItem as string ?? (string)Completions.Items[0]); e.Handled = true; }
        else if (e.Key == VirtualKey.Down && Completions.Items.Count > 0) { Completions.SelectedIndex = (Completions.SelectedIndex + 1) % Completions.Items.Count; Completions.ScrollIntoView(Completions.SelectedItem); e.Handled = true; }
        else if (e.Key == VirtualKey.Up && Completions.Items.Count > 0) { Completions.SelectedIndex = Completions.SelectedIndex <= 0 ? Completions.Items.Count - 1 : Completions.SelectedIndex - 1; Completions.ScrollIntoView(Completions.SelectedItem); e.Handled = true; }
        else if (e.Key is VirtualKey.Up or VirtualKey.Down && _console.History.Count > 0) { _historyPosition = Math.Clamp(_historyPosition + (e.Key == VirtualKey.Up ? -1 : 1), 0, _console.History.Count); ConsoleInput.Text = _historyPosition == _console.History.Count ? "" : _console.History[_historyPosition]; e.Handled = true; }
        else if (e.Key == VirtualKey.Enter) { e.Handled = true; if (Completions.SelectedItem is string completion) AcceptCompletion(completion); else await RunConsoleAsync(ConsoleInput.Text); }
    }
}
