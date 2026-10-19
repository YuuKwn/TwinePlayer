using Microsoft.Extensions.Logging;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
using TwinePlayer.Native.Player;
using System.Text.Json;

namespace TwinePlayer.Native.App.Services;

public sealed class TwinePlayerService(StoryIdentityStore identities, NativePaths paths, ILogger<TwinePlayerService> logger) : IDisposable, IStoryScriptHost
{
    private CoreWebView2? _core;
    private StoryIdentity? _story;
    private long _generation;
    internal long DocumentGeneration { get; private set; }
    private TaskCompletionSource? _navigation;
    private CoreWebView2Environment? _environment;
    private bool _inputLab;
    private int _pendingMessages;
    private string? _documentScriptId;
    private Windows.Foundation.TypedEventHandler<CoreWebView2, CoreWebView2ProcessFailedEventArgs>? _processFailedHandler;
    private Windows.Foundation.TypedEventHandler<CoreWebView2, CoreWebView2WebResourceRequestedEventArgs>? _resourceHandler;
    private Windows.Foundation.TypedEventHandler<CoreWebView2, CoreWebView2WebMessageReceivedEventArgs>? _messageHandler;
    public event EventHandler<string>? StatusChanged;
    public event EventHandler<string>? Failed;
    public event EventHandler<BridgeMessage>? MessageReceived;
    public event EventHandler? Navigated;
    internal StoryIdentity? Story => _story;
    internal CoreWebView2? Core => _core;

