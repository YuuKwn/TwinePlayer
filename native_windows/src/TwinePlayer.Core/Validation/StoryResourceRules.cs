namespace TwinePlayer.Native.Core;
public static class StoryResourceRules
{
    // Virtual-host mappings bypass WebResourceRequested. Validate the actual
    // approved tree before giving WebView2 access; never follow reparse entries.
    public static void ValidateFolder(string directory, CancellationToken token = default)
    {
        var remaining = new Stack<string>(); remaining.Push(directory); var count = 0;
        while (remaining.TryPop(out var current))
        {
            foreach (var entry in Directory.EnumerateFileSystemEntries(current))
            {
                token.ThrowIfCancellationRequested();
                if (++count > 1_000_000) throw new IOException("Story resource folder exceeds the validation limit; use a dedicated game folder.");
                var attributes = File.GetAttributes(entry);
                if ((attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("The approved story folder contains a filesystem link. Use a game folder with ordinary files and directories.");
                if ((attributes & FileAttributes.Directory) != 0) remaining.Push(entry);
            }
        }
    }
    public static void Validate(string source, StoryIdentity story)
    {
        if (source.Length > 8192 || !StoryNavigationPolicy.IsAllowed(story, source)) throw new ArgumentException("Invalid story resource origin.");
        var uri = new Uri(source);
        var raw = source[(source.IndexOf("://", StringComparison.Ordinal) + 3)..];
        raw = raw.Contains('/') ? raw[raw.IndexOf('/')..].Split(new[] { '?', '#' })[0] : "/";
        for (var pass = 0; pass < 2; pass++)
        {
            raw = Uri.UnescapeDataString(raw);
            if (raw.Split(new[] { '/', '\\' }).Any(part => part == ".." || part.Contains(':') || part.Any(c => c < 32))) throw new ArgumentException("Resource paths cannot traverse outside the approved story folder.");
        }
        var root = Path.GetFullPath(story.ResourceDirectory).TrimEnd(Path.DirectorySeparatorChar);
        var local = Path.GetFullPath(Path.Combine(root, Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
        if (!local.Equals(root, StringComparison.OrdinalIgnoreCase) && !local.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Resource path escaped the approved folder.");
        var cursor = root;
        foreach (var part in Path.GetRelativePath(root, local).Split(Path.DirectorySeparatorChar))
        {
            cursor = Path.Combine(cursor, part);
            if ((File.Exists(cursor) || Directory.Exists(cursor)) && (File.GetAttributes(cursor) & FileAttributes.ReparsePoint) != 0) throw new ArgumentException("Story resources do not follow filesystem links.");
        }
    }
}
