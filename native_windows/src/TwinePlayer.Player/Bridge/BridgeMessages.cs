using System.Text;
using System.Text.Json;
using TwinePlayer.Native.Core;

namespace TwinePlayer.Native.Player;

public sealed record BridgeMessage(string Type, string? Text = null, string? Level = null, byte[]? Bytes = null, string? OperationId = null, bool Success = false, InputMetadata? Input = null);

public static class BridgeMessages
{
    public const int MaxEnvelopeBytes = SaveRules.MaxBytes * 4 + 1024 * 1024;
    public static BridgeMessage? Parse(string raw, string source, StoryIdentity story)
    {
        if (!StoryNavigationPolicy.IsAllowed(story, source) || raw.Length > MaxEnvelopeBytes || Encoding.UTF8.GetByteCount(raw) > MaxEnvelopeBytes) return null;
        try
        {
            using var json = JsonDocument.Parse(raw, new JsonDocumentOptions { MaxDepth = 12 });
            var root = json.RootElement;
            var type = Text(root, "type", 64);
            switch (type)
            {
                case "input-activation":
                    var activation = Text(root, "kind", 20);
                    return activation is "mouse" or "touch" or "pen" ? new(type, activation) : null;
                case "native-input-diagnostic":
                    if (!root.TryGetProperty("buttons", out var buttons) || !buttons.TryGetInt32(out var buttonCount) || !root.TryGetProperty("contacts", out var contacts) || !contacts.TryGetInt32(out var contactCount)) return null;
                    var input = InputMetadata.Create(Text(root, "kind", 20), Text(root, "category", 20), buttonCount, contactCount, "webview");
                    return input is null ? null : new(type, Input: input);
                case "identity":
                    var title = Text(root, "title", 4096);
                    var ifid = Text(root, "ifid", 4096);
                    return title is not null && ifid is not null ? new(type, title, ifid) : null;
                case "log":
                    var level = Text(root, "level", 32);
                    var text = Text(root, "message", 4096);
                    return text is not null && level is ("normal" or "result" or "error" or "input") ? new(type, text, level) : null;
                case "load-request":
                case "save-request": return new(type);
                case "image-preview":
                case "image-context":
                    var src = Text(root, "src", StoryImageRules.MaxSourceCharacters); var alt = Text(root, "alt", 1024);
                    if (src is null || alt is null || !root.TryGetProperty("width", out var w) || !w.TryGetInt32(out var width) || width is < 0 or > 100000 || !root.TryGetProperty("height", out var h) || !h.TryGetInt32(out var height) || height is < 0 or > 100000) return null;
                    return new(type, src, alt); // Resolve approved resources only when the UI performs the preview action.
                case "image-data":
                    var imageId = Text(root, "operationId", 36); if (!Guid.TryParse(imageId, out _)) return null;
                    if (root.TryGetProperty("error", out var imageError) && imageError.ValueKind == JsonValueKind.String) return new(type, Text(root, "error", 4096), OperationId: imageId);
                    if (!root.TryGetProperty("bytes", out var imageItems) || imageItems.ValueKind != JsonValueKind.Array || imageItems.GetArrayLength() is <= 0 or > StoryImageRules.MaxBytes) return null;
                    var imageBytes = new byte[imageItems.GetArrayLength()]; var imageIndex = 0;
                    foreach (var item in imageItems.EnumerateArray()) if (!item.TryGetByte(out imageBytes[imageIndex++])) return null;
                    return new(type, Bytes: imageBytes, OperationId: imageId, Success: true);
                case "load-result":
                case "save-result":
                    var operation = Text(root, "operationId", 36);
                    if (!Guid.TryParse(operation, out _) || !root.TryGetProperty("success", out var success) || success.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return null;
                    return new(type, Text(root, "error", 4096), OperationId: operation, Success: success.GetBoolean());
                case "save-bytes":
                    var name = Text(root, "filename", 255);
                    if (name is null) return null;
                    var normalized = SaveRules.Filename(name.EndsWith(".save", StringComparison.OrdinalIgnoreCase) ? name : name + ".save");
                    if (!root.TryGetProperty("bytes", out var items) || items.ValueKind != JsonValueKind.Array || items.GetArrayLength() is <= 0 or > SaveRules.MaxBytes) return null;
                    var bytes = new byte[items.GetArrayLength()];
                    var i = 0;
                    foreach (var item in items.EnumerateArray()) { if (!item.TryGetByte(out bytes[i++])) return null; }
                    var captureId = Text(root, "operationId", 36);
                    if (root.TryGetProperty("operationId", out var captureToken) && captureToken.ValueKind != JsonValueKind.Null && captureId is null) return null;
                    if (captureId is not null && !Guid.TryParse(captureId, out _)) return null;
                    return new(type, normalized, Bytes: bytes, OperationId: captureId);
                default: return null;
            }
        }
        catch (Exception error) when (error is JsonException or ArgumentException or InvalidOperationException or FormatException) { return null; }
    }
    private static string? Text(JsonElement root, string name, int max) => root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String && p.GetString() is { } text && text.Length <= max ? text : null;
}
