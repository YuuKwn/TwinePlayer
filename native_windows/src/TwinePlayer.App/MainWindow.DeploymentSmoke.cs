using System.Text.Json;
using TwinePlayer.Native.App.Services;
namespace TwinePlayer.Native.App;
public sealed partial class MainWindow
{
    internal void ScheduleDeploymentSmoke(string story, string output, bool missingRuntime)
    {
        var started = false;
        Root.Loaded += async (_, _) =>
        {
            if (started) return; started = true;
            try
            {
                if (Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_EXPECT_DENIED_DATA") == "1")
                {
                    try { await _database.ListAsync(); throw new InvalidDataException("Write-denied data folder unexpectedly opened."); }
                    catch (Microsoft.Data.Sqlite.SqliteException error) when (error.SqliteErrorCode is 8 or 14)
                    {
                        if (!OpenButton.IsEnabled) throw new InvalidDataException("Permission failure disabled the Open control.");
                        await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, deniedDataFolder = true, error = error.Message, openEnabled = true }));
                    }
                    return;
                }
                if ((await _database.ListAsync()).Count != 0) throw new InvalidDataException("Fresh library was not empty.");
                if (Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_EXPECT_PROFILE_REDIRECT") == "1")
                {
                    try { await OpenAsync(story); throw new InvalidDataException("A profile redirect unexpectedly opened a story."); }
                    catch (BrowserProfileIsolationException error)
                    {
                        if (!OpenButton.IsEnabled || !ErrorBar.IsOpen || _player.Story is not null) throw new InvalidDataException("Profile refusal did not leave a usable library.");
                        await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, profileRedirectRefused = true, libraryUsable = true, remediation = error.Message }));
                    }
                }
                else if (Environment.GetEnvironmentVariable("TWINEPLAYER_NATIVE_EXPECT_POLICY_IGNORED") == "1")
                {
                    try { await OpenAsync(story); await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, unrelatedPolicyIgnored = true, storyOpened = true })); }
                    catch (InvalidOperationException error) when (error.Message.Contains("Evergreen Runtime", StringComparison.Ordinal))
                    { await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, unrelatedPolicyIgnored = true, runtimeAvailable = false })); }
                }
                else if (missingRuntime)
                {
                    try { await OpenAsync(story); throw new InvalidDataException("Unavailable runtime unexpectedly opened a story."); }
                    catch (InvalidOperationException error) when (error.Message.Contains("Evergreen Runtime", StringComparison.Ordinal))
                    {
                        if (!OpenButton.IsEnabled || !ErrorBar.IsOpen || _player.Story is not null) throw new InvalidDataException("Runtime failure did not leave a usable library.");
                        await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, runtimeCreationFailed = true, browserExecutableOverride = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("WEBVIEW2_BROWSER_EXECUTABLE_FOLDER")), cause = error.InnerException?.GetType().Name, causeHResult = error.InnerException?.HResult, remediation = error.Message, libraryUsable = true }));
                    }
                }
                else
                {
                    await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, freshLibrary = true, openEnabled = OpenButton.IsEnabled, elevated = new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator) }));
                }
            }
            catch (Exception error) { await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = false, error = error.ToString() })); }
            finally { await RequestCloseAsync(); }
        };
    }
}