    public async Task OpenAsync(WebView2 view, string path, CancellationToken token, bool inputLab = false)
    {
        var requestedGeneration = _generation;
        var fullPath = StoryFileRules.Normalize(path);
        await Task.Run(() =>
        {
            using var stream = File.Open(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            if (stream.Length == 0) throw new InvalidDataException("The selected story file is empty.");
            var buffer = new byte[(int)Math.Min(stream.Length, 64 * 1024)];
            var count = stream.Read(buffer);
            var prefix = System.Text.Encoding.UTF8.GetString(buffer, 0, count);
            if (!prefix.Contains('<')) throw new InvalidDataException("The selected file does not appear to contain HTML.");
            StoryResourceRules.ValidateFolder(Path.GetDirectoryName(fullPath)!, token);
        }, token);
        token.ThrowIfCancellationRequested();
        if (requestedGeneration != _generation) throw new OperationCanceledException("A newer story open replaced this request.");
        Detach();
        var generation = _generation;
        var story = inputLab ? new StoryIdentity(new Guid("d8d78dd0-c7e2-4d38-92c5-9840c282d19f"), fullPath) : await identities.GetOrCreateAsync(fullPath, token);
        token.ThrowIfCancellationRequested();
        BrowserProfilePolicy.RejectRedirects();
        await Task.Run(() => Directory.CreateDirectory(paths.BrowserData), token);
        CoreWebView2Environment environment;
        try { environment = await CoreWebView2Environment.CreateWithOptionsAsync(null, paths.BrowserData, null); }
        catch (Exception error) { throw new InvalidOperationException("WebView2 could not start. Install or repair the Microsoft Edge WebView2 Evergreen Runtime from https://developer.microsoft.com/microsoft-edge/webview2/ and try again. For an offline PC, obtain the x64 Evergreen Standalone Installer on another PC. Check any WEBVIEW2_BROWSER_EXECUTABLE_FOLDER override as well.", error); }
        BrowserProfilePolicy.Verify(environment.UserDataFolder, paths.BrowserData);
        token.ThrowIfCancellationRequested();
        if (generation != _generation) throw new OperationCanceledException();
        await view.EnsureCoreWebView2Async(environment);
        token.ThrowIfCancellationRequested();
        if (generation != _generation) throw new OperationCanceledException();
        _core = view.CoreWebView2;
        _environment = environment; _inputLab = inputLab;
        _story = story;
        _core.Settings.AreHostObjectsAllowed = false;
        _core.Settings.IsWebMessageEnabled = true;
        _core.Settings.AreDefaultContextMenusEnabled = true;
        _core.Settings.AreDevToolsEnabled = false;
        _core.Settings.IsZoomControlEnabled = false; // Native shortcuts/settings own the per-story zoom value.
        _core.Settings.IsStatusBarEnabled = false;
        _core.Settings.IsBuiltInErrorPageEnabled = false;
        _core.SetVirtualHostNameToFolderMapping(story.HostName, story.ResourceDirectory, CoreWebView2HostResourceAccessKind.DenyCors);
        _core.NavigationStarting += NavigationStarting;
        _core.NavigationCompleted += NavigationCompleted;
        _core.FrameNavigationStarting += FrameNavigationStarting;
        _core.NewWindowRequested += NewWindowRequested;
        _core.PermissionRequested += PermissionRequested;
        _core.DownloadStarting += DownloadStarting;
        _core.SaveAsUIShowing += SaveAsUIShowing;
        _processFailedHandler = (sender, args) => { if (generation == _generation) ProcessFailed(sender, args); };
        _core.ProcessFailed += _processFailedHandler;
        _core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
        _resourceHandler = (sender, args) => { if (generation == _generation) WebResourceRequested(sender, args); };
        _core.WebResourceRequested += _resourceHandler;
        _messageHandler = (sender, args) => { if (generation == _generation) WebMessageReceived(sender, args); };
        _core.WebMessageReceived += _messageHandler;
        _documentScriptId = await _core.AddScriptToExecuteOnDocumentCreatedAsync("if(window===window.top){" + TwineBridge.Script + "}");
        token.ThrowIfCancellationRequested();
        if (generation != _generation) throw new OperationCanceledException();
        var navigation = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _navigation = navigation;
        _core.Navigate(story.Uri.AbsoluteUri);
        try { await navigation.Task.WaitAsync(TimeSpan.FromSeconds(45), token); }
        catch
        {
            if (generation == _generation)
            {
                try { _core?.Stop(); }
                catch (Exception closed) when (closed is System.Runtime.InteropServices.COMException or ObjectDisposedException or InvalidOperationException)
                { logger.LogDebug("Navigation ended after its browser stopped: {Kind}", closed.GetType().Name); }
            }
            throw;
        }
    }

    private void NavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
    {
        if (_story is null || !StoryNavigationPolicy.IsAllowed(_story, args.Uri))
        {
            args.Cancel = true;
            StatusChanged?.Invoke(this, "External navigation was blocked. Stories stay inside their approved local origin.");
            return;
        }
        DocumentGeneration++;
        StatusChanged?.Invoke(this, "Loading story…");
    }

    private void FrameNavigationStarting(CoreWebView2 sender, CoreWebView2NavigationStartingEventArgs args)
    {
        // Local frames and data-backed frames may render, but never gain host messaging.
        if (_story is null || (!StoryNavigationPolicy.IsAllowed(_story, args.Uri) &&
            args.Uri != "about:blank" && !args.Uri.StartsWith("data:", StringComparison.OrdinalIgnoreCase))) args.Cancel = true;
    }

    private void NavigationCompleted(CoreWebView2 sender, CoreWebView2NavigationCompletedEventArgs args)
    {
        if (args.IsSuccess)
        {
            StatusChanged?.Invoke(this, "Story ready");
            _navigation?.TrySetResult();
            Navigated?.Invoke(this, EventArgs.Empty);
        }
        else
        {
            var message = $"Story navigation failed: {args.WebErrorStatus}. Check that the story and its local assets are readable.";
            _navigation?.TrySetException(new IOException(message));
            Failed?.Invoke(this, message);
            logger.LogWarning("Navigation failed: {Status}", args.WebErrorStatus);
        }
    }
    private void NewWindowRequested(CoreWebView2 sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
        StatusChanged?.Invoke(this, "Popup blocked by the story browser policy.");
    }
    private void PermissionRequested(CoreWebView2 sender, CoreWebView2PermissionRequestedEventArgs args)
    {
        args.State = CoreWebView2PermissionState.Deny;
        args.Handled = true;
    }
    private void DownloadStarting(CoreWebView2 sender, CoreWebView2DownloadStartingEventArgs args)
    {
        args.Cancel = true;
        args.Handled = true;
        StatusChanged?.Invoke(this, "Unexpected download blocked. Use the native Save control for supported SugarCube stories.");
    }
    private void SaveAsUIShowing(CoreWebView2 sender, CoreWebView2SaveAsUIShowingEventArgs args)
    {
        args.Cancel = true;
        args.SuppressDefaultDialog = true;
        MessageReceived?.Invoke(this, new BridgeMessage("save-request"));
    }
    private void ProcessFailed(CoreWebView2 sender, CoreWebView2ProcessFailedEventArgs args)
    {
        var message = $"The story browser stopped ({args.ProcessFailedKind}). Reopen the game to recover; stored browser data is preserved.";
        _navigation?.TrySetException(new IOException(message));
        Failed?.Invoke(this, message);
        logger.LogError("WebView process failed: {Kind}; reason: {Reason}; exit code: {ExitCode}", args.ProcessFailedKind, args.Reason, args.ExitCode);
    }

    private async void WebMessageReceived(CoreWebView2 sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (_story is null || _core is null) return;
        if (Interlocked.Increment(ref _pendingMessages) > 4) { Interlocked.Decrement(ref _pendingMessages); return; }
        try
        {
            var story = _story; var generation = _generation; var document = DocumentGeneration;
            var raw = args.TryGetWebMessageAsString();
            if (raw.Length > BridgeMessages.MaxEnvelopeBytes) return;
            var source = args.Source;
            var message = await Task.Run(() => BridgeMessages.Parse(raw, source, story));
            if (generation != _generation || document != DocumentGeneration || _story?.Id != story.Id) return;
            if (message is not null) MessageReceived?.Invoke(this, message);
            else logger.LogWarning("Rejected unrecognized or invalid story message");
        }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or System.Runtime.InteropServices.COMException)
        { logger.LogWarning(error, "Rejected malformed WebView message"); }
        finally { Interlocked.Decrement(ref _pendingMessages); }
    }

