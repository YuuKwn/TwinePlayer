using System.Runtime.InteropServices;
using System.Text.Json;
namespace TwinePlayer.Native.App;
public partial class App
{
    [DllImport("user32.dll", EntryPoint = "MessageBoxW", CharSet = CharSet.Unicode)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    private static extern int StartupMessage(nint owner, string text, string caption, uint flags);
    private static void ReportStartupFailure(string root, Exception error)
    {
        var text = "TwinePlayer could not open its native data folder.\n\n" + root + "\n\n" + error.Message + "\n\nCheck that this location is a writable folder. Original games, saves and Flutter data have not been changed. If you set TWINEPLAYER_NATIVE_DATA_ROOT, correct or remove that override and try again.";
        var report = Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_STARTUP_REPORT");
        if (!string.IsNullOrWhiteSpace(report))
        {
            // Explicit local test runner only; no story message can set this.
            File.WriteAllText(report, JsonSerializer.Serialize(new { startupFailed = true, category = "data-folder", errorType = error.GetType().Name, message = text }));
        }
        else StartupMessage(0, text, "TwinePlayer Native — startup failed", 0x10);
        Environment.Exit(1);
    }
}
