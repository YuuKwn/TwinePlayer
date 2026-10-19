using System.Text.Json;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
using Xunit;
namespace TwinePlayer.Native.Tests;

public sealed class LibraryTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "TwinePlayer-library-" + Guid.NewGuid().ToString("N"));
    [Fact]
    public async Task LegacyNativeRegistryAndRelinkPreserveIdentityAndUndo()
    {
        Directory.CreateDirectory(_root); var old = Path.Combine(_root, "old.html"); var replacement = Path.Combine(_root, "replacement.htm");
        await File.WriteAllTextAsync(replacement, "<tw-storydata name='Replacement' ifid='SAME-STORY'></tw-storydata>");
        var identity = new StoryIdentity(Guid.NewGuid(), old);
        var registry = JsonSerializer.Serialize(new[] { identity });
        await File.WriteAllTextAsync(Path.Combine(_root, "story-identities.json"), registry);
        var database = new NativeDatabase(_root);
        var first = Assert.Single(await database.ListAsync()); Assert.Equal(identity.Id, first.Id); Assert.True(first.Missing);
        await database.RelinkAsync(first.Id, replacement);
        var relinked = Assert.Single(await database.ListAsync()); Assert.Equal(first.Id, relinked.Id); Assert.Equal(identity.HostName, relinked.Identity.HostName); Assert.False(relinked.Missing);
        await database.SetRemovedAsync(first.Id, true); Assert.Empty(await database.ListAsync());
        await database.SetRemovedAsync(first.Id, false); Assert.Equal(first.Id, Assert.Single(await database.ListAsync()).Id);
        Assert.Equal(registry, await File.ReadAllTextAsync(Path.Combine(_root, "story-identities.json")));
    }
    [Fact]
    public async Task ImportedStoryPreferencesRemainAssociatedAfterRelink()
    {
        var source = Path.Combine(_root, "flutter"); Directory.CreateDirectory(source);
        var oldPath = Path.Combine(_root, "old.html"); var newPath = Path.Combine(_root, "new.html");
        await File.WriteAllTextAsync(newPath, "<title>Relinked</title>");
        await File.WriteAllTextAsync(Path.Combine(source, "library-history.json"), JsonSerializer.Serialize(new[] { new { path = oldPath, title = "Old", lastPlayed = "2026-01-01T00:00:00Z" } }));
        await File.WriteAllTextAsync(Path.Combine(source, "story-assistance.json"), JsonSerializer.Serialize(new { version = 2, games = new Dictionary<string, object> { [oldPath.ToLowerInvariant()] = new { zoomFactor = 1.3, enhancedChoices = true } } }));
        var database = new NativeDatabase(Path.Combine(_root, "native")); var importer = new FlutterImporter(database);
        await importer.ImportAsync(await importer.PreviewAsync(source));
        var game = Assert.Single(await database.ListAsync()); await database.RelinkAsync(game.Id, newPath);
        using var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={Path.Combine(database.Root, "native-library.db")};Pooling=False"); connection.Open();
        using var command = connection.CreateCommand(); command.CommandText = "SELECT PreferencesJson FROM StoryPreferences WHERE GameId=$id"; command.Parameters.AddWithValue("$id", game.Id.ToString());
        Assert.Contains("1.3", command.ExecuteScalar() as string); Assert.Equal(game.Id, Assert.Single(await database.ListAsync()).Id);
    }
    [Fact]
    public async Task FlutterImportSnapshotsOriginalBytesAndIsIdempotentWithoutOverwritingNativeData()
    {
        var source = Path.Combine(_root, "flutter"); Directory.CreateDirectory(source);
        var game = Path.Combine(_root, "Example.html");
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new object[] { new { path = game, title = "Imported title", lastPlayed = "2026-01-02T03:04:05Z" }, new { path = game.ToUpperInvariant(), title = "Older", lastPlayed = "2025-01-01T00:00:00Z" }, new { path = "", title = "Invalid" } });
        await File.WriteAllBytesAsync(Path.Combine(source, "library-history.json"), bytes);
        await File.WriteAllTextAsync(Path.Combine(source, "console-commands.json"), "{\"fallback_old-unknown-key\":[\"1+1\"]}");
        var database = new NativeDatabase(Path.Combine(_root, "native")); var importer = new FlutterImporter(database);
        var preview = await importer.PreviewAsync(source); Assert.Single(preview.Games); Assert.Single(preview.Invalid); Assert.Equal(1, preview.Duplicates);
        var report = await importer.ImportAsync(preview); Assert.Equal(1, report.Imported);
        Assert.Equal(bytes, await File.ReadAllBytesAsync(Path.Combine(report.SnapshotDirectory, "library-history.json")));
        Assert.Equal(bytes, await File.ReadAllBytesAsync(Path.Combine(source, "library-history.json")));
        var imported = Assert.Single(await database.ListAsync()); Assert.Equal(DateTimeOffset.Parse("2026-01-02T03:04:05Z"), imported.LastPlayedUtc);
        await database.RegisterAsync(game, new GameMetadata("Native edited title", "test", null));
        var repeated = await importer.ImportAsync(preview); Assert.Equal(0, repeated.Imported); Assert.Equal("Native edited title", Assert.Single(await database.ListAsync()).Title);
        Assert.Contains("fallback_old-unknown-key", await database.GetPreferenceAsync("legacy.console-commands.json"));
    }
    [Fact]
    public async Task ImportRejectsChangedPreviewAndFreshInstallIsEmpty()
    {
        var database = new NativeDatabase(Path.Combine(_root, "native")); var importer = new FlutterImporter(database);
        var source = Path.Combine(_root, "flutter"); Assert.Empty((await importer.PreviewAsync(source)).Files);
        Directory.CreateDirectory(source); await File.WriteAllTextAsync(Path.Combine(source, "library-history.json"), "[]");
        var preview = await importer.PreviewAsync(source); await File.WriteAllTextAsync(Path.Combine(source, "library-history.json"), "[null]");
        await Assert.ThrowsAsync<IOException>(() => importer.ImportAsync(preview)); Assert.Empty(await database.ListAsync());
        preview = await importer.PreviewAsync(source);
        await File.WriteAllTextAsync(Path.Combine(source, "preferences.json"), "{\"interactionProfile\":\"compact\"}");
        await Assert.ThrowsAsync<IOException>(() => importer.ImportAsync(preview));
    }
    [Fact]
    public async Task NewerSchemaIsRejectedWithoutRewritingTheDatabase()
    {
        Directory.CreateDirectory(_root); var path = Path.Combine(_root, "native-library.db");
        using (var connection = new Microsoft.Data.Sqlite.SqliteConnection($"Data Source={path};Pooling=False"))
        {
            connection.Open(); using var command = connection.CreateCommand();
            command.CommandText = "PRAGMA user_version=999; CREATE TABLE FutureSentinel(Value TEXT); INSERT INTO FutureSentinel VALUES('preserve-future-data');";
            command.ExecuteNonQuery();
        }
        var original = await File.ReadAllBytesAsync(path);
        var error = await Assert.ThrowsAsync<InvalidDataException>(() => new NativeDatabase(_root).ListAsync());
        Assert.Contains("newer application", error.Message);
        Assert.Equal(original, await File.ReadAllBytesAsync(path));
    }
    [Fact]
    public async Task CorruptDatabaseIsReportedAndOriginalBytesRemain()
    {
        Directory.CreateDirectory(_root); var path = Path.Combine(_root, "native-library.db");
        var original = "not-a-sqlite-database-preserve-this"u8.ToArray();
        await File.WriteAllBytesAsync(path, original);
        await Assert.ThrowsAsync<Microsoft.Data.Sqlite.SqliteException>(() => new NativeDatabase(_root).ListAsync());
        Assert.Equal(original, await File.ReadAllBytesAsync(path));
    }
    [Theory]
    [InlineData("<tw-storydata name='A &amp; B' ifid='ID'></tw-storydata><title>Other</title>", "A & B", "tw-storydata")]
    [InlineData("<script>Config.saves.id='Sugar';</script><title>Other</title>", "Sugar", "sugarcube")]
    [InlineData("<title>HTML &quot;Title&quot;</title>", "HTML \"Title\"", "title")]
    [InlineData("no metadata", "My Story", "filename")]
    public void MetadataPreservesFlutterPriorityAndEntityDecoding(string html, string title, string source)
    {
        var metadata = GameMetadataReader.Parse(html, Path.Combine(_root, "my_story.html")); Assert.Equal(title, metadata.Title); Assert.Equal(source, metadata.Source);
    }
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); }
}
