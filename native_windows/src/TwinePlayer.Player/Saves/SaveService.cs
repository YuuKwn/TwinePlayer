using TwinePlayer.Native.Core;

namespace TwinePlayer.Native.Player;

public sealed class SaveService
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    public async Task WaitForIdleAsync() { await _gate.WaitAsync().ConfigureAwait(false); _gate.Release(); }
    public Task<IReadOnlyList<SaveEntry>> ListAsync(string game, CancellationToken token = default) => Task.Run<IReadOnlyList<SaveEntry>>(() =>
    {
        var directory = SaveRules.DirectoryFor(game);
        if (!Directory.Exists(directory)) return [];
        RejectReparsePoint(directory);
        return Directory.EnumerateFiles(directory).Where(p => p.EndsWith(".save", StringComparison.OrdinalIgnoreCase))
            .Select(p => new FileInfo(p)).Where(f => (f.Attributes & FileAttributes.ReparsePoint) == 0)
            .Select(f => new SaveEntry(f.Name, f.Length, f.LastWriteTimeUtc)).OrderByDescending(f => f.ModifiedUtc).ToArray();
    }, token);

    public async Task<byte[]> ReadAsync(string game, string name, CancellationToken token = default)
    {
        var path = SaveRules.PathFor(game, name);
        await _gate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            RejectReparsePoint(Path.GetDirectoryName(path)!);
            RejectReparsePoint(path);
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
            if (stream.Length <= 0 || stream.Length > SaveRules.MaxBytes) throw new InvalidDataException("Save data is empty or exceeds 50 MiB.");
            var bytes = new byte[(int)stream.Length];
            await stream.ReadExactlyAsync(bytes, token).ConfigureAwait(false);
            if (stream.Position != stream.Length) throw new IOException("Save changed while being read; retry loading it.");
            SaveRules.ValidatePayload(bytes);
            return bytes;
        }
        finally { _gate.Release(); }
    }

    public async Task<SaveEntry> WriteAsync(string game, string name, ReadOnlyMemory<byte> bytes, bool overwrite, CancellationToken token = default)
    {
        var destination = SaveRules.PathFor(game, name);
        await _gate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            return await Task.Run(async () =>
            {
                SaveRules.ValidatePayload(bytes);
                var directory = Path.GetDirectoryName(destination)!;
                Directory.CreateDirectory(directory);
                RejectReparsePoint(directory);
                RejectReparsePoint(destination);
                if (!overwrite && File.Exists(destination)) throw new IOException("A save with this name already exists. Confirm overwrite first.");
                Cleanup(directory);
                var temporary = Path.Combine(directory, $".twineplayer-{Guid.NewGuid():N}.tmp");
                try
                {
                    await using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, FileOptions.Asynchronous | FileOptions.WriteThrough))
                    {
                        await stream.WriteAsync(bytes, token).ConfigureAwait(false);
                        await stream.FlushAsync(token).ConfigureAwait(false);
                        stream.Flush(true);
                    }
                    token.ThrowIfCancellationRequested();
                    if (File.Exists(destination))
                    {
                        if (!overwrite) throw new IOException("A save with this name was created during capture; confirm overwrite first.");
                        File.Replace(temporary, destination, null);
                    }
                    else File.Move(temporary, destination);
                    var info = new FileInfo(destination);
                    return new SaveEntry(info.Name, info.Length, info.LastWriteTimeUtc);
                }
                finally { if (File.Exists(temporary)) File.Delete(temporary); }
            }, token).ConfigureAwait(false);
        }
        finally { _gate.Release(); }
    }

    public async Task DeleteAsync(string game, string name, CancellationToken token = default)
    {
        var path = SaveRules.PathFor(game, name);
        await _gate.WaitAsync(token).ConfigureAwait(false);
        try { await Task.Run(() => { token.ThrowIfCancellationRequested(); RejectReparsePoint(Path.GetDirectoryName(path)!); RejectReparsePoint(path); if (!File.Exists(path)) throw new FileNotFoundException("The save no longer exists.", path); File.Delete(path); }, token).ConfigureAwait(false); }
        finally { _gate.Release(); }
    }

    private static void Cleanup(string directory)
    {
        foreach (var path in Directory.EnumerateFiles(directory, ".twineplayer-*.tmp"))
        {
            if (File.GetLastWriteTimeUtc(path) < DateTime.UtcNow.AddHours(-24)) { RejectReparsePoint(path); File.Delete(path); }
        }
    }
    private static void RejectReparsePoint(string path)
    {
        if ((File.Exists(path) || Directory.Exists(path)) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new IOException("Save operations do not follow filesystem links.");
    }
}
