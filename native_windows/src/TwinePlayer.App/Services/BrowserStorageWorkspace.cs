using System.Text.Json;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;
namespace TwinePlayer.Native.App.Services;

// A temporary trusted page in a copied legacy profile or the selected native
// origin. It never loads game HTML, adds host objects or opens original profiles.
internal sealed class BrowserStorageWorkspace : IDisposable
{
    private readonly Panel _parent;
    private readonly WebView2 _view;
    internal CoreWebView2 Core => _view.CoreWebView2;
    internal string Origin { get; }
    private BrowserStorageWorkspace(Panel parent, WebView2 view, string host)
    { _parent = parent; _view = view; Origin = "https://" + host; }
    internal static async Task<BrowserStorageWorkspace> OpenAsync(Panel parent, string profile, string host, CancellationToken token)
    {
        BrowserProfilePolicy.RejectRedirects();
        var view = new WebView2 { Width = 1, Height = 1, Opacity = 0, IsHitTestVisible = false, IsTabStop = false, HorizontalAlignment = HorizontalAlignment.Left, VerticalAlignment = VerticalAlignment.Top };
        parent.Children.Add(view); var workspace = new BrowserStorageWorkspace(parent, view, host);
        try
        {
            var environment = await CoreWebView2Environment.CreateWithOptionsAsync(null, profile, null);
            BrowserProfilePolicy.Verify(environment.UserDataFolder, profile);
            await view.EnsureCoreWebView2Async(environment); token.ThrowIfCancellationRequested();
            var core = workspace.Core;
            core.Settings.AreHostObjectsAllowed = false; core.Settings.IsWebMessageEnabled = false; core.Settings.AreDevToolsEnabled = false; core.Settings.AreDefaultContextMenusEnabled = false;
            var resources = Path.Combine(AppContext.BaseDirectory, "Assets", "BrowserStorage");
            if (!File.Exists(Path.Combine(resources, "browser-storage.html"))) throw new FileNotFoundException("Trusted browser migration assets are missing.");
            core.SetVirtualHostNameToFolderMapping(host, resources, CoreWebView2HostResourceAccessKind.Deny);
            core.PermissionRequested += (_, args) => { args.State = CoreWebView2PermissionState.Deny; args.Handled = true; };
            core.NewWindowRequested += (_, args) => args.Handled = true;
            core.DownloadStarting += (_, args) => args.Cancel = true;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            core.WebResourceRequested += (_, args) => args.Response = environment.CreateWebResourceResponse(null, 403, "Offline migration workspace", "");
            await core.CallDevToolsProtocolMethodAsync("Network.setBypassServiceWorker", "{\"bypass\":true}");
            var uri = workspace.Origin + "/browser-storage.html";
            core.NavigationStarting += (_, args) => { if (!args.Uri.Equals(uri, StringComparison.Ordinal)) args.Cancel = true; };
            var navigation = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            core.NavigationCompleted += (_, args) => { if (args.IsSuccess) navigation.TrySetResult(); else navigation.TrySetException(new IOException("The trusted migration page could not load: " + args.WebErrorStatus)); };
            core.Navigate(uri); await navigation.Task.WaitAsync(TimeSpan.FromSeconds(20), token);
            if ((await workspace.EvaluateAsync("!!window.nativeBrowserStorage", token)).ValueKind != JsonValueKind.True) throw new IOException("Trusted migration script did not initialize.");
            return workspace;
        }
        catch { workspace.Dispose(); throw; }
    }
    internal async Task<JsonElement> EvaluateAsync(string expression, CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        var raw = await Core.CallDevToolsProtocolMethodAsync("Runtime.evaluate", JsonSerializer.Serialize(new { expression, awaitPromise = true, returnByValue = true }));
        token.ThrowIfCancellationRequested();
        if (raw.Length > 256 * 1024 * 1024) throw new InvalidDataException("The selected storage exceeds the migration response limit.");
        return await Task.Run(() =>
        {
            using var json = JsonDocument.Parse(raw);
            if (json.RootElement.TryGetProperty("exceptionDetails", out var failure)) throw new InvalidDataException("Browser storage operation failed: " + failure.GetRawText());
            if (!json.RootElement.GetProperty("result").TryGetProperty("value", out var value)) throw new InvalidDataException("Storage workspace returned no data.");
            return value.Clone();
        }, token);
    }
    internal Task<JsonElement> CatalogAsync(CancellationToken token = default) => EvaluateAsync("window.nativeBrowserStorage.catalog()", token);
    internal async Task<string> ExportAsync(string[] keys, string[] databases, CancellationToken token = default)
    {
        var selection = JsonSerializer.Serialize(new { localStorage = keys, databases });
        var result = await EvaluateAsync("window.nativeBrowserStorage.exportSelected(" + selection + ")", token);
        var json = result.GetString() ?? throw new InvalidDataException("No storage snapshot returned.");
        if (System.Text.Encoding.UTF8.GetByteCount(json) > 128 * 1024 * 1024) throw new InvalidDataException("Select fewer databases; this snapshot exceeds 128 MiB. Source data was preserved.");
        return json;
    }
    internal Task<JsonElement> ImportAsync(string json, CancellationToken token = default) => EvaluateAsync("window.nativeBrowserStorage.importSelected(" + JsonSerializer.Serialize(json) + ")", token);
    internal async Task<JsonElement> CookiesAsync()
    {
        // Include cookies on all paths, not just the workspace page's path.
        var raw = await Core.CallDevToolsProtocolMethodAsync("Network.getAllCookies", "{}");
        using var document = JsonDocument.Parse(raw); var host = new Uri(Origin).Host;
        var matching = document.RootElement.GetProperty("cookies").EnumerateArray().Where(cookie => { var domain = cookie.GetProperty("domain").GetString()!.TrimStart('.'); return host.Equals(domain, StringComparison.OrdinalIgnoreCase) || host.EndsWith("." + domain, StringComparison.OrdinalIgnoreCase); }).Select(cookie => cookie.Clone()).ToArray();
        return JsonSerializer.SerializeToElement(matching);
    }
    internal async Task<bool> AddCookieIfAbsentAsync(JsonElement cookie)
    {
        var name = cookie.GetProperty("name").GetString()!; var path = cookie.GetProperty("path").GetString()!;
        if (cookie.TryGetProperty("partitionKey", out _) || cookie.TryGetProperty("partitionKeyOpaque", out var opaque) && opaque.ValueKind == JsonValueKind.True) throw new NotSupportedException("Partitioned cookies require a separate migration path and were preserved in the source snapshot.");
        var existing = await CookiesAsync();
        if (existing.EnumerateArray().Any(item => item.GetProperty("name").GetString() == name && item.GetProperty("path").GetString() == path)) return false;
        var value = new Dictionary<string, object?> { ["name"] = name, ["value"] = cookie.GetProperty("value").GetString(), ["url"] = Origin + "/", ["path"] = path, ["secure"] = cookie.GetProperty("secure").GetBoolean(), ["httpOnly"] = cookie.GetProperty("httpOnly").GetBoolean() };
        if (cookie.TryGetProperty("sameSite", out var sameSite)) value["sameSite"] = sameSite.GetString();
        if (cookie.GetProperty("expires").GetDouble() > 0) value["expires"] = cookie.GetProperty("expires").GetDouble();
        var raw = await Core.CallDevToolsProtocolMethodAsync("Network.setCookie", JsonSerializer.Serialize(value));
        using var result = JsonDocument.Parse(raw);
        if (!result.RootElement.GetProperty("success").GetBoolean()) throw new IOException("Browser rejected the selected cookie.");
        return true;
    }
    public void Dispose() { _parent.Children.Remove(_view); _view.Close(); }
}
