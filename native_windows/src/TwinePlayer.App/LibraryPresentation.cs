namespace TwinePlayer.Native.App;

public static class LibraryPresentation
{
    public static string FileGlyph(bool missing) => missing ? "\uE7BA" : "\uE8A5";
    public static string Detail(DateTimeOffset? played, bool missing)
    {
        var recency = played is { } date ? $"Last played {date.ToLocalTime():g}" : "Not played yet";
        return missing ? $"File unavailable · {recency}" : recency;
    }
}
