using System.Runtime.InteropServices;
using Microsoft.Win32;
namespace TwinePlayer.Native.App.Services;

internal sealed class BrowserProfileIsolationException(string message) : IOException(message) { }

internal static class BrowserProfilePolicy
{
    [DllImport("shell32.dll", ExactSpelling = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern int GetCurrentProcessExplicitAppUserModelID(out nint appId);

    internal static void RejectRedirects()
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER")))
            throw new BrowserProfileIsolationException("Remove WEBVIEW2_USER_DATA_FOLDER and restart TwinePlayer Native before opening a story or importing browser data. Native must use its separate browser profile; no redirected profile was opened.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "*", Path.GetFileName(Environment.ProcessPath ?? "TwinePlayer.Native.exe") };
        nint appId = 0;
        try { if (GetCurrentProcessExplicitAppUserModelID(out appId) == 0 && appId != 0 && Marshal.PtrToStringUni(appId) is { Length: > 0 } value) names.Add(value); }
        finally { if (appId != 0) Marshal.FreeCoTaskMem(appId); }
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        foreach (var view in new[] { RegistryView.Registry32, RegistryView.Registry64 })
        {
            using var key = RegistryKey.OpenBaseKey(hive, view);
            using var policy = key.OpenSubKey(@"SOFTWARE\Policies\Microsoft\Edge\WebView2\UserDataFolder");
            if (policy is null) continue;
            foreach (var name in policy.GetValueNames())
                if (names.Contains(name) && policy.GetValue(name) is string { Length: > 0 })
                    throw new BrowserProfileIsolationException("An applicable WebView2 UserDataFolder policy would redirect this application's browser profile. Opening was stopped to preserve profile isolation. Ask the administrator to remove that redirect for TwinePlayer Native.");
        }
    }
    internal static void Verify(string actual, string requested)
    {
        if (!Path.TrimEndingDirectorySeparator(Path.GetFullPath(actual)).Equals(Path.TrimEndingDirectorySeparator(Path.GetFullPath(requested)), StringComparison.OrdinalIgnoreCase))
            throw new BrowserProfileIsolationException("WebView2 selected an unexpected browser profile. Opening was stopped before creating the story controller.");
    }
}
