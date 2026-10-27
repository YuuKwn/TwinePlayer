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
    [Fact]
    public async Task PinsPersistByGameRenameInPlaceAndUnpinWithoutDeletingSavedCommand()
    {
        var root = Path.Combine(Path.GetTempPath(), "TwinePlayer-pins-" + Guid.NewGuid().ToString("N"));
        try
        {
            var database = new NativeDatabase(root); var store = new ConsoleCommandStore(database);
            var first = Guid.NewGuid(); var second = Guid.NewGuid();
            await store.SaveAsync("shared-IFID", "State.variables.gold += 10");
            await store.PinAsync(first, " State.variables.gold += 10 ", " Gold ");
            await store.PinAsync(first, "1 + 1", "Math");
            Assert.Empty(await store.GetPinnedAsync(second));
            await store.PinAsync(second, "State.variables.gold += 10", "Other game");
            await store.PinAsync(first, "State.variables.gold += 10", "Add gold");
            var reopened = new ConsoleCommandStore(new NativeDatabase(root));
            Assert.Equal(new[] { "Add gold", "Math" }, (await reopened.GetPinnedAsync(first)).Select(pin => pin.Label));
            Assert.Equal("State.variables.gold += 10", (await reopened.GetPinnedAsync(first))[0].Command);
            Assert.Equal("Other game", Assert.Single(await reopened.GetPinnedAsync(second)).Label);
            await reopened.UnpinAsync(first, "State.variables.gold += 10");
            Assert.Equal("Math", Assert.Single(await reopened.GetPinnedAsync(first)).Label);
            Assert.Single(await reopened.GetAsync("shared-IFID"));
            await reopened.PinAsync(first, "State.variables.gold += 10", "Gold again");
            await reopened.SaveAsync("shared-IFID", "State.variables.gold += 10", delete: true, gameId: first);
            Assert.Equal("Math", Assert.Single(await reopened.GetPinnedAsync(first)).Label);
            Assert.Empty(await reopened.GetAsync("shared-IFID"));
            Assert.Single(await reopened.GetPinnedAsync(second));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
    [Fact]
    public async Task InvalidPinsAreRejectedAndCorruptDataIsPreserved()
    {
        var root = Path.Combine(Path.GetTempPath(), "TwinePlayer-pins-invalid-" + Guid.NewGuid().ToString("N"));
        try
        {
            var database = new NativeDatabase(root); var store = new ConsoleCommandStore(database); var game = Guid.NewGuid();
            await Assert.ThrowsAsync<ArgumentException>(() => store.PinAsync(game, "1", " "));
            await Assert.ThrowsAsync<ArgumentException>(() => store.PinAsync(game, "1", new string('x', 41)));
            await Assert.ThrowsAsync<ArgumentException>(() => store.PinAsync(game, new string('x', 4097), "Long"));
            await Assert.ThrowsAsync<ArgumentException>(() => store.PinAsync(Guid.Empty, "1", "None"));
            var corrupt = "{\"" + game.ToString("N") + "\":[{\"Command\":\"1\",\"Label\":\"\"}]}";
            await database.SetPreferenceAsync("console-command-pins", corrupt);
            await store.SaveAsync("IFID", "1");
            await Assert.ThrowsAsync<InvalidDataException>(() => store.PinAsync(game, "2", "Two"));
            await Assert.ThrowsAsync<InvalidDataException>(() => store.SaveAsync("IFID", "1", delete: true, gameId: game));
            Assert.Equal(corrupt, await database.GetPreferenceAsync("console-command-pins"));
            Assert.Single(await store.GetAsync("IFID"));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
