using System.Text;
using System.Text.Json;
using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.App;
public sealed partial class MainWindow
{
    internal void ScheduleShutdownSmoke(string settingsPath, string output)
    {
        var started = false;
        Root.Loaded += async (_, _) =>
        {
            if (started) return; started = true;
            Task? operation = null; string? error = null; var canceled = false; var observedPending = false;
            string? mode = null;
            Closed += (_, _) => File.WriteAllText(output, JsonSerializer.Serialize(new { passed = error is null && observedPending && operation?.IsCompleted == true, mode, observedPending, operationCompletedBeforeClose = operation?.IsCompleted == true, canceled, error }));
            async Task ObserveAsync(Func<Task> action)
            {
                try { await action(); }
                catch (OperationCanceledException) { canceled = true; }
                catch (Exception failure) { error = failure.ToString(); }
            }
            try
            {
                using var settings = JsonDocument.Parse(await File.ReadAllTextAsync(settingsPath));
                mode = settings.RootElement.GetProperty("mode").GetString()!;
                var game = settings.RootElement.GetProperty("game").GetString()!;
                await OpenAsync(game);
                var token = _opening!.Token;
                if (mode is "capture" or "load")
                {
                    // Deterministic pending engine fixture: this checks native
                    // cancellation/close behavior, not engine-format compatibility.
                    await _player.ExecuteScriptAsync(mode == "capture" ? "window.__twinePlayerCaptureSave=()=>({ok:true,pending:true})" : "window.__twinePlayerRestoreSave=()=>({ok:true,pending:true})");
                    operation = ObserveAsync(() => RunSaveActionAsync(async () =>
                    {
                        if (mode == "capture") await CaptureBytesAsync(token);
                        else await RestoreBytesAsync(Encoding.UTF8.GetBytes("shutdown-load-fixture"), token);
                    }));
                    for (var attempt = 0; attempt < 100 && !operation.IsCompleted; attempt++)
                    {
                        if (ViewModel.Status == (mode == "capture" ? "The game is preparing a native disk save…" : "Waiting for the game to finish loading its save…")) { observedPending = true; break; }
                        await Task.Delay(10);
                    }
                }
                else if (mode is "write-cancel" or "write-drain")
                {
                    await _saves.WriteAsync(game, "shutdown.save", Encoding.UTF8.GetBytes("original-save"), false);
                    var bytes = new byte[48 * 1024 * 1024]; Array.Fill(bytes, (byte)'x');
                    operation = ObserveAsync(async () => await _saves.WriteAsync(game, "shutdown.save", bytes, true, mode == "write-cancel" ? token : default));
                    for (var attempt = 0; attempt < 1000 && !operation.IsCompleted; attempt++)
                    {
                        if (Directory.EnumerateFiles(SaveRules.DirectoryFor(game), ".twineplayer-*.tmp").Any()) { observedPending = true; break; }
                        await Task.Delay(1);
                    }
                }
                else throw new InvalidDataException("Unknown shutdown fixture mode.");
                if (!observedPending || operation.IsCompleted) throw new InvalidDataException("No active pending operation was observed before close.");
            }
            catch (Exception failure) { error = failure.ToString(); }
            finally { await RequestCloseAsync(); }
        };
    }
}