    private async void WebResourceRequested(CoreWebView2 sender, CoreWebView2WebResourceRequestedEventArgs args)
    {
        if (_story is not { } story || _environment is not { } environment) return;
        var generation = _generation; var lab = _inputLab;
        Windows.Foundation.Deferral? deferral = null;
        try
        {
            deferral = args.GetDeferral();
            var source = args.Request.Uri;
            await Task.Run(() =>
            {
                if (!Uri.TryCreate(source, UriKind.Absolute, out var uri)) throw new ArgumentException("Invalid resource URL.");
                if (uri.Host.Equals(story.HostName, StringComparison.OrdinalIgnoreCase)) StoryResourceRules.Validate(source, story);
                else if (uri.IsFile || uri.Host.Equals("twineplayer.local", StringComparison.OrdinalIgnoreCase) || uri.Host.EndsWith(".twineplayer.local", StringComparison.OrdinalIgnoreCase) || lab && uri.Scheme is "http" or "https") throw new ArgumentException("Resource is outside the approved story scope.");
            });
            if (generation != _generation) return;
        }
        catch (Exception error) when (error is ArgumentException or IOException or UnauthorizedAccessException)
        {
            try { if (generation == _generation) args.Response = environment.CreateWebResourceResponse(null, 403, "Resource blocked", "Content-Type: text/plain\r\n"); }
            catch (Exception closed) when (closed is System.Runtime.InteropServices.COMException or ObjectDisposedException) { logger.LogDebug("Resource response ended after its browser closed"); }
            logger.LogWarning("Story resource blocked by resource policy");
        }
        catch (Exception error) when (error is System.Runtime.InteropServices.COMException or ObjectDisposedException) { logger.LogDebug("Resource request ended after its browser closed"); }
        finally { try { deferral?.Complete(); deferral?.Dispose(); } catch (Exception error) when (error is System.Runtime.InteropServices.COMException or ObjectDisposedException) { logger.LogDebug("Resource deferral ended after its browser closed"); } }
    }

