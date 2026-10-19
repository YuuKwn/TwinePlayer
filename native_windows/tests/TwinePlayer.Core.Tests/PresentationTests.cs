using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
using Xunit;
namespace TwinePlayer.Native.Tests;
public sealed class PresentationTests
{
    [Fact]
    public void PreferencesPreserveDefaultsBoundsAndIndependentResets()
    {
        var defaults = new StoryAssistancePreferences(); Assert.False(defaults.ReadabilityEnabled); Assert.False(defaults.EnhancedChoices); Assert.Equal(72, defaults.ReadableLineLength);
        var loaded = StoryAssistancePreferences.Parse("{\"zoomFactor\":2,\"lineHeight\":0,\"readableLineLength\":72,\"textScale\":1.17,\"enhancedChoices\":true}");
        Assert.Equal(1.75, loaded.ZoomFactor); Assert.Equal(1.1, loaded.LineHeight); Assert.Equal(1.17, loaded.TextScale); Assert.Equal(72, loaded.ReadableLineLength);
        Assert.Equal(loaded.ZoomFactor, loaded.ResetReadability().ZoomFactor); Assert.True(loaded.ResetReadability().EnhancedChoices);
        Assert.Equal(loaded, StoryAssistancePreferences.Parse(loaded.ToJson()));
    }
    [Fact]
    public async Task PreferencesPersistByNativeIdAcrossRelinkAndRetainUnknownFields()
    {
        var root = Path.Combine(Path.GetTempPath(), "native-presentation-" + Guid.NewGuid().ToString("N"));
        try
        {
            var database = new NativeDatabase(root); var game = await database.RegisterAsync(Path.Combine(root, "game.html"));
            await database.SetStoryPreferencesAsync(game.Id, "{\"futureField\":{\"keep\":true},\"zoomFactor\":1.2}");
            var store = new StoryAssistanceStore(database); var loaded = await store.GetAsync(game.Identity);
            await store.SaveAsync(game.Identity, loaded with { EnhancedChoices = true });
            Assert.Contains("futureField", await database.GetStoryPreferencesAsync(game.Id));
            Assert.True((await new StoryAssistanceStore(database).GetAsync(game.Identity with { FilePath = Path.Combine(root, "moved.html") })).EnhancedChoices);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
    [Theory]
    [InlineData("javascript:alert(1)")][InlineData("file:///C:/Windows/win.ini")][InlineData("https://other.twineplayer.local/image.png")][InlineData("data:text/html,<script></script>")]
    public void ImageSourcesRejectUnsafeSchemesAndOtherFolders(string source)
    {
        var story = new StoryIdentity(Guid.NewGuid(), Path.Combine(Path.GetTempPath(), "story-folder", "game.html"));
        Assert.Throws<ArgumentException>(() => StoryImageRules.Resolve(source, story));
    }
    [Fact]
    public void ImageVirtualPathsRejectEncodedTraversalAndRetainValidResources()
    {
        var story = new StoryIdentity(Guid.NewGuid(), Path.Combine(Path.GetTempPath(), "story-folder", "game.html"));
        Assert.Throws<ArgumentException>(() => StoryImageRules.Resolve($"https://{story.HostName}/%2e%2e/secret.png", story));
        Assert.Throws<ArgumentException>(() => StoryImageRules.Resolve($"https://{story.HostName}/images/%252e%252e/secret.png", story));
        Assert.Equal("browser", StoryImageRules.Resolve($"https://{story.HostName}/images/cover.png", story).Kind);
        Assert.Equal("browser", StoryImageRules.Resolve(new Uri(Path.Combine(story.ResourceDirectory, "cover.png")).AbsoluteUri, story).Kind);
        Assert.Equal("remote", StoryImageRules.Resolve("https://example.com/cover.png", story).Kind);
    }
}
