using System.Text.RegularExpressions;
namespace TwinePlayer.Native.Core;
public sealed record ConsoleEntry(string Message, string Level, string? Command = null)
{
    public override string ToString() => $"[{Level}] {Message}";
}
public sealed partial class ConsoleSession
{
    public List<ConsoleEntry> Entries { get; } = [];
    public List<string> History { get; } = [];
    public void Append(string message, string level, string? command = null)
    {
        Entries.Add(new(message.Length > 65536 ? message[..65536] + "…" : message, level, command));
        if (Entries.Count > 300) Entries.RemoveAt(0);
        if (command is not null && (History.Count == 0 || History[^1] != command)) { History.Add(command); if (History.Count > 100) History.RemoveAt(0); }
    }
    public static string Scope(StoryIdentity story, string? ifid) => string.IsNullOrWhiteSpace(ifid) ? "native:" + story.Id.ToString("N") : ifid.Trim();
    public static string ApplyCompletion(string input, string completion) => Regex.Replace(input, @"([a-zA-Z_$][0-9a-zA-Z_$]*\.)*[a-zA-Z_$][0-9a-zA-Z_$]*\.?[0-9a-zA-Z_$]*$", _ => completion);
    public static bool LooksCompletable(string value)
    {
        var text = value.TrimEnd(); var match = CompletionPattern().Match(text);
        return match.Success && (match.Groups[2].Value.Contains('.') || match.Groups[2].Value == text && text.Length >= 2);
    }
    [GeneratedRegex(@"(^|[^0-9a-zA-Z_$])(([a-zA-Z_$][0-9a-zA-Z_$]*\.)*[a-zA-Z_$][0-9a-zA-Z_$]*\.?[0-9a-zA-Z_$]*)$", RegexOptions.CultureInvariant)]
    private static partial Regex CompletionPattern();
}
