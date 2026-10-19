using System.Text.Json;
using System.Text.RegularExpressions;
namespace TwinePlayer.Native.Core;

public sealed record InputMetadata(string Kind, string Category, int Buttons, int Contacts, string Origin)
{
    public static InputMetadata? Create(string? kind, string? category, int buttons, int contacts, string origin)
    {
        if (category is not ("pointerdown" or "pointerup" or "pointercancel" or "touchstart" or "touchend" or "touchcancel" or "mousedown" or "mouseup" or "wheel" or "click" or "contextmenu") || origin is not ("chrome" or "webview")) return null;
        kind = kind == "pen" ? "stylus" : kind;
        return new(kind is "mouse" or "touch" or "stylus" or "invertedStylus" or "trackpad" ? kind : "unknown", category, Math.Clamp(buttons, 0, 8), Math.Clamp(contacts, 0, 10), origin);
    }
}
public sealed class InputDiagnostics
{
    private readonly Queue<InputMetadata> _events = new();
    public bool Enabled { get; private set; }
    public string ScenarioLabel { get; private set; } = "";
    public IReadOnlyList<InputMetadata> Events => _events.ToArray();
    public void Enable(bool value) => Enabled = value;
    public void SetScenarioLabel(string value) { var text = Regex.Replace(value, @"[\p{Cc}\s]+", " ").Trim(); ScenarioLabel = text[..Math.Min(64, text.Length)].TrimEnd(); }
    public void Clear() => _events.Clear();
    public void Record(InputMetadata? value) { if (!Enabled || value is null) return; _events.Enqueue(value); while (_events.Count > 200) _events.Dequeue(); }
    public string Report(string buildName, string buildNumber)
    {
        static string Safe(string value) => value.Length <= 64 && Regex.IsMatch(value, @"^[A-Za-z0-9.+_-]+$") ? value : "unknown";
        return JsonSerializer.Serialize(new { appBuildName = Safe(buildName), appBuildNumber = Safe(buildNumber), enabled = Enabled, scenarioLabel = ScenarioLabel, eventCount = _events.Count, summary = _events.GroupBy(e => $"{e.Origin}:{e.Kind}:{e.Category}").ToDictionary(g => g.Key, g => g.Count()), recent = _events.TakeLast(40) }, new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true });
    }
}
