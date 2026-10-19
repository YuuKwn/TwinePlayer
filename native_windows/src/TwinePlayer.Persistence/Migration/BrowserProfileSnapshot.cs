using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
namespace TwinePlayer.Native.Persistence;

public sealed record BrowserProfileFile(string Path, long Bytes, string Sha256);
public sealed record BrowserProfileCopy(string Source, string BackupDirectory, string WorkingProfile, IReadOnlyList<BrowserProfileFile> Files);
public static class BrowserProfileSnapshot
{
    public static string DefaultSource => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "flutter_webview_windows", "twine_player_flutter");
    public static Task<BrowserProfileCopy> CreateAsync(string source, string backupRoot, CancellationToken token = default) => Task.Run(async () =>
    {
        source = Path.GetFullPath(source).TrimEnd(Path.DirectorySeparatorChar);
        backupRoot = Path.GetFullPath(backupRoot).TrimEnd(Path.DirectorySeparatorChar);
        CheckParents(source); CheckParents(backupRoot);
        if (backupRoot.Equals(source, StringComparison.OrdinalIgnoreCase) || backupRoot.StartsWith(source + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("The backup folder must be outside the source profile.");
        if (!File.Exists(Path.Combine(source, "EBWebView", "Local State"))) throw new IOException("Select the WebView2 user-data folder containing EBWebView/Local State.");
        var processes = Process.GetProcessesByName("twine_player_flutter").Concat(Process.GetProcessesByName(Path.GetFileName(source))).DistinctBy(process => process.Id).ToArray();
        try { if (processes.Length != 0) throw new IOException("Close all Flutter player windows before copying its browser profile."); }
        finally { foreach (var process in processes) process.Dispose(); }
        var files = Enumerate(source, token);
        // Chromium's LevelDB still has path-length constraints on Windows.
        // Keep copied profiles shallow even when the selected data root is long.
        var destination = Path.Combine(backupRoot, "b-" + Guid.NewGuid().ToString("N")[..12]);
        var original = Path.Combine(destination, "original");
        var working = Path.Combine(destination, "working");
        Directory.CreateDirectory(original); Directory.CreateDirectory(working);
        var manifest = new List<BrowserProfileFile>();
        foreach (var relative in files)
        {
            token.ThrowIfCancellationRequested();
            var input = Path.Combine(source, relative); var saved = Path.Combine(original, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(saved)!);
            await using (var read = new FileStream(input, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous | FileOptions.SequentialScan))
            await using (var write = new FileStream(saved, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.Asynchronous))
            { await read.CopyToAsync(write, token); await write.FlushAsync(token); }
            await using var snapshot = File.OpenRead(saved);
            manifest.Add(new(relative, snapshot.Length, Convert.ToHexString(await SHA256.HashDataAsync(snapshot, token))));
            var active = Path.Combine(working, relative); Directory.CreateDirectory(Path.GetDirectoryName(active)!); File.Copy(saved, active);
        }
        var result = new BrowserProfileCopy(source, destination, working, manifest);
        await VerifySourceAsync(result, token);
        await File.WriteAllTextAsync(Path.Combine(destination, "source-manifest.json"), JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }), token);
        return result;
    }, token);

    public static Task VerifySourceAsync(BrowserProfileCopy snapshot, CancellationToken token = default) => Task.Run(async () =>
    {
        var paths = Enumerate(snapshot.Source, token);
        if (!paths.SequenceEqual(snapshot.Files.Select(file => file.Path), StringComparer.OrdinalIgnoreCase)) throw new IOException("The Flutter profile changed during snapshot creation. Close Flutter and retry; the original profile was not modified.");
        foreach (var file in snapshot.Files)
        {
            await using var input = new FileStream(Path.Combine(snapshot.Source, file.Path), FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous | FileOptions.SequentialScan);
            if (input.Length != file.Bytes || !Convert.ToHexString(await SHA256.HashDataAsync(input, token)).Equals(file.Sha256, StringComparison.OrdinalIgnoreCase)) throw new IOException("The Flutter profile changed during copying. Retry after closing Flutter.");
        }
    }, token);
    private static string[] Enumerate(string root, CancellationToken token)
    {
        var files = new List<string>(); var directories = new Stack<string>(); directories.Push(root);
        while (directories.TryPop(out var directory))
            foreach (var path in Directory.EnumerateFileSystemEntries(directory))
            {
                token.ThrowIfCancellationRequested(); var attributes = File.GetAttributes(path);
                if ((attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Profile snapshots do not follow filesystem links.");
                if ((attributes & FileAttributes.Directory) != 0) directories.Push(path); else files.Add(Path.GetRelativePath(root, path));
            }
        return files.Order(StringComparer.OrdinalIgnoreCase).ToArray();
    }
    private static void CheckParents(string path)
    {
        for (var directory = new DirectoryInfo(path); directory is not null; directory = directory.Parent)
            if (directory.Exists && (directory.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Choose ordinary profile and backup folders without filesystem links.");
    }
}
