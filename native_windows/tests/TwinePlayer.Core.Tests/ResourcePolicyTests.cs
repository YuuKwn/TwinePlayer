using TwinePlayer.Native.Core;
using Xunit;
namespace TwinePlayer.Native.Tests;
public sealed class ResourcePolicyTests
{
    [Theory]
    [InlineData("/%2e%2e/secret.txt")][InlineData("/folder/%252e%252e/secret.txt")][InlineData("/folder/file.txt:stream")][InlineData("/folder/%00file.txt")]
    public void ResourceScopeRejectsRawAndEncodedTraversalStreamsAndControls(string path)
    {
        var story = new StoryIdentity(Guid.NewGuid(), Path.Combine(Path.GetTempPath(), "scope", "game.html"));
        Assert.Throws<ArgumentException>(() => StoryResourceRules.Validate("https://" + story.HostName + path, story));
    }
    [Fact]
    public void FolderValidationChecksRealNestedFilesAndCancellation()
    {
        var root = Path.Combine(Path.GetTempPath(), "native-scope-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(Path.Combine(root, "nested")); File.WriteAllText(Path.Combine(root, "nested", "asset.txt"), "allowed");
            StoryResourceRules.ValidateFolder(root);
            using var canceled = new CancellationTokenSource(); canceled.Cancel(); Assert.Throws<OperationCanceledException>(() => StoryResourceRules.ValidateFolder(root, canceled.Token));
            var story = new StoryIdentity(Guid.NewGuid(), Path.Combine(root, "game.html"));
            StoryResourceRules.Validate("https://" + story.HostName + "/nested/asset.txt", story);
            Assert.Throws<ArgumentException>(() => StoryResourceRules.Validate("https://another.twineplayer.local/asset.txt", story));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
