using System.Globalization;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.Persistence;

public sealed class NativeDatabase(string root)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    public string Root { get; } = Path.GetFullPath(root);
    private bool _initialized;
    private static string Key(string path) => StoryFileRules.Normalize(path).ToUpperInvariant();
    private async Task<T> RunAsync<T>(Func<SqliteConnection, T> action, CancellationToken token = default)
    {
        await _gate.WaitAsync(token).ConfigureAwait(false);
        try
        {
            return await Task.Run(() =>
            {
                Directory.CreateDirectory(Root);
                using var db = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.Combine(Root, "native-library.db"), Pooling = false, DefaultTimeout = 10 }.ToString());
                db.Open();
                using (var pragma = db.CreateCommand()) { pragma.CommandText = "PRAGMA foreign_keys=ON"; pragma.ExecuteNonQuery(); }
                if (!_initialized) { Initialize(db); _initialized = true; }
                token.ThrowIfCancellationRequested(); return action(db);
            }, token).ConfigureAwait(false);
        }
        finally { _gate.Release(); }
    }
    private void Initialize(SqliteConnection db)
    {
        using var version = db.CreateCommand(); version.CommandText = "PRAGMA user_version";
        if (Convert.ToInt32(version.ExecuteScalar()) > 1) throw new InvalidDataException("This native database needs a newer application; it has not been rewritten.");
        using var transaction = db.BeginTransaction();
        using var schema = db.CreateCommand(); schema.Transaction = transaction;
        schema.CommandText = """
            CREATE TABLE IF NOT EXISTS Games(Id TEXT PRIMARY KEY,FilePath TEXT NOT NULL,PathKey TEXT NOT NULL UNIQUE,Title TEXT NOT NULL,IFID TEXT,MetadataSource TEXT NOT NULL,LastPlayedUtc TEXT,DateAddedUtc TEXT NOT NULL,Missing INTEGER NOT NULL,Removed INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS AppPreferences(Key TEXT PRIMARY KEY,Value TEXT NOT NULL,SchemaVersion INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS StoryPreferences(GameId TEXT PRIMARY KEY REFERENCES Games(Id),PreferencesJson TEXT NOT NULL,SchemaVersion INTEGER NOT NULL);
            PRAGMA user_version=1;
            """;
        schema.ExecuteNonQuery();
        using var marker = db.CreateCommand(); marker.Transaction = transaction;
        marker.CommandText = "SELECT Value FROM AppPreferences WHERE Key='native.identity-registry-imported'";
        if (marker.ExecuteScalar() is null)
        {
            var registry = Path.Combine(Root, "story-identities.json");
            if (File.Exists(registry))
            {
                if (new FileInfo(registry).Length > 8 * 1024 * 1024) throw new InvalidDataException("Native identity registry is oversized; it has been preserved.");
                var entries = JsonSerializer.Deserialize<List<StoryIdentity>>(File.ReadAllText(registry)) ?? throw new InvalidDataException("Native identity registry is invalid; it has been preserved.");
                foreach (var identity in entries)
                {
                    if (identity.Id == Guid.Empty) throw new InvalidDataException("Native identity registry has an invalid ID.");
                    InsertGame(db, transaction, new(identity.Id, StoryFileRules.Normalize(identity.FilePath), GameMetadataReader.FilenameTitle(identity.FilePath), null, "phase1-identity", null, DateTimeOffset.UtcNow, !File.Exists(identity.FilePath)));
                }
            }
            PutPreference(db, transaction, "native.identity-registry-imported", "1", false);
        }
        transaction.Commit();
    }
    public Task<LibraryGame> RegisterAsync(string path, GameMetadata? metadata = null, bool played = false, CancellationToken cancellationToken = default)
    {
        var normalized = StoryFileRules.Normalize(path);
        return RunAsync(db =>
        {
            var existing = Find(db, normalized); var now = DateTimeOffset.UtcNow;
            var game = existing is null
                ? new LibraryGame(Guid.NewGuid(), normalized, metadata?.Title ?? GameMetadataReader.FilenameTitle(normalized), metadata?.Ifid, metadata?.Source ?? "filename", played ? now : null, now, !File.Exists(normalized))
                : existing with { Title = metadata?.Title ?? existing.Title, Ifid = metadata?.Ifid ?? existing.Ifid, MetadataSource = metadata?.Source ?? existing.MetadataSource, LastPlayedUtc = played ? now : existing.LastPlayedUtc, Missing = !File.Exists(normalized), Removed = false };
            using var transaction = db.BeginTransaction(); InsertGame(db, transaction, game); transaction.Commit(); return game;
        }, cancellationToken);
    }
    public Task<IReadOnlyList<LibraryGame>> ListAsync(CancellationToken token = default) => RunAsync<IReadOnlyList<LibraryGame>>(db =>
    {
        using var command = db.CreateCommand(); command.CommandText = "SELECT Id,FilePath,Title,IFID,MetadataSource,LastPlayedUtc,DateAddedUtc,Missing,Removed FROM Games WHERE Removed=0 ORDER BY LastPlayedUtc DESC,Title";
        using var reader = command.ExecuteReader(); var games = new List<LibraryGame>();
        while (reader.Read()) games.Add(ReadGame(reader) with { Missing = !File.Exists(reader.GetString(1)) });
        reader.Close();
        foreach (var game in games) { using var update = db.CreateCommand(); update.CommandText = "UPDATE Games SET Missing=$missing WHERE Id=$id"; update.Parameters.AddWithValue("$missing", game.Missing); update.Parameters.AddWithValue("$id", game.Id.ToString()); update.ExecuteNonQuery(); }
        return games;
    }, token);
    public Task SetRemovedAsync(Guid id, bool removed, CancellationToken token = default) => RunAsync(db =>
    {
        using var command = db.CreateCommand(); command.CommandText = "UPDATE Games SET Removed=$removed WHERE Id=$id";
        command.Parameters.AddWithValue("$removed", removed); command.Parameters.AddWithValue("$id", id.ToString()); return command.ExecuteNonQuery();
    }, token);
    public async Task RelinkAsync(Guid id, string replacement, CancellationToken token = default)
    {
        var path = StoryFileRules.Normalize(replacement); var metadata = await GameMetadataReader.ReadAsync(path, token);
        await RunAsync(db =>
        {
            var existing = Find(db, path);
            if (existing is not null && existing.Id != id) throw new InvalidOperationException("This path already belongs to another library story.");
            using var command = db.CreateCommand();
            command.CommandText = "UPDATE Games SET FilePath=$path,PathKey=$key,Title=$title,IFID=COALESCE($ifid,IFID),MetadataSource=$source,Missing=0 WHERE Id=$id";
            command.Parameters.AddWithValue("$path", path); command.Parameters.AddWithValue("$key", Key(path)); command.Parameters.AddWithValue("$title", metadata.Title); command.Parameters.AddWithValue("$ifid", (object?)metadata.Ifid ?? DBNull.Value); command.Parameters.AddWithValue("$source", metadata.Source); command.Parameters.AddWithValue("$id", id.ToString());
            if (command.ExecuteNonQuery() != 1) throw new InvalidOperationException("The story no longer exists in the library."); return 0;
        }, token);
    }
    public Task<string?> GetPreferenceAsync(string key, CancellationToken token = default) => RunAsync(db =>
    {
        using var command = db.CreateCommand(); command.CommandText = "SELECT Value FROM AppPreferences WHERE Key=$key"; command.Parameters.AddWithValue("$key", key); return command.ExecuteScalar() as string;
    }, token);
    public Task SetPreferenceAsync(string key, string value, CancellationToken token = default) => RunAsync(db =>
    {
        using var transaction = db.BeginTransaction(); PutPreference(db, transaction, key, value, true); transaction.Commit(); return 0;
    }, token);
    public Task<string?> GetStoryPreferencesAsync(Guid id, CancellationToken token = default) => RunAsync(db =>
    {
        using var command = db.CreateCommand(); command.CommandText = "SELECT PreferencesJson FROM StoryPreferences WHERE GameId=$id"; command.Parameters.AddWithValue("$id", id.ToString()); return command.ExecuteScalar() as string;
    }, token);
    public Task SetStoryPreferencesAsync(Guid id, string json, CancellationToken token = default) => RunAsync(db =>
    {
        using var command = db.CreateCommand(); command.CommandText = "INSERT INTO StoryPreferences VALUES($id,$json,2) ON CONFLICT(GameId) DO UPDATE SET PreferencesJson=excluded.PreferencesJson,SchemaVersion=2";
        command.Parameters.AddWithValue("$id", id.ToString()); command.Parameters.AddWithValue("$json", json); return command.ExecuteNonQuery();
    }, token);
    internal Task<T> TransactionAsync<T>(Func<SqliteConnection, SqliteTransaction, T> action, CancellationToken token) => RunAsync(db =>
    {
        using var transaction = db.BeginTransaction(); var result = action(db, transaction); transaction.Commit(); return result;
    }, token);
    internal static LibraryGame? Find(SqliteConnection db, string path, SqliteTransaction? transaction = null)
    {
        using var command = db.CreateCommand(); command.Transaction = transaction; command.CommandText = "SELECT Id,FilePath,Title,IFID,MetadataSource,LastPlayedUtc,DateAddedUtc,Missing,Removed FROM Games WHERE PathKey=$key"; command.Parameters.AddWithValue("$key", Key(path));
        using var reader = command.ExecuteReader(); return reader.Read() ? ReadGame(reader) : null;
    }
    private static LibraryGame ReadGame(SqliteDataReader r) => new(Guid.Parse(r.GetString(0)), r.GetString(1), r.GetString(2), r.IsDBNull(3) ? null : r.GetString(3), r.GetString(4), r.IsDBNull(5) ? null : DateTimeOffset.Parse(r.GetString(5), CultureInfo.InvariantCulture), DateTimeOffset.Parse(r.GetString(6), CultureInfo.InvariantCulture), r.GetBoolean(7), r.GetBoolean(8));
    internal static void InsertGame(SqliteConnection db, SqliteTransaction transaction, LibraryGame game)
    {
        using var command = db.CreateCommand(); command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO Games(Id,FilePath,PathKey,Title,IFID,MetadataSource,LastPlayedUtc,DateAddedUtc,Missing,Removed) VALUES($id,$path,$key,$title,$ifid,$source,$played,$added,$missing,$removed)
            ON CONFLICT(Id) DO UPDATE SET FilePath=excluded.FilePath,PathKey=excluded.PathKey,Title=excluded.Title,IFID=excluded.IFID,MetadataSource=excluded.MetadataSource,LastPlayedUtc=excluded.LastPlayedUtc,Missing=excluded.Missing,Removed=excluded.Removed;
            """;
        command.Parameters.AddWithValue("$id", game.Id.ToString()); command.Parameters.AddWithValue("$path", game.FilePath); command.Parameters.AddWithValue("$key", Key(game.FilePath)); command.Parameters.AddWithValue("$title", game.Title); command.Parameters.AddWithValue("$ifid", (object?)game.Ifid ?? DBNull.Value); command.Parameters.AddWithValue("$source", game.MetadataSource); command.Parameters.AddWithValue("$played", (object?)game.LastPlayedUtc?.ToString("O") ?? DBNull.Value); command.Parameters.AddWithValue("$added", game.DateAddedUtc.ToString("O")); command.Parameters.AddWithValue("$missing", game.Missing); command.Parameters.AddWithValue("$removed", game.Removed); command.ExecuteNonQuery();
    }
    internal static void PutPreference(SqliteConnection db, SqliteTransaction transaction, string key, string value, bool overwrite)
    {
        using var command = db.CreateCommand(); command.Transaction = transaction;
        command.CommandText = overwrite ? "INSERT INTO AppPreferences VALUES($key,$value,1) ON CONFLICT(Key) DO UPDATE SET Value=excluded.Value" : "INSERT OR IGNORE INTO AppPreferences VALUES($key,$value,1)";
        command.Parameters.AddWithValue("$key", key); command.Parameters.AddWithValue("$value", value); command.ExecuteNonQuery();
    }
}
