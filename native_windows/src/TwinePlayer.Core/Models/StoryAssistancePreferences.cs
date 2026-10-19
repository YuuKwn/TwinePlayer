using System.Text.Json;
namespace TwinePlayer.Native.Core;

public sealed record StoryAssistancePreferences
{
    public double ZoomFactor { get; init; } = 1;
    public bool EnhancedChoices { get; init; }
    public bool ReadabilityEnabled { get; init; }
    public double TextScale { get; init; } = 1;
    public double LineHeight { get; init; } = 1.4;
    public double ParagraphSpacing { get; init; } = 1;
    public bool ReadableLineLengthEnabled { get; init; }
    public double ReadableLineLength { get; init; } = 72;
    public double TargetSpacing { get; init; } = 1;
    private static double Bound(double value, double min, double max, double fallback) => double.IsFinite(value) ? Math.Clamp(value, min, max) : fallback;
    public StoryAssistancePreferences Normalized => this with
    {
        ZoomFactor = Bound(ZoomFactor, .75, 1.75, 1), TextScale = Bound(TextScale, .9, 1.3, 1),
        LineHeight = Bound(LineHeight, 1.1, 2, 1.4), ParagraphSpacing = Bound(ParagraphSpacing, .5, 2, 1),
        ReadableLineLength = Bound(ReadableLineLength, 45, 90, 72), TargetSpacing = Bound(TargetSpacing, .75, 1.75, 1)
    };
    public StoryAssistancePreferences ResetReadability() => new() { ZoomFactor = ZoomFactor, EnhancedChoices = EnhancedChoices };
    public static StoryAssistancePreferences Parse(string json)
    {
        using var document = JsonDocument.Parse(json); var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object) throw new InvalidDataException("Story preferences must be an object; the original data has been preserved.");
        double Number(string name, double fallback) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var number) ? number : fallback;
        bool Flag(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
        return new StoryAssistancePreferences { ZoomFactor = Number("zoomFactor", 1), EnhancedChoices = Flag("enhancedChoices"), ReadabilityEnabled = Flag("readabilityEnabled"), TextScale = Number("textScale", 1), LineHeight = Number("lineHeight", 1.4), ParagraphSpacing = Number("paragraphSpacing", 1), ReadableLineLengthEnabled = Flag("readableLineLengthEnabled"), ReadableLineLength = Number("readableLineLength", 72), TargetSpacing = Number("targetSpacing", 1) }.Normalized;
    }
    public string ToJson() => JsonSerializer.Serialize(Normalized, new JsonSerializerOptions(JsonSerializerDefaults.Web) { IgnoreReadOnlyProperties = true });
}
public sealed record AssistanceStatus(string Engine, bool Verified, bool Enabled, bool StylePresent, bool ObserverPresent, int MarkedCount, string Reason);
