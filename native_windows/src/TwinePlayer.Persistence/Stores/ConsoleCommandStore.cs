using System.Text.Json.Nodes;
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
    public async Task SaveAsync(string scope, string command, bool delete = false)
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
            await database.SetPreferenceAsync("console-commands", map.ToJsonString());
        }
        finally { _gate.Release(); }
    }
}
