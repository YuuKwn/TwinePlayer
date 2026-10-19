namespace TwinePlayer.Native.Core;

public sealed record StoryIdentity(Guid Id, string FilePath)
{
    public string HostName => $"story-{Id:N}.twineplayer.local";
    public Uri Uri => new($"https://{HostName}/{System.Uri.EscapeDataString(Path.GetFileName(FilePath))}");
    public string ResourceDirectory => Path.GetDirectoryName(FilePath)!;
}

public static class StoryFileRules
{
    public static string Normalize(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        if (!Path.IsPathFullyQualified(path)) throw new ArgumentException("Select a fully qualified local story path.");
        var full = Path.GetFullPath(path);
        if (!Path.GetExtension(full).Equals(".html", StringComparison.OrdinalIgnoreCase) &&
            !Path.GetExtension(full).Equals(".htm", StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Choose an HTML or HTM story.");
        return full;
    }
}

public static class StoryNavigationPolicy
{
    public static bool IsAllowed(StoryIdentity story, string value) =>
        System.Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
        uri.Scheme == "https" && uri.Host.Equals(story.HostName, StringComparison.OrdinalIgnoreCase) &&
        uri.IsDefaultPort && string.IsNullOrEmpty(uri.UserInfo);
}
