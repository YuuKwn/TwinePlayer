using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Automation.Provider;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.Web.WebView2.Core;
using System.Text.Json;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    private async Task ExerciseNativeSaveUiAsync(string game)
    {
        var core = _player.Core!;
        var downloads = 0; var filePickers = 0;
        var receiver = core.GetDevToolsProtocolEventReceiver("Page.fileChooserOpened");
        Windows.Foundation.TypedEventHandler<CoreWebView2, CoreWebView2DevToolsProtocolEventReceivedEventArgs> picker = (_, _) => filePickers++;
        Windows.Foundation.TypedEventHandler<CoreWebView2, CoreWebView2DownloadStartingEventArgs> download = (_, _) => downloads++;
        receiver.DevToolsProtocolEventReceived += picker; core.DownloadStarting += download;
        // Test guard only: fail if a picker would have opened, rather than leave
        // an unattended OS dialog behind on a regression. Not used in production.
        await core.CallDevToolsProtocolMethodAsync("Page.setInterceptFileChooserDialog", "{\"enabled\":true}");
        async Task<Controls.SaveManagerPanel> WaitDialog(string title)
        {
            for (var i = 0; i < 100; i++)
            {
                var dialog = _activeSaveManager is { IsOpen: true } active && active.Title == title ? active : null;
                if (dialog is not null) return dialog;
                await Task.Delay(30);
            }
            throw new InvalidDataException("Native dialog did not open: " + title);
        }
        async Task WaitIdle()
        {
            for (var i = 0; i < 100 && (_saveActionInProgress || _saveDialogOpen); i++) await Task.Delay(30);
            if (_saveActionInProgress || _saveDialogOpen) throw new InvalidDataException("Canceled save/load action did not become idle.");
        }
        Exception? failure = null;
        try
        {
            // First action in a fresh profile is the real host Load button.
            Load_Click(this, new RoutedEventArgs());
            (await WaitDialog("Load game")).Hide(); await WaitIdle();
            Load_Click(this, new RoutedEventArgs());
            var manager = await WaitDialog("Load game");
            Button? FindCreate(DependencyObject root)
            {
                if (root is Button { Content: "Create a new save…" } button) return button;
                for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++) if (FindCreate(VisualTreeHelper.GetChild(root, i)) is { } found) return found;
                return null;
            }
            var create = FindCreate(manager) ?? throw new InvalidDataException("Load manager has no create-save action.");
            var peer = FrameworkElementAutomationPeer.CreatePeerForElement(create);
            ((IInvokeProvider)peer.GetPattern(PatternInterface.Invoke)).Invoke();
            (await WaitDialog("Save game")).Hide(); await WaitIdle();
            if ((await _saves.ListAsync(game)).Count != 0) throw new InvalidDataException("Canceling native UI created a save.");
            foreach (var profile in new[] { TwinePlayer.Native.Core.InteractionProfile.Compact, TwinePlayer.Native.Core.InteractionProfile.Comfortable })
            foreach (var expanded in new[] { false, true })
            {
                _interaction.Select(profile); _sidebarExpanded = expanded; ApplyInteractionLayout();
                await Task.Delay(80); Root.UpdateLayout();
                Button Command(string id) => profile == TwinePlayer.Native.Core.InteractionProfile.Compact
                    ? id switch { "save" => SaveButton, "load" => LoadButton, _ => ConsoleEntryButton }
                    : ComfortableCommands.Children.Concat(ComfortablePinned.Children).OfType<Button>().Single(b => b.Tag as string == id);
                foreach (var id in new[] { "save", "load" })
                {
                    var button = Command(id);
                    InvokeUxButton(button);
                    await WaitDialog(id == "save" ? "Save game" : "Load game");
                    if (!button.IsEnabled || SaveManagerHost.Visibility != Visibility.Visible) throw new InvalidDataException("Open manager disabled its toggle.");
                    AssertSidebarHitTarget(button);
                    InvokeUxButton(button); await WaitIdle();
                    if (SaveManagerHost.Visibility != Visibility.Collapsed) throw new InvalidDataException("Repeated button click left the manager open.");
                }
                var console = Command("console");
                InvokeUxButton(console); await Task.Delay(60);
                if (ConsolePanel.Visibility != Visibility.Visible) throw new InvalidDataException("Console button did not open its panel.");
                InvokeUxButton(console); await Task.Delay(60);
                if (ConsolePanel.Visibility != Visibility.Collapsed || ConsoleColumn.Width.Value != 0) throw new InvalidDataException("Repeated Console click did not close its panel.");
            }
            if ((await _saves.ListAsync(game)).Count != 0) throw new InvalidDataException("Toggle cancellation wrote a save.");
            await _player.ExecuteScriptAsync("__nativeSmokeVars().__nativeSidebarMarker='saved-through-ui';SugarCube.Engine?SugarCube.Engine.play(__nativeSmokePassage()):SugarCube.state.display(__nativeSmokePassage())");
            Save_Click(this, new RoutedEventArgs());
            var saveForm = await WaitDialog("Save game");
            var nameField = FindUxElement<TextBox>(saveForm) ?? throw new InvalidDataException("Save filename is missing.");
            nameField.Text = "sidebar-ui.save";
            InvokeUxButton(FindSaveAction(saveForm, "Save") ?? throw new InvalidDataException("Save action is missing."));
            await WaitIdle();
            if (!(await _saves.ListAsync(game)).Any(s => s.Filename == "sidebar-ui.save")) throw new InvalidDataException("Save panel did not write the requested file.");
            await _player.ExecuteScriptAsync("__nativeSmokeVars().__nativeSidebarMarker='changed'");
            Load_Click(this, new RoutedEventArgs());
            var loadForm = await WaitDialog("Load game");
            var savedList = FindUxElement<ListView>(loadForm) ?? throw new InvalidDataException("Load list is missing.");
            savedList.SelectedItem = savedList.Items.Cast<TwinePlayer.Native.Core.SaveEntry>().Single(s => s.Filename == "sidebar-ui.save");
            InvokeUxButton(FindSaveAction(loadForm, "Load") ?? throw new InvalidDataException("Load action is missing."));
            await WaitIdle();
            if (await _player.ExecuteScriptAsync("__nativeSmokeVars().__nativeSidebarMarker") != "\"saved-through-ui\"") throw new InvalidDataException("Load panel did not restore the saved game state.");
            byte[]? saved = null;
            for (var round = 0; round < 2; round++)
            {
                await _player.ExecuteScriptAsync($"__nativeSmokeVars().__nativeDialogMarker={JsonSerializer.Serialize("round-" + round)};SugarCube.Engine?SugarCube.Engine.play(__nativeSmokePassage()):SugarCube.state.display(__nativeSmokePassage())");
                saved = await CaptureBytesAsync(default);
                await _saves.WriteAsync(game, "native-ui.save", saved, round != 0);
                await _player.ExecuteScriptAsync("__nativeSmokeVars().__nativeDialogMarker='changed'");
                await RestoreBytesAsync(await _saves.ReadAsync(game, "native-ui.save"), default);
                if (await _player.ExecuteScriptAsync("__nativeSmokeVars().__nativeDialogMarker") != JsonSerializer.Serialize("round-" + round)) throw new InvalidDataException("Native first/repeated load did not restore state.");
            }
            var invalidFailed = false;
            try { await RestoreBytesAsync("invalid-save-native-regression"u8.ToArray(), default); }
            catch (InvalidDataException) { invalidFailed = true; }
            if (!invalidFailed || !ErrorBar.IsOpen) throw new InvalidDataException("Invalid save did not fail visibly in native UI.");
            await RestoreBytesAsync(saved!, default);
            await Task.Delay(400);
            if (await _player.ExecuteScriptAsync("!!document.getElementById('twineplayer-save-operation') || !!SugarCube.Dialog?.isOpen?.() || !!SugarCube.UISystem?.isOpen?.()") != "false") throw new InvalidDataException("Save operation leaked a game dialog or suppression style.");
            await _player.ExecuteScriptAsync("(()=>{const input=document.createElement('input');input.id='native-save-picker';input.type='file';input.accept='.save';document.body.append(input);const label=document.createElement('label');label.htmlFor=input.id;label.id='native-save-label';document.body.append(label);})()");
            foreach (var trigger in new[] { "document.getElementById('native-save-picker').click()", "document.getElementById('native-save-label').click()", "document.getElementById('native-save-picker').showPicker()", "document.querySelector('#menu-item-saves,#menu-saves').click()" })
            {
                _testLoadRequest = new(TaskCreationOptions.RunContinuationsAsynchronously);
                await _player.ExecuteScriptAsync(trigger);
                try { await _testLoadRequest.Task.WaitAsync(TimeSpan.FromSeconds(3)); }
                catch (TimeoutException error) { throw new InvalidDataException("Native load request missing for " + trigger + ": " + await _player.ExecuteScriptAsync("JSON.stringify({version:document.querySelector('tw-storydata')?.getAttribute('format-version'),menu:document.getElementById('menu-item-saves')?.outerHTML,engine:__twinePlayerDetectEngine()})"), error); }
            }
            _testSaveRequest = new(TaskCreationOptions.RunContinuationsAsynchronously);
            await core.ShowSaveAsUIAsync();
            await _testSaveRequest.Task.WaitAsync(TimeSpan.FromSeconds(3));
            if (downloads != 0 || filePickers != 0) throw new InvalidDataException($"Unexpected browser UI requested: downloads={downloads}, pickers={filePickers}.");
        }
        catch (Exception error) { failure = error; throw; }
        finally
        {
            core.DownloadStarting -= download; receiver.DevToolsProtocolEventReceived -= picker;
            // A failed browser can reject cleanup too; preserve the original
            // failure so a regression report identifies the operation that failed.
            try { await core.CallDevToolsProtocolMethodAsync("Page.setInterceptFileChooserDialog", "{\"enabled\":false}"); }
            catch (System.Runtime.InteropServices.COMException) when (failure is not null) { }
            _testSaveRequest = _testLoadRequest = null;
        }
    }

    private static Button? FindSaveAction(DependencyObject root, string text)
    {
        if (root is Button button && button.Content as string == text) return button;
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
            if (FindSaveAction(VisualTreeHelper.GetChild(root, i), text) is { } child) return child;
        return null;
    }
}
