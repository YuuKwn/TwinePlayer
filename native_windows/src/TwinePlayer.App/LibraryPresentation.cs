namespace TwinePlayer.Native.App;

public static class LibraryPresentation
{
    public static string Heading(string title, bool missing) => missing ? $"{title} · File unavailable" : title;
    public static string LastPlayed(DateTimeOffset? played) => played is { } date ? $"Last played {date.ToLocalTime():g}" : "Not played yet";
}
