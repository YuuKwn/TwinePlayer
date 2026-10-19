using TwinePlayer.Native.Core;
using TwinePlayer.Native.Player;
using Xunit;
namespace TwinePlayer.Native.Tests;
public sealed class ImageDataTests
{
    [Fact]
    public async Task ImageDataUrlsDecodeAndInvalidBase64IsReported()
    {
        Assert.Equal("<svg/>", System.Text.Encoding.UTF8.GetString(await ImageDataLoader.ReadAsync(new("data:image/svg+xml,%3Csvg%2F%3E", "data"))));
        Assert.Equal(new byte[] { 1, 2, 3 }, await ImageDataLoader.ReadAsync(new("data:image/png;base64,AQID", "data")));
        await Assert.ThrowsAsync<FormatException>(() => ImageDataLoader.ReadAsync(new("data:image/png;base64,!!!", "data")));
        await Assert.ThrowsAsync<InvalidDataException>(() => ImageDataLoader.ReadAsync(new("data:image/png;base64,", "data")));
    }
}
