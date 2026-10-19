using TwinePlayer.Native.Core;
using Xunit;
namespace TwinePlayer.Native.Tests;
public sealed class WindowPlacementTests
{
    [Fact]
    public void DisconnectedMonitorPlacementIsClampedToVisibleWorkArea()
    {
        var result = new WindowPlacement(9000, -8000, 5000, 4000, true).Clamp(0, 0, 1920, 1040);
        Assert.Equal(new WindowPlacement(0, 0, 1920, 1040, true), result);
    }
    [Fact]
    public void NegativeCoordinateMonitorAndSmallWorkAreaRemainUsable()
    {
        var result = new WindowPlacement(-2500, 100, 1200, 820).Clamp(-1920, 0, 1920, 1080);
        Assert.Equal(-1920, result.X); Assert.Equal(100, result.Y);
        var tiny = new WindowPlacement(0, 0, -1, -1).Clamp(100, 100, 320, 240);
        Assert.Equal(new WindowPlacement(100, 100, 320, 240), tiny);
    }
}
