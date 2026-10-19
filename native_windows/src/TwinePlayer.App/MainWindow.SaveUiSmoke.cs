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
        async Task<ContentDialog> WaitDialog(string title)
        {
            for (var i = 0; i < 100; i++)
            {
                var dialog = VisualTreeHelper.GetOpenPopupsForXamlRoot(Root.XamlRoot).Select(p => FindUxDialog(p.Child)).FirstOrDefault(d => d?.Title as string == title);
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
        finally
        {
            core.DownloadStarting -= download; receiver.DevToolsProtocolEventReceived -= picker;
            await core.CallDevToolsProtocolMethodAsync("Page.setInterceptFileChooserDialog", "{\"enabled\":false}");
            _testSaveRequest = _testLoadRequest = null;
        }
    }
}
