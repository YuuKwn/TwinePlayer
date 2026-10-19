namespace TwinePlayer.Native.Core;
public sealed record WindowPlacement(int X, int Y, int Width, int Height, bool Maximized = false)
{
    public WindowPlacement Clamp(int x, int y, int width, int height)
    {
        width = Math.Max(1, width); height = Math.Max(1, height);
        var w = Math.Clamp(Width, Math.Min(640, width), width);
        var h = Math.Clamp(Height, Math.Min(480, height), height);
        return this with { X = Math.Clamp(X, x, x + width - w), Y = Math.Clamp(Y, y, y + height - h), Width = w, Height = h };
    }
}
