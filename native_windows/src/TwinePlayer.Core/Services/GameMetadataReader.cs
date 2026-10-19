using System.Net;
using System.Text;
using System.Text.RegularExpressions;
namespace TwinePlayer.Native.Core;

public static class GameMetadataReader
{
    public static async Task<GameMetadata> ReadAsync(string path, CancellationToken token = default)
    {
        await using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 65536, FileOptions.Asynchronous);
        const int edge = 1024 * 1024;
        var head = new byte[(int)Math.Min(file.Length, file.Length > 2L * edge ? edge : 2L * edge)];
        await file.ReadExactlyAsync(head, token);
        var html = Encoding.UTF8.GetString(head);
        if (file.Length > 2L * edge)
        {
            file.Seek(-edge, SeekOrigin.End);
            var tail = new byte[edge]; await file.ReadExactlyAsync(tail, token);
            html += "\n" + Encoding.UTF8.GetString(tail);
        }
        return Parse(html, path);
    }
    public static GameMetadata Parse(string html, string path)
    {
        static string Match(string text, string pattern, int group = 1) => Regex.Match(text, pattern, RegexOptions.IgnoreCase | RegexOptions.Singleline, TimeSpan.FromSeconds(1)).Groups[group].Value;
        static string Clean(string text) => Regex.Replace(WebUtility.HtmlDecode(text), @"\s+", " ").Trim();
        var tag = Match(html, @"(<tw-storydata\b[^>]*>)");
        var ifid = Clean(Match(tag, "\\bifid\\s*=\\s*([\"'])(.*?)\\1", 2));
        var name = Clean(Match(tag, "\\bname\\s*=\\s*([\"'])(.*?)\\1", 2));
        if (name.Length > 0) return new(name, "tw-storydata", ifid.Length == 0 ? null : ifid);
        foreach (var expression in new[] { @"Config\.saves\.id", @"Config\.saves\.metadata\s*=\s*\{[^}]*title", @"Story\.title" })
        {
            name = Clean(Match(html, expression + "\\s*=\\s*(['\"])(.*?)\\1", 2));
            if (name.Length > 0) return new(name, "sugarcube", ifid.Length == 0 ? null : ifid);
        }
        name = Clean(Match(html, @"<title[^>]*>(.*?)</title>"));
        return name.Length > 0 ? new(name, "title", ifid.Length == 0 ? null : ifid) : new(FilenameTitle(path), "filename", ifid.Length == 0 ? null : ifid);
    }
    public static string FilenameTitle(string path) => string.Join(' ', Path.GetFileNameWithoutExtension(path).Replace('-', ' ').Replace('_', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(w => char.ToUpperInvariant(w[0]) + w[1..]));
}
