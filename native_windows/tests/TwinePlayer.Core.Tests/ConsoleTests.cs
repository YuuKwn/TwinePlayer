using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
using Xunit;
namespace TwinePlayer.Native.Tests;
public sealed class ConsoleTests
{
    [Fact]
    public void StableScopesHistoryAndCompletionRetainDollarIdentifiers()
    {
        var story = new StoryIdentity(Guid.NewGuid(), Path.Combine(Path.GetTempPath(), "one.html"));
        Assert.Equal("IFID", ConsoleSession.Scope(story, " IFID "));
        Assert.Equal(ConsoleSession.Scope(story, null), ConsoleSession.Scope(story with { FilePath = Path.Combine(Path.GetTempPath(), "relinked.html") }, null));
        Assert.Equal("x = State.variables.$1", ConsoleSession.ApplyCompletion("x = State.variables.$", "State.variables.$1"));
        Assert.False(ConsoleSession.LooksCompletable("1 + 2")); Assert.True(ConsoleSession.LooksCompletable("State.variables."));
        var session = new ConsoleSession(); for (var i = 0; i < 400; i++) session.Append(i.ToString(), "input", i.ToString());
        Assert.Equal(300, session.Entries.Count); Assert.Equal(100, session.History.Count);
    }
    [Fact]
    public async Task SavedCommandsPersistByScopeAndRetainUnknownLegacyKeys()
    {
        var root = Path.Combine(Path.GetTempPath(), "TwinePlayer-console-" + Guid.NewGuid().ToString("N"));
        try
        {
            var database = new NativeDatabase(root);
            await database.SetPreferenceAsync("legacy.console-commands.json", "{\"unknown-old-key\":[\"legacy\"],\"other-shape\":{\"retain\":true}}");
            var store = new ConsoleCommandStore(database);
            await store.SaveAsync("IFID", " 1 + 1 "); await store.SaveAsync("IFID", "1 + 1");
            Assert.Single(await new ConsoleCommandStore(database).GetAsync("IFID")); Assert.Empty(await store.GetAsync("other-story"));
            await store.SaveAsync("IFID", "1 + 1", true); Assert.Empty(await store.GetAsync("IFID"));
            var raw = await database.GetPreferenceAsync("console-commands"); Assert.Contains("unknown-old-key", raw); Assert.Contains("other-shape", raw);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
