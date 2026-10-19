using System.Text.Json;
using System.Diagnostics;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Automation.Peers;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.Web.WebView2.Core;
using TwinePlayer.Native.Player;
namespace TwinePlayer.Native.App;
public sealed partial class MainWindow
{
    private async Task<JsonElement> EvaluateAwaitedAsync(string expression)
    {
        var result = await _player.Core!.CallDevToolsProtocolMethodAsync("Runtime.evaluate", JsonSerializer.Serialize(new { expression, awaitPromise = true, returnByValue = true, timeout = 5000 }));
        using var json = JsonDocument.Parse(result);
        if (json.RootElement.TryGetProperty("exceptionDetails", out _)) throw new InvalidDataException("Awaited browser evaluation failed: " + result);
        return json.RootElement.GetProperty("result").GetProperty("value").Clone();
    }
    private async Task<object> ExerciseQualityAsync(string[] files)
    {
        var watch = Stopwatch.StartNew();
        var reopenCycles = int.TryParse(Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_SMOKE_REOPENS"), out var requestedCycles) ? Math.Clamp(requestedCycles, 10, 100) : 10;
        var resources = new List<object> { SampleReopenResources(0) };
        for (var i = 0; i < reopenCycles; i++)
        {
            await OpenAsync(files[i % files.Length]);
            if (await _player.ExecuteScriptAsync("localStorage.getItem('native-smoke-marker')") != "\"retained\"") throw new InvalidDataException("Reopen cycle lost story storage.");
            if (await _player.ExecuteScriptAsync("!!window.__twinePlayerNativeInputInstalled&&!!window.__twinePlayerFlutterBridgeInstalled") != "true") throw new InvalidDataException("Reopen lost bridge initialization.");
            if ((i + 1) % 10 == 0 || i + 1 == reopenCycles) resources.Add(SampleReopenResources(i + 1));
        }
        var reopenMilliseconds = watch.Elapsed.TotalMilliseconds;
        var sentinel = "native-reopen-" + Guid.NewGuid().ToString("N"); var deliveries = 0;
        var delivered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        EventHandler<BridgeMessage> observeDelivery = (_, message) => { if (message.Type == "log" && message.Text == sentinel) { deliveries++; delivered.TrySetResult(); } };
        _player.MessageReceived += observeDelivery;
        try
        {
            await _player.ExecuteScriptAsync("chrome.webview.postMessage(JSON.stringify({type:'log',level:'normal',message:" + JsonSerializer.Serialize(sentinel) + "}))");
            await delivered.Task.WaitAsync(TimeSpan.FromSeconds(5)); await Task.Delay(100);
            if (deliveries != 1) throw new InvalidDataException("Reopening duplicated the current browser's message handler.");
        }
        finally { _player.MessageReceived -= observeDelivery; }
        var olderOpen = OpenAsync(files[0]); var newerOpen = OpenAsync(files[1]); await Task.WhenAll(olderOpen, newerOpen);
        if (!_player.Story!.FilePath.Equals(files[1], StringComparison.OrdinalIgnoreCase) || await _player.ExecuteScriptAsync("localStorage.getItem('native-smoke-marker')") != "\"retained\"") throw new InvalidDataException("A canceled older open displaced the latest story.");
        var resourceFixture = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_RESOURCE_LINK_FIXTURE") ?? throw new InvalidDataException("Resource-scope fixture was not supplied.");
        var linkedRejected = false;
        try { await OpenAsync(resourceFixture); } catch (IOException) { linkedRejected = true; }
        if (!linkedRejected || Welcome.Visibility != Visibility.Visible || _browser is not null) throw new InvalidDataException("Filesystem-linked resources were not rejected with a recoverable library view.");
        var linkedSavesRejected = false;
        try { await _saves.ListAsync(resourceFixture); } catch (IOException) { linkedSavesRejected = true; }
        if (!linkedSavesRejected) throw new InvalidDataException("Save listing followed a filesystem link.");
        await OpenAsync(files[0]);
        await _player.ClearStoryBrowserDataAsync(); await OpenAsync(files[0]);
        if (await _player.ExecuteScriptAsync("localStorage.getItem('native-smoke-marker')") != "null") throw new InvalidDataException("Selected-origin browser-data reset failed.");
        await _player.ExecuteScriptAsync("localStorage.setItem('native-smoke-marker','retained')");
        await OpenAsync(files[1]);
        if (await _player.ExecuteScriptAsync("localStorage.getItem('native-smoke-marker')") != "\"retained\"") throw new InvalidDataException("Browser-data reset erased another story.");
        var origin = _player.Story!.Uri.GetLeftPart(UriPartial.Authority);
        await _player.ExecuteScriptAsync("location.href='https://example.invalid/native-security-check'"); await Task.Delay(100);
        if (!_player.Core!.Source.StartsWith(origin, StringComparison.Ordinal)) throw new InvalidDataException("External navigation escaped the approved origin.");
        if ((await EvaluateAwaitedAsync("new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve('granted'),error=>resolve(error.code===1?'denied':'other')))" )).GetString() != "denied") throw new InvalidDataException("Browser permission was not denied.");
        if (_player.Core.Settings.AreHostObjectsAllowed || _player.Core.Settings.AreDevToolsEnabled) throw new InvalidDataException("Browser host objects/DevTools were enabled without explicit action.");
        await ExercisePopupAndDownloadPolicyAsync();
        var messages = 0; EventHandler<BridgeMessage> received = (_, _) => messages++;
        _player.MessageReceived += received;
        try
        {
            await _player.ExecuteScriptAsync("chrome.webview.postMessage('{');chrome.webview.postMessage(JSON.stringify({type:'identity',title:4,ifid:[]}))"); await Task.Delay(100);
            if (messages != 0) throw new InvalidDataException("Malformed bridge messages were accepted.");
        }
        finally { _player.MessageReceived -= received; }
        await ExerciseAccessibilityPeersAsync();
        await OpenAsync(files[^1]);
        var failed = false; EventHandler<string> failure = (_, _) => failed = true; _player.Failed += failure;
        try
        {
            var expectedRoot = Path.Combine(Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_DATA_ROOT") ?? throw new InvalidOperationException("Crash checks require an explicitly isolated profile."), "WebView2");
            if (!Path.GetFullPath(_player.Core!.Environment.UserDataFolder).Equals(Path.GetFullPath(expectedRoot), StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Refusing crash test outside the isolated browser profile.");
            using var browserProcess = Process.GetProcessById((int)_player.Core.BrowserProcessId);
            browserProcess.Kill(entireProcessTree: true); await browserProcess.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(6));
            for (var attempt = 0; attempt < 50 && !failed; attempt++) await Task.Delay(100);
            if (!failed || !ErrorBar.IsOpen) throw new InvalidDataException("Browser failure was not surfaced.");
            await Task.Delay(100); await OpenAsync(files[^1]);
            if (await _player.ExecuteScriptAsync("localStorage.getItem('native-smoke-marker')") != "\"retained\"") throw new InvalidDataException("Browser recovery lost persisted story data.");
        }
        finally { _player.Failed -= failure; }
        return new { reopenCycles, reopenMilliseconds, reopenResources = resources, currentMessageDeliveredOnce = true, filesystemLinkScopeRejected = true, selectedOriginResetPreservesOthers = true, externalNavigationBlocked = true, geolocationDenied = true, popupHandled = true, unexpectedDownloadCanceled = true, malformedMessagesRejected = true, nativePeersAndDialogDirectionalFocus = true, tabTraversal = KeyboardSmokeEnabled ? "Windows-injected Tab/Shift+Tab/modal trap/Escape passed; full manual workflows unverified" : "manual-unverified-runtime-programmatic-Next-options-unsupported", fullscreenKeyboardFromStory = KeyboardSmokeEnabled, zoomKeyboardFromStory = KeyboardSmokeEnabled, normalEscapeAvailableToGame = KeyboardSmokeEnabled, syntheticDomKeysCannotTriggerShortcuts = KeyboardSmokeEnabled, browserCrashSurfacedAndRecovered = true };
    }
    private object SampleReopenResources(int cycle)
    {
        var ids = _player.Core!.Environment.GetProcessInfos().Select(info => info.ProcessId).Append(Environment.ProcessId).Distinct();
        var processes = new List<object>(); long privateBytes = 0;
        foreach (var id in ids)
        {
            try
            {
                using var process = Process.GetProcessById(id);
                privateBytes += process.PrivateMemorySize64;
                processes.Add(new { pid = id, host = id == Environment.ProcessId, process.PrivateMemorySize64, process.WorkingSet64, process.HandleCount });
            }
            catch (ArgumentException) { } // A browser subprocess can exit during sampling.
        }
        return new { cycle, totalPrivateBytes = privateBytes, processes };
    }
    private async Task ExercisePopupAndDownloadPolicyAsync()
    {
        var core = _player.Core!;
        var popup = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var download = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        Windows.Foundation.TypedEventHandler<CoreWebView2, CoreWebView2NewWindowRequestedEventArgs> popupObserved = (_, args) => popup.TrySetResult(args.Handled);
        Windows.Foundation.TypedEventHandler<CoreWebView2, CoreWebView2DownloadStartingEventArgs> downloadObserved = (_, args) => download.TrySetResult(args.Cancel);
        core.NewWindowRequested += popupObserved; core.DownloadStarting += downloadObserved;
        try
        {
            await _player.ExecuteScriptAsync("window.open('https://example.invalid/blocked-popup','_blank');true");
            if (!await popup.Task.WaitAsync(TimeSpan.FromSeconds(5))) throw new InvalidDataException("Popup request was not handled by native policy.");
            // Bypass only the shared bridge's Blob capture interception, so this
            // exercises the actual browser download handler, not host Save UI.
            await _player.ExecuteScriptAsync("(()=>{const url=URL.createObjectURL(new Blob(['native-policy-fixture'],{type:'application/octet-stream'}));window.__twinePlayerBlobRegistry.delete(url);const a=document.createElement('a');a.href=url;a.download='native-policy-fixture.bin';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;})()");
            if (!await download.Task.WaitAsync(TimeSpan.FromSeconds(5))) throw new InvalidDataException("Unexpected browser download was not canceled.");
        }
        finally { core.NewWindowRequested -= popupObserved; core.DownloadStarting -= downloadObserved; }
    }
    private async Task ExerciseAccessibilityPeersAsync()
    {
        foreach (var (control, role) in new (FrameworkElement, AutomationControlType)[] { (OpenButton, AutomationControlType.Button), (LibrarySearch, AutomationControlType.Edit), (ConsoleInput, AutomationControlType.Edit) })
        {
            var peer = FrameworkElementAutomationPeer.FromElement(control) ?? FrameworkElementAutomationPeer.CreatePeerForElement(control);
            if (peer is null || string.IsNullOrWhiteSpace(peer.GetName()) || peer.GetAutomationControlType() != role) throw new InvalidDataException("Critical control has no native automation name/role.");
        }
        var panel = new StackPanel(); var first = new Button { Content = "First focus fixture" }; var second = new Button { Content = "Second focus fixture" }; panel.Children.Add(first); panel.Children.Add(second);
        var dialog = new ContentDialog { XamlRoot = Root.XamlRoot, Title = "Native focus test", Content = panel, CloseButtonText = "Close", DefaultButton = ContentDialogButton.Close };
        var shown = dialog.ShowAsync().AsTask();
        try
        {
            await Task.Delay(100); first.Focus(FocusState.Programmatic);
            for (var i = 0; i < 4; i++)
            {
                if (!FocusManager.TryMoveFocus(i % 2 == 0 ? FocusNavigationDirection.Down : FocusNavigationDirection.Up, new FindNextElementOptions { SearchRoot = dialog })) throw new InvalidDataException("Native dialog directional focus traversal failed.");
                var focused = FocusManager.GetFocusedElement(Root.XamlRoot) as DependencyObject;
                while (focused is not null && focused != dialog) focused = VisualTreeHelper.GetParent(focused);
                if (focused != dialog) throw new InvalidDataException("Focus escaped the native dialog.");
            }
            if (KeyboardSmokeEnabled) await ExerciseDialogKeyboardAsync(dialog, first, second, shown);
        }
        finally { dialog.Hide(); await shown; RestoreStoryFocus(); }
        if (KeyboardSmokeEnabled) await ExerciseFullscreenKeyboardAsync();
    }
}