    public async Task<string> ExecuteScriptAsync(string script, CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        var core = _core ?? throw new InvalidOperationException("Open a story first.");
        var generation = _generation;
        var document = DocumentGeneration;
        var result = await core.ExecuteScriptAsync(script);
        token.ThrowIfCancellationRequested();
        if (generation != _generation || document != DocumentGeneration || core != _core) throw new OperationCanceledException("The story changed during this operation.");
        return result;
    }
    internal void OpenDevTools() { if (_core is null) throw new InvalidOperationException("Open a story first."); _core.Settings.AreDevToolsEnabled = true; _core.OpenDevToolsWindow(); }
    internal async Task ClearStoryBrowserDataAsync()
    {
        var core = _core ?? throw new InvalidOperationException("Open a story first."); var story = _story!; var generation = _generation;
        await core.CallDevToolsProtocolMethodAsync("Storage.clearDataForOrigin", JsonSerializer.Serialize(new { origin = story.Uri.GetLeftPart(UriPartial.Authority), storageTypes = "all" }));
        if (generation != _generation) throw new OperationCanceledException("The story changed during browser-data reset.");
    }
    internal async Task SetStoryZoomAsync(double zoom, double width, double height, double rasterizationScale, CancellationToken token = default)
    {
        var core = _core ?? throw new InvalidOperationException("Open a story first.");
        var generation = _generation; token.ThrowIfCancellationRequested();
        zoom = Math.Clamp(zoom, .75, 1.75);
        if (zoom == 1) await core.CallDevToolsProtocolMethodAsync("Emulation.clearDeviceMetricsOverride", "{}");
        else if (width > 0 && height > 0)
        {
            var screen = JsonSerializer.Deserialize<JsonElement>(await core.ExecuteScriptAsync("JSON.stringify({width:screen.width,height:screen.height})"));
            using var dimensions = JsonDocument.Parse(screen.GetString()!);
            await core.CallDevToolsProtocolMethodAsync("Emulation.setDeviceMetricsOverride", JsonSerializer.Serialize(new
            {
                width = (int)Math.Max(1, Math.Round(width / zoom)), height = (int)Math.Max(1, Math.Round(height / zoom)),
                deviceScaleFactor = Math.Max(.1, rasterizationScale) * zoom, mobile = false,
                screenWidth = dimensions.RootElement.GetProperty("width").GetInt32(), screenHeight = dimensions.RootElement.GetProperty("height").GetInt32()
            }));
        }
        token.ThrowIfCancellationRequested();
        if (generation != _generation || core != _core) throw new OperationCanceledException("The story changed during zoom.");
    }

    public void Detach()
    {
        _generation++;
        _navigation?.TrySetCanceled();
        _navigation = null;
        if (_core is not null)
        {
            // A terminated browser can reject cleanup calls. Still release every
            // subscription/reference so reopening can create a fresh controller.
            void Cleanup(Action action) { try { action(); } catch (Exception error) when (error is System.Runtime.InteropServices.COMException or InvalidOperationException or ObjectDisposedException) { logger.LogDebug("Browser cleanup after closed controller: {Kind}", error.GetType().Name); } }
            Cleanup(() => _core.NavigationStarting -= NavigationStarting);
            Cleanup(() => _core.NavigationCompleted -= NavigationCompleted);
            Cleanup(() => _core.FrameNavigationStarting -= FrameNavigationStarting);
            Cleanup(() => _core.NewWindowRequested -= NewWindowRequested);
            Cleanup(() => _core.PermissionRequested -= PermissionRequested);
            Cleanup(() => _core.DownloadStarting -= DownloadStarting);
            Cleanup(() => _core.SaveAsUIShowing -= SaveAsUIShowing);
            if (_processFailedHandler is not null) Cleanup(() => _core.ProcessFailed -= _processFailedHandler);
            if (_resourceHandler is not null) Cleanup(() => _core.WebResourceRequested -= _resourceHandler);
            Cleanup(() => _core.RemoveWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All));
            if (_documentScriptId is not null) Cleanup(() => _core.RemoveScriptToExecuteOnDocumentCreated(_documentScriptId));
            if (_messageHandler is not null) Cleanup(() => _core.WebMessageReceived -= _messageHandler);
            if (_story is not null) Cleanup(() => _core.ClearVirtualHostNameToFolderMapping(_story.HostName));
        }
        _core = null;
        _environment = null;
        _documentScriptId = null;
        _messageHandler = null;
        _processFailedHandler = null;
        _resourceHandler = null;
        _story = null;
    }
    public void Dispose() => Detach();
}
