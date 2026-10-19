using System.Security.Cryptography;
using System.Text.Json;
using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.Persistence;

public sealed record FlutterImportPreview(string Source, IReadOnlyDictionary<string, byte[]> Files, IReadOnlyList<LibraryGame> Games, IReadOnlyList<string> Invalid, int Duplicates);
public sealed record FlutterImportReport(int Imported, int Skipped, IReadOnlyList<string> Invalid, string SnapshotDirectory, bool BrowserDataImported = false);

public sealed class FlutterImporter(NativeDatabase database)
{
    private static readonly string[] Names = ["library-history.json", "console-commands.json", "preferences.json", "command-bar-preferences.json", "story-assistance.json"];
    public static string DefaultSource => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "TwinePlayer contributors", "Twine Player", "TwinePlayerFlutter");

    public Task<FlutterImportPreview> PreviewAsync(string source, CancellationToken token = default) => Task.Run(() =>
    {
        source = Path.GetFullPath(source);
        var files = new Dictionary<string, byte[]>(); var invalid = new List<string>();
        var games = new Dictionary<string, LibraryGame>(StringComparer.OrdinalIgnoreCase); var duplicates = 0;
        foreach (var name in Names)
        {
            token.ThrowIfCancellationRequested();
            var path = Path.Combine(source, name); if (!File.Exists(path)) continue;
            if (new FileInfo(path).Length > 16 * 1024 * 1024) { invalid.Add($"{name}: exceeds the 16 MiB import limit; skipped."); continue; }
            var bytes = File.ReadAllBytes(path); files.Add(name, bytes);
            try
            {
                using var json = JsonDocument.Parse(bytes);
                if (name != "library-history.json")
                {
                    if (json.RootElement.ValueKind != JsonValueKind.Object) invalid.Add($"{name}: expected a JSON object.");
                    continue;
                }
                if (json.RootElement.ValueKind != JsonValueKind.Array) { invalid.Add($"{name}: expected a JSON array."); continue; }
                var index = 0;
                foreach (var item in json.RootElement.EnumerateArray())
                {
                    index++;
                    try
                    {
                        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("path", out var p) || p.ValueKind != JsonValueKind.String) throw new InvalidDataException("Missing path.");
                        var file = StoryFileRules.Normalize(p.GetString()!.Trim());
                        var title = item.TryGetProperty("title", out var t) && t.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(t.GetString()) ? t.GetString()!.Trim() : GameMetadataReader.FilenameTitle(file);
                        var time = DateTimeOffset.UtcNow;
                        if (!item.TryGetProperty("lastPlayed", out var date) || date.ValueKind != JsonValueKind.String || !DateTimeOffset.TryParse(date.GetString(), System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind, out time))
                        { time = DateTimeOffset.UtcNow; invalid.Add($"library-history.json entry {index}: invalid date; import-time fallback will be used."); }
                        var game = new LibraryGame(Guid.NewGuid(), file, title, null, "flutter-history", time.ToUniversalTime(), time.ToUniversalTime(), !File.Exists(file));
                        if (games.TryGetValue(file, out var previous)) { duplicates++; if (previous.LastPlayedUtc >= game.LastPlayedUtc) continue; }
                        games[file] = game;
                    }
                    catch (Exception error) when (error is ArgumentException or InvalidDataException or NotSupportedException) { invalid.Add($"library-history.json entry {index}: {error.Message}"); }
                }
            }
            catch (JsonException) { invalid.Add($"{name}: malformed JSON; original bytes will be snapshotted and skipped."); }
        }
        return new FlutterImportPreview(source, files, games.Values.ToArray(), invalid, duplicates);
    }, token);

    public async Task<FlutterImportReport> ImportAsync(FlutterImportPreview preview, CancellationToken token = default)
    {
        // Recheck source bytes immediately before conversion. Never write the source.
        foreach (var name in Names)
        {
            var path = Path.Combine(preview.Source, name);
            if (!preview.Files.ContainsKey(name) && File.Exists(path) && new FileInfo(path).Length <= 16 * 1024 * 1024)
                throw new IOException("A Flutter data file appeared since the preview. Preview again before importing.");
        }
        foreach (var entry in preview.Files)
        {
            var current = await File.ReadAllBytesAsync(Path.Combine(preview.Source, entry.Key), token);
            if (!SHA256.HashData(current).SequenceEqual(SHA256.HashData(entry.Value))) throw new IOException("Flutter data changed since the preview. Preview again before importing.");
        }
        var snapshot = Path.Combine(database.Root, "migrations", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(snapshot);
        foreach (var entry in preview.Files) await File.WriteAllBytesAsync(Path.Combine(snapshot, entry.Key), entry.Value, token);
        await File.WriteAllTextAsync(Path.Combine(snapshot, "source-hashes.json"), JsonSerializer.Serialize(preview.Files.Select(e => new { file = e.Key, sha256 = Convert.ToHexString(SHA256.HashData(e.Value)) })), token);
        var report = await database.TransactionAsync((db, transaction) =>
        {
            var imported = 0; var skipped = preview.Duplicates;
            foreach (var game in preview.Games)
            {
                if (NativeDatabase.Find(db, game.FilePath, transaction) is not null) { skipped++; continue; }
                NativeDatabase.InsertGame(db, transaction, game); imported++;
            }
            foreach (var entry in preview.Files.Where(e => e.Key != "library-history.json"))
            {
                try
                {
                    using var json = JsonDocument.Parse(entry.Value);
                    if (json.RootElement.ValueKind != JsonValueKind.Object) continue;
                    NativeDatabase.PutPreference(db, transaction, "legacy." + entry.Key, json.RootElement.GetRawText(), false);
                    if (entry.Key == "preferences.json")
                    {
                        var value = json.RootElement.TryGetProperty("interactionProfile", out var profile) && profile.ValueKind == JsonValueKind.String ? profile.GetString() : "auto";
                        NativeDatabase.PutPreference(db, transaction, "interactionProfile", value is "auto" or "comfortable" or "compact" ? value : "auto", false);
                    }
                    if (entry.Key == "story-assistance.json" && json.RootElement.TryGetProperty("games", out var preferences) && preferences.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var story in preferences.EnumerateObject())
                        {
                            if (story.Value.ValueKind != JsonValueKind.Object || !Path.IsPathFullyQualified(story.Name)) continue;
                            LibraryGame? game;
                            try { game = NativeDatabase.Find(db, story.Name, transaction); } catch (ArgumentException) { continue; }
                            if (game is null) continue; // Raw unmapped entries remain in legacy.story-assistance.json.
                            using var command = db.CreateCommand(); command.Transaction = transaction;
                            command.CommandText = "INSERT OR IGNORE INTO StoryPreferences VALUES($id,$json,2)";
                            command.Parameters.AddWithValue("$id", game.Id.ToString()); command.Parameters.AddWithValue("$json", story.Value.GetRawText()); command.ExecuteNonQuery();
                        }
                    }
                }
                catch (JsonException) { /* Invalid original bytes are preserved in the report snapshot. */ }
            }
            return new FlutterImportReport(imported, skipped, preview.Invalid, snapshot);
        }, token);
        await File.WriteAllTextAsync(Path.Combine(snapshot, "report.json"), JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true }), token);
        return report;
    }
}
