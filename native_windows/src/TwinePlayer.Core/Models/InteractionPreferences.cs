using System.Text.Json;
namespace TwinePlayer.Native.Core;

public enum InteractionProfile { Auto, Comfortable, Compact }
public enum BarAlignment { Start, Center, End }
public enum BarSize { Small, Standard, Large }
public enum BarReach { Left, Balanced, Right }
public sealed record CommandBarPreferences
{
    public BarAlignment Alignment { get; init; } = BarAlignment.Center;
    public BarSize Size { get; init; } = BarSize.Standard;
    public BarReach Reach { get; init; } = BarReach.Balanced;
    public bool PageUpEnabled { get; init; }
    public bool PageDownEnabled { get; init; }
    public string[] Order { get; init; } = ["back", "undo", "save", "load", "console", "more"];
    public CommandBarPreferences Normalized => this with { Order = Order.Concat(new CommandBarPreferences().Order).Where(id => id is "back" or "undo" or "save" or "load" or "pageUp" or "pageDown").Distinct().Concat(new[] { "console", "more" }).ToArray() };
    public double TargetSize => Size switch { BarSize.Small => 44, BarSize.Large => 56, _ => 48 };
    public static CommandBarPreferences Parse(string? json)
    {
        if (json is null) return new();
        using var document = JsonDocument.Parse(json); var root = document.RootElement;
        if (root.TryGetProperty("preferences", out var nested)) root = nested;
        string? Text(string name) => root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
        bool Flag(string name) => root.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.True;
        return new CommandBarPreferences {
            Alignment = Text("alignment") switch { "start" => BarAlignment.Start, "end" => BarAlignment.End, _ => BarAlignment.Center },
            Size = Text("size") switch { "small" or "compact" => BarSize.Small, "large" => BarSize.Large, _ => BarSize.Standard },
            Reach = Text("reach") switch { "left" => BarReach.Left, "right" => BarReach.Right, _ => BarReach.Balanced },
            PageUpEnabled = Flag("pageUpEnabled"), PageDownEnabled = Flag("pageDownEnabled"),
            Order = root.TryGetProperty("order", out var order) && order.ValueKind == JsonValueKind.Array ? order.EnumerateArray().Where(p => p.ValueKind == JsonValueKind.String).Take(64).Select(p => p.GetString()!).ToArray() : new CommandBarPreferences().Order
        }.Normalized;
    }
    public string ToJson() => JsonSerializer.Serialize(new { alignment = Alignment.ToString().ToLowerInvariant(), size = Size.ToString().ToLowerInvariant(), reach = Reach.ToString().ToLowerInvariant(), pageUpEnabled = PageUpEnabled, pageDownEnabled = PageDownEnabled, order = Normalized.Order });
}
public sealed class InteractionState
{
    public InteractionProfile Selected { get; private set; } = InteractionProfile.Auto;
    public InteractionProfile Effective { get; private set; } = InteractionProfile.Compact;
    private long? _lastChange;
    public void Select(InteractionProfile value) { Selected = value; _lastChange = null; if (value != InteractionProfile.Auto) Effective = value; }
    public bool Activate(string kind, long monotonicMilliseconds)
    {
        if (Selected != InteractionProfile.Auto) return false;
        var next = kind switch { "touch" or "stylus" or "pen" or "invertedStylus" => InteractionProfile.Comfortable, "mouse" => InteractionProfile.Compact, _ => Effective };
        if (next == Effective || _lastChange is { } last && monotonicMilliseconds - last < 350) return false;
        Effective = next; _lastChange = monotonicMilliseconds; return true;
    }
}
