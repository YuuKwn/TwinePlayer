using System.Text.Json;
using System.Text.Json.Nodes;
using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.Persistence;

public sealed class StoryAssistanceStore(NativeDatabase database)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    public async Task<StoryAssistancePreferences> GetAsync(StoryIdentity story, CancellationToken token = default)
    {
        var json = await database.GetStoryPreferencesAsync(story.Id, token);
        if (json is not null) return StoryAssistancePreferences.Parse(json);
        var legacy = await database.GetPreferenceAsync("legacy.story-assistance.json", token);
        if (legacy is null) return new();
        using var parsed = JsonDocument.Parse(legacy);
        if (!parsed.RootElement.TryGetProperty("games", out var games) || games.ValueKind != JsonValueKind.Object) return new();
        foreach (var entry in games.EnumerateObject())
        {
            if (!Path.IsPathFullyQualified(entry.Name)) continue;
            string path;
            try { path = Path.GetFullPath(entry.Name); } catch (ArgumentException) { continue; }
            if (path.Equals(story.FilePath, StringComparison.OrdinalIgnoreCase) && entry.Value.ValueKind == JsonValueKind.Object)
            {
                await database.SetStoryPreferencesAsync(story.Id, entry.Value.GetRawText(), token);
                return StoryAssistancePreferences.Parse(entry.Value.GetRawText());
            }
        }
        return new();
    }
    public async Task SaveAsync(StoryIdentity story, StoryAssistancePreferences preferences, CancellationToken token = default)
    {
        await _gate.WaitAsync(token);
        try
        {
            var previous = await database.GetStoryPreferencesAsync(story.Id, token);
            var map = previous is null ? new JsonObject() : JsonNode.Parse(previous) as JsonObject ?? throw new InvalidDataException("Story preferences are invalid and were preserved.");
            foreach (var pair in (JsonObject)JsonNode.Parse(preferences.ToJson())!) map[pair.Key] = pair.Value?.DeepClone();
            await database.SetStoryPreferencesAsync(story.Id, map.ToJsonString(), token);
        }
        finally { _gate.Release(); }
    }
}
