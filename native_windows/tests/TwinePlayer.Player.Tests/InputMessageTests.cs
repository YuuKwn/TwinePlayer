using TwinePlayer.Native.Core;
using TwinePlayer.Native.Player;
using Xunit;
namespace TwinePlayer.Native.Tests;
public sealed class InputMessageTests
{
    [Fact]
    public void InputEnvelopeValidatesOriginAndExportsNoExtraneousFields()
    {
        var story = new StoryIdentity(Guid.NewGuid(), Path.Combine(Path.GetTempPath(), "game.html"));
        const string json = "{\"type\":\"native-input-diagnostic\",\"kind\":\"pen\",\"category\":\"pointercancel\",\"buttons\":0,\"contacts\":0,\"origin\":\"chrome\",\"filename\":\"secret\",\"x\":42,\"key\":\"A\"}";
        var value = BridgeMessages.Parse(json, story.Uri.AbsoluteUri, story)!; Assert.Equal("webview", value.Input!.Origin); Assert.Equal("stylus", value.Input.Kind);
        Assert.Null(BridgeMessages.Parse(json, "https://evil.invalid", story));
        Assert.Null(BridgeMessages.Parse(json.Replace("pointercancel", "keydown"), story.Uri.AbsoluteUri, story));
        Assert.Null(BridgeMessages.Parse("{\"type\":\"input-activation\",\"kind\":\"unknown\"}", story.Uri.AbsoluteUri, story));
    }
}
