using Microsoft.UI.Xaml;
namespace TwinePlayer.Native.App;
public sealed partial class MainWindow
{
    internal void ScheduleBenchmark(string story, string root)
    {
        var started = false;
        Root.Loaded += async (_, _) =>
        {
            if (started) return; started = true;
            try { await OpenAsync(story); await _player.ExecuteScriptAsync("window.__twinePlayerBenchmarkReady=true"); }
            catch (Exception error) { await File.WriteAllTextAsync(Path.Combine(root, "error.txt"), error.ToString()); }
            var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(500) };
            timer.Tick += async (_, _) => { if (!File.Exists(Path.Combine(root, "stop"))) return; timer.Stop(); await RequestCloseAsync(); };
            Closed += (_, _) => timer.Stop(); timer.Start();
        };
    }
}
