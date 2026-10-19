using TwinePlayer.Native.Core;
namespace TwinePlayer.Native.Persistence;
public sealed class InteractionPreferenceStore(NativeDatabase database)
{
    public async Task<(InteractionProfile Profile, CommandBarPreferences Bar)> LoadAsync()
    {
        var profile = await database.GetPreferenceAsync("interactionProfile");
        var bar = await database.GetPreferenceAsync("command-bar-preferences") ?? await database.GetPreferenceAsync("legacy.command-bar-preferences.json");
        return (profile switch { "comfortable" => InteractionProfile.Comfortable, "compact" => InteractionProfile.Compact, _ => InteractionProfile.Auto }, CommandBarPreferences.Parse(bar));
    }
    public async Task SaveAsync(InteractionProfile profile, CommandBarPreferences bar)
    {
        await database.SetPreferenceAsync("interactionProfile", profile.ToString().ToLowerInvariant());
        await database.SetPreferenceAsync("command-bar-preferences", bar.ToJson());
    }
}
