namespace TwinePlayer.Native.Core;

public sealed record StoryImageAddress(string Source, string Kind);
public static class StoryImageRules
{
    public const int MaxBytes = 50 * 1024 * 1024;
    public const int MaxSourceCharacters = 70 * 1024 * 1024;
    public static StoryImageAddress Resolve(string source, StoryIdentity story)
    {
        if (string.IsNullOrWhiteSpace(source) || source.Length > MaxSourceCharacters || !Uri.TryCreate(source, UriKind.Absolute, out var uri)) throw new ArgumentException("The image source is empty, invalid or oversized.");
        if (uri.Scheme == "data")
        {
            if (!source.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase) || source.IndexOf(',') < 11) throw new ArgumentException("Only image data URLs can be previewed.");
            return new(source, "data");
        }
        if (source.Length > 8192) throw new ArgumentException("The image URL is too long.");
        if (uri.Scheme == "blob")
        {
            if (!source.StartsWith("blob:https://" + story.HostName + "/", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("The image blob belongs to a different story origin.");
            return new(source, "browser");
        }
        if (uri.IsFile)
        {
            var full = Path.GetFullPath(uri.LocalPath); var root = Path.GetFullPath(story.ResourceDirectory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Image file is outside the approved story folder.");
            source = $"https://{story.HostName}/" + string.Join('/', Path.GetRelativePath(story.ResourceDirectory, full).Split(Path.DirectorySeparatorChar).Select(Uri.EscapeDataString));
            uri = new Uri(source);
        }
        if (uri.Scheme is not ("http" or "https") || uri.UserInfo.Length != 0) throw new ArgumentException("This image URL scheme is not supported.");
        if (uri.Host.Equals(story.HostName, StringComparison.OrdinalIgnoreCase))
        {
            StoryResourceRules.Validate(source, story);
            return new(source, "browser");
        }
        if (uri.Host.EndsWith(".twineplayer.local", StringComparison.OrdinalIgnoreCase) || uri.Host.Equals("twineplayer.local", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("This image belongs to another local story origin.");
        return new(source, "remote");
    }
}
