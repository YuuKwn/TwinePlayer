using System.Text;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Player;
using Xunit;

namespace TwinePlayer.Native.Tests;

public sealed class SaveTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "TwinePlayer-native-saves-" + Guid.NewGuid().ToString("N"));
    private string Game => Path.Combine(_root, "Example.html");
    [Theory]
    [InlineData("../other.save")][InlineData("folder\\other.save")][InlineData("CON.save")][InlineData("LPT1.any.save")]
    [InlineData("bad:stream.save")][InlineData("bad\u0001.save")][InlineData("empty.txt")][InlineData(".save")]
    public void RejectsUnsafeFilenames(string name) => Assert.Throws<ArgumentException>(() => SaveRules.Filename(name));

    [Fact]
    public void CaptureSettlementRequiresValidCorrelationAndSource()
    {
        var story = new StoryIdentity(Guid.NewGuid(), Game);
        var id = Guid.NewGuid().ToString();
        var json = $"{{\"type\":\"save-bytes\",\"filename\":\"one.save\",\"bytes\":[65],\"operationId\":\"{id}\"}}";
        Assert.Equal(id, BridgeMessages.Parse(json, story.Uri.AbsoluteUri, story)!.OperationId);
        Assert.Null(BridgeMessages.Parse(json.Replace(id, "invalid"), story.Uri.AbsoluteUri, story));
        Assert.Null(BridgeMessages.Parse(json, "https://example.invalid", story));
        var failure = $"{{\"type\":\"save-result\",\"operationId\":\"{id}\",\"success\":false,\"error\":\"Save denied\"}}";
        Assert.False(BridgeMessages.Parse(failure, story.Uri.AbsoluteUri, story)!.Success);
        Assert.Null(BridgeMessages.Parse(failure.Replace(id, "invalid"), story.Uri.AbsoluteUri, story));
    }
    [Fact]
    public async Task SaveRoundtripOverwriteAndDeleteKeepRawPayload()
    {
        var service = new SaveService();
        await service.WriteAsync(Game, "progress.save", "original"u8.ToArray(), false);
        Assert.Equal("original", Encoding.UTF8.GetString(await service.ReadAsync(Game, "progress.save")));
        await Assert.ThrowsAsync<IOException>(() => service.WriteAsync(Game, "progress.save", "refused"u8.ToArray(), false));
        await service.WriteAsync(Game, "progress.save", "updated"u8.ToArray(), true);
        Assert.Equal("updated", Encoding.UTF8.GetString(await service.ReadAsync(Game, "progress.save")));
        Assert.Single(await service.ListAsync(Game));
        await service.DeleteAsync(Game, "progress.save");
        Assert.Empty(await service.ListAsync(Game));
    }
    [Fact]
    public async Task FailedReplacementPreservesPreviousValidSave()
    {
        var service = new SaveService();
        await service.WriteAsync(Game, "progress.save", "original"u8.ToArray(), false);
        using (var locked = new FileStream(SaveRules.PathFor(Game, "progress.save"), FileMode.Open, FileAccess.Read, FileShare.None))
            await Assert.ThrowsAnyAsync<IOException>(() => service.WriteAsync(Game, "progress.save", "replacement"u8.ToArray(), true));
        Assert.Equal("original", Encoding.UTF8.GetString(await service.ReadAsync(Game, "progress.save")));
        Assert.Empty(Directory.GetFiles(SaveRules.DirectoryFor(Game), "*.tmp"));
    }
    [Fact]
    public async Task EmptyOversizedMissingAndNullSavesAreRejected()
    {
        var service = new SaveService();
        Directory.CreateDirectory(SaveRules.DirectoryFor(Game));
        await File.WriteAllTextAsync(SaveRules.PathFor(Game, "empty.save"), "");
        await File.WriteAllTextAsync(SaveRules.PathFor(Game, "null.save"), "null");
        using (var large = File.Create(SaveRules.PathFor(Game, "large.save"))) large.SetLength(SaveRules.MaxBytes + 1L);
        await Assert.ThrowsAsync<InvalidDataException>(() => service.ReadAsync(Game, "empty.save"));
        await Assert.ThrowsAsync<InvalidDataException>(() => service.ReadAsync(Game, "null.save"));
        await Assert.ThrowsAsync<InvalidDataException>(() => service.ReadAsync(Game, "large.save"));
        await Assert.ThrowsAsync<FileNotFoundException>(() => service.ReadAsync(Game, "missing.save"));
    }
    [Fact]
    public async Task OverlappingWritesProduceOneCompleteSave()
    {
        var service = new SaveService();
        var one = Encoding.UTF8.GetBytes(new string('A', 1024 * 256));
        var two = Encoding.UTF8.GetBytes(new string('B', 1024 * 256));
        await Task.WhenAll(service.WriteAsync(Game, "progress.save", one, true), service.WriteAsync(Game, "progress.save", two, true));
        var result = await service.ReadAsync(Game, "progress.save");
        Assert.True(result.SequenceEqual(one) || result.SequenceEqual(two));
    }
    [Fact]
    public void BridgeRejectsForeignSourcesAndMalformedBytes()
    {
        var story = new StoryIdentity(Guid.NewGuid(), Game);
        Assert.Null(BridgeMessages.Parse("{\"type\":\"load-request\"}", "https://example.com", story));
        Assert.Null(BridgeMessages.Parse("{\"type\":\"save-bytes\",\"filename\":\"one.save\",\"bytes\":[-1]}", story.Uri.AbsoluteUri, story));
        Assert.Null(BridgeMessages.Parse("{\"type\":\"save-bytes\",\"filename\":\"../one.save\",\"bytes\":[65]}", story.Uri.AbsoluteUri, story));
        Assert.NotNull(BridgeMessages.Parse("{\"type\":\"save-bytes\",\"filename\":\"one.save\",\"bytes\":[65]}", story.Uri.AbsoluteUri, story));
        Assert.Null(BridgeMessages.Parse("{\"type\":\"run-native-shell\"}", story.Uri.AbsoluteUri, story));
    }
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); }
}
