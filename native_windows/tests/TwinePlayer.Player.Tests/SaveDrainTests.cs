using TwinePlayer.Native.Core;
using TwinePlayer.Native.Player;
using Xunit;
namespace TwinePlayer.Native.Tests;
public sealed class SaveDrainTests
{
    [Fact]
    public async Task ShutdownDrainWaitsForACompleteDurableWrite()
    {
        var root = Path.Combine(Path.GetTempPath(), "native-drain-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        try
        {
            var story = Path.Combine(root, "game.html"); var saves = new SaveService(); var bytes = Enumerable.Repeat((byte)'a', 256 * 1024).ToArray();
            var writing = saves.WriteAsync(story, "drain.save", bytes, false);
            await saves.WaitForIdleAsync();
            Assert.Equal(bytes, await File.ReadAllBytesAsync(SaveRules.PathFor(story, "drain.save"))); await writing;
            using var canceled = new CancellationTokenSource(); canceled.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => saves.WriteAsync(story, "drain.save", new byte[] { (byte)'b' }, true, canceled.Token));
            Assert.Equal(bytes, await saves.ReadAsync(story, "drain.save"));
        }
        finally { Directory.Delete(root, true); }
    }
}
