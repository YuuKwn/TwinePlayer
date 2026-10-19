using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
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
    private string? ConsoleScope => _player.Story is { } story ? ConsoleSession.Scope(story, _currentIfid) : null;
    private void ResetConsole()
    {
        _completionRequest?.Cancel(); _currentIfid = null; _console = new(); _historyPosition = 0;
        if (ConsolePanel is null) return;
        ConsolePanel.Visibility = Visibility.Collapsed; ConsoleColumn.Width = new GridLength(0);
        ConsoleLogs.ItemsSource = null; SavedCommands.ItemsSource = null; Completions.ItemsSource = null; ConsoleInput.Text = "";
    }
    private void AppendConsole(string message, string level, string? command = null)
    {
        _console.Append(message, level, command); ConsoleLogs.ItemsSource = _console.Entries.ToArray();
        if (_console.Entries.Count > 0) ConsoleLogs.ScrollIntoView(_console.Entries[^1]);
    }
    private async Task LoadSavedCommandsAsync()
    {
        if (ConsoleScope is not { } scope) return;
        try { var saved = await _commandStore.GetAsync(scope); if (scope == ConsoleScope && !_closed) SavedCommands.ItemsSource = saved; }
        catch (Exception error) { if (!_closed) AppendConsole(error.Message, "error"); }
    }
    private async void ConsoleEntry_Click(object sender, RoutedEventArgs e)
    {
        if (_player.Story is null) { ViewModel.Status = "Open a story before using its developer console."; return; }
        ConsolePanel.Visibility = Visibility.Visible; ApplyConsoleLayout(); await LoadSavedCommandsAsync(); ConsoleInput.Focus(FocusState.Programmatic);
    }
    private void ConsoleClose_Click(object sender, RoutedEventArgs e) { ConsolePanel.Visibility = Visibility.Collapsed; ConsoleColumn.Width = new GridLength(0); _browser?.Focus(FocusState.Programmatic); }
    private void ConsoleLayout_Changed(object sender, SelectionChangedEventArgs e) { if (ConsolePanel is not null) ApplyConsoleLayout(); }
    private void ApplyConsoleLayout()
    {
        if (ConsolePanel is null || ConsoleLayout is null || Viewport is null) return;
        var side = ConsolePanel.Visibility == Visibility.Visible && ConsoleLayout.SelectedIndex == 1 && Viewport.ActualWidth >= 760;
        ConsolePanel.Width = Math.Min(440, Math.Max(280, Viewport.ActualWidth));
        Grid.SetColumn(ConsolePanel, side ? 1 : 0); ConsoleColumn.Width = new GridLength(side ? ConsolePanel.Width : 0);
        ConsolePanel.HorizontalAlignment = side ? HorizontalAlignment.Stretch : HorizontalAlignment.Right;
    }
    private async Task RunConsoleAsync(string command)
    {
        command = command.Trim(); if (command.Length == 0) return;
        var scope = ConsoleScope;
        AppendConsole("> " + command, "input", command); _historyPosition = _console.History.Count;
        try { AppendConsole(await _bridge.RunCommandAsync(command, _opening?.Token ?? default), "result"); }
        catch (OperationCanceledException) { }
        catch (Exception error) { AppendConsole(error.Message, "error"); }
        if (scope == ConsoleScope && ConsoleInput.Text.Trim() == command) ConsoleInput.Text = "";
        Completions.ItemsSource = null; ConsoleInput.Focus(FocusState.Programmatic);
    }
    private async void ConsoleRun_Click(object sender, RoutedEventArgs e) => await RunConsoleAsync(ConsoleInput.Text);
    private async void ConsoleRerun_Click(object sender, RoutedEventArgs e) { if (ConsoleLogs.SelectedItem is ConsoleEntry { Command: { } command }) await RunConsoleAsync(command); }
    private void ConsoleUseLog_Click(object sender, RoutedEventArgs e) { if (ConsoleLogs.SelectedItem is ConsoleEntry { Command: { } command }) ConsoleInput.Text = command; }
    private async Task SaveConsoleAsync(string command, bool delete = false)
    {
        if (ConsoleScope is not { } scope) return;
        try { await _commandStore.SaveAsync(scope, command, delete); await LoadSavedCommandsAsync(); }
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
