using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
using Xunit;

namespace TwinePlayer.Native.Tests;

public sealed class StoryIdentityTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "TwinePlayer-native-tests-" + Guid.NewGuid().ToString("N"));
    [Fact]
    public async Task StoryOriginPersistsAcrossStoreRecreationAndIsolatesDifferentPaths()
    {
        var store = new StoryIdentityStore(_root);
        var first = await store.GetOrCreateAsync(Path.Combine(_root, "Game one.html"));
        var reopened = await new StoryIdentityStore(_root).GetOrCreateAsync(first.FilePath.ToUpperInvariant());
        var second = await store.GetOrCreateAsync(Path.Combine(_root, "Another.htm"));
        Assert.Equal(first.Id, reopened.Id);
        Assert.Equal(first.HostName, reopened.HostName);
        Assert.NotEqual(first.HostName, second.HostName);
        Assert.Contains("Game%20one.html", first.Uri.AbsoluteUri);
    }
    [Fact]
    public async Task CorruptRegistryIsPreservedInsteadOfSilentlyChangingOrigins()
    {
        Directory.CreateDirectory(_root);
        var path = Path.Combine(_root, "story-identities.json");
        await File.WriteAllTextAsync(path, "broken");
        await Assert.ThrowsAsync<System.Text.Json.JsonException>(() => new StoryIdentityStore(_root).GetOrCreateAsync(Path.Combine(_root, "Game.html")));
        Assert.Equal("broken", await File.ReadAllTextAsync(path));
    }
    [Fact]
    public async Task ConcurrentRegistrationsKeepAllStoriesAndStableIdentity()
    {
        var store = new StoryIdentityStore(_root);
        var path = Path.Combine(_root, "Game.html");
        var results = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => store.GetOrCreateAsync(path)));
        Assert.Single(results.Select(r => r.Id).Distinct());
    }
    [Theory]
    [InlineData("https://example.com/game.html")]
    [InlineData("file:///C:/game.html")]
    [InlineData("javascript:alert(1)")]
    [InlineData("https://story-123.twineplayer.local:444/game.html")]
    public void NavigationRejectsForeignOrigins(string uri)
    {
        var story = new StoryIdentity(Guid.NewGuid(), Path.Combine(_root, "Game.html"));
        Assert.False(StoryNavigationPolicy.IsAllowed(story, uri));
        Assert.True(StoryNavigationPolicy.IsAllowed(story, story.Uri.AbsoluteUri));
    }
    [Fact]
    public void StorySelectionRejectsRelativeAndNonHtmlPaths()
    {
        Assert.Throws<ArgumentException>(() => StoryFileRules.Normalize("game.html"));
        Assert.Throws<ArgumentException>(() => StoryFileRules.Normalize(Path.Combine(_root, "program.exe")));
    }
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); }
}
