using System.Text.Json;
using System.Text.Json.Nodes;
using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.Persistence;
public sealed class ConsoleCommandStore(NativeDatabase database)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private async Task<JsonObject> LoadAsync()
    {
        var json = await database.GetPreferenceAsync("console-commands") ?? await database.GetPreferenceAsync("legacy.console-commands.json") ?? "{}";
        return JsonNode.Parse(json) as JsonObject ?? throw new InvalidDataException("Saved-command data is malformed and has been preserved.");
    }
    private static List<string> Commands(JsonObject map, string scope) => map[scope] is JsonArray values
        ? values.OfType<JsonValue>().Select(v => v.TryGetValue<string>(out var command) ? command : null).Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s!.Trim()).Distinct(StringComparer.Ordinal).ToList() : [];
    public async Task<IReadOnlyList<string>> GetAsync(string scope) { await _gate.WaitAsync(); try { return Commands(await LoadAsync(), scope); } finally { _gate.Release(); } }
    private async Task<JsonObject> LoadPinsAsync()
    {
        var json = await database.GetPreferenceAsync("console-command-pins") ?? "{}";
        return JsonNode.Parse(json) as JsonObject ?? throw new InvalidDataException("Sidebar shortcut data is malformed and has been preserved.");
    }
    private static List<PinnedConsoleCommand> Pins(JsonObject map, Guid gameId)
    {
        if (!map.TryGetPropertyValue(gameId.ToString("N"), out var value)) return [];
        var pins = value?.Deserialize<List<PinnedConsoleCommand>>();
        if (pins is null || pins.Count > 500 || pins.Any(pin => pin is null || string.IsNullOrWhiteSpace(pin.Command) || pin.Command.Length > 4096 || string.IsNullOrWhiteSpace(pin.Label) || pin.Label.Length > 40) || pins.Select(pin => pin.Command).Distinct(StringComparer.Ordinal).Count() != pins.Count)
            throw new InvalidDataException("Sidebar shortcut data is malformed and has been preserved.");
        return pins;
    }
    private static void WritePins(JsonObject map, Guid gameId, List<PinnedConsoleCommand> pins)
        => map[gameId.ToString("N")] = JsonSerializer.SerializeToNode(pins);
    public async Task<IReadOnlyList<PinnedConsoleCommand>> GetPinnedAsync(Guid gameId)
    {
        await _gate.WaitAsync();
        try { return Pins(await LoadPinsAsync(), gameId); }
        finally { _gate.Release(); }
    }
    public async Task PinAsync(Guid gameId, string command, string label)
    {
        command = command.Trim(); label = label.Trim();
        if (gameId == Guid.Empty || command.Length is 0 or > 4096 || label.Length is 0 or > 40)
            throw new ArgumentException("Choose a game, a command of 1–4096 characters and a button name of 1–40 characters.");
        await _gate.WaitAsync();
        try
        {
            var map = await LoadPinsAsync(); var pins = Pins(map, gameId);
            var index = pins.FindIndex(pin => pin.Command == command);
            if (index >= 0) pins[index] = new(command, label);
            else { if (pins.Count >= 500) throw new InvalidOperationException("This game already has 500 sidebar shortcuts."); pins.Add(new(command, label)); }
            WritePins(map, gameId, pins);
            await database.SetPreferenceAsync("console-command-pins", map.ToJsonString());
        }
        finally { _gate.Release(); }
    }
    public async Task UnpinAsync(Guid gameId, string command)
    {
        await _gate.WaitAsync();
        try
        {
            var map = await LoadPinsAsync(); var pins = Pins(map, gameId);
            pins.RemoveAll(pin => pin.Command == command.Trim()); WritePins(map, gameId, pins);
            await database.SetPreferenceAsync("console-command-pins", map.ToJsonString());
        }
        finally { _gate.Release(); }
    }
    public async Task SaveAsync(string scope, string command, bool delete = false, Guid? gameId = null)
    {
        command = command.Trim();
        if (scope.Length == 0 || command.Length is 0 or > 4096) throw new ArgumentException("Commands must contain 1–4096 characters and have a story scope.");
        await _gate.WaitAsync();
        try
        {
            var map = await LoadAsync(); var commands = Commands(map, scope);
            if (delete) commands.Remove(command);
            else if (!commands.Contains(command, StringComparer.Ordinal)) { if (commands.Count >= 500) throw new InvalidOperationException("This story already has 500 saved commands."); commands.Add(command); }
            map[scope] = new JsonArray(commands.Select(s => JsonValue.Create(s)).ToArray());
            // Delete the current game's pin and saved command in one transaction.
            JsonObject? pinMap = null;
            if (delete && gameId is { } id)
            {
                pinMap = await LoadPinsAsync(); var pins = Pins(pinMap, id);
                pins.RemoveAll(pin => pin.Command == command); WritePins(pinMap, id, pins);
            }
            await database.TransactionAsync((db, transaction) =>
            {
                NativeDatabase.PutPreference(db, transaction, "console-commands", map.ToJsonString(), true);
                if (pinMap is not null) NativeDatabase.PutPreference(db, transaction, "console-command-pins", pinMap.ToJsonString(), true);
                return 0;
            }, default);
        }
        finally { _gate.Release(); }
    }
}
