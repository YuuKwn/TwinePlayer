using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
using Xunit;
namespace TwinePlayer.Native.Tests;
public sealed class InteractionTests
{
    [Fact]
    public void AutoAdaptsOnActivationWithHoldoffAndHonorsExplicitChoice()
    {
        var state = new InteractionState(); Assert.Equal(InteractionProfile.Compact, state.Effective);
        Assert.True(state.Activate("touch", 1000)); Assert.False(state.Activate("mouse", 1200));
        Assert.Equal(InteractionProfile.Comfortable, state.Effective); Assert.True(state.Activate("mouse", 1350));
        Assert.False(state.Activate("unknown", 2000)); state.Select(InteractionProfile.Compact); Assert.False(state.Activate("touch", 3000));
        state.Select(InteractionProfile.Auto); Assert.True(state.Activate("pen", 3001));
    }
    [Fact]
    public void OrderRejectsUnknownDuplicatesAndPinsConsoleBeforeMore()
    {
        var bar = CommandBarPreferences.Parse("{\"preferences\":{\"order\":[\"more\",\"save\",\"save\",\"bad\",\"console\",\"pageDown\"],\"size\":\"compact\",\"reach\":\"right\",\"pageDownEnabled\":true}}");
        Assert.Equal(new[] { "save", "pageDown", "back", "undo", "load", "console", "more" }, bar.Order);
        Assert.Equal(44, bar.TargetSize); Assert.Equal(BarReach.Right, bar.Reach); Assert.True(bar.PageDownEnabled);
        Assert.Equal(bar.ToJson(), CommandBarPreferences.Parse(bar.ToJson()).ToJson());
    }
    [Fact]
    public void DiagnosticsAreOptInBoundedAndExportOnlyAllowedMetadata()
    {
        var diagnostics = new InputDiagnostics(); var value = InputMetadata.Create("touch", "pointercancel", 100, 100, "webview");
        diagnostics.Record(value); Assert.Empty(diagnostics.Events); diagnostics.Enable(true);
        for (var i = 0; i < 250; i++) diagnostics.Record(value);
        Assert.Equal(200, diagnostics.Events.Count); Assert.All(diagnostics.Events, item => { Assert.Equal(8, item.Buttons); Assert.Equal(10, item.Contacts); });
        Assert.Null(InputMetadata.Create("mouse", "keypress", 1, 0, "webview")); Assert.Null(InputMetadata.Create("mouse", "click", 1, 0, "file:///private"));
        diagnostics.SetScenarioLabel("\r\n  Touch\tTest  " + new string('a', 100)); Assert.Equal(64, diagnostics.ScenarioLabel.Length); Assert.DoesNotContain('\n', diagnostics.ScenarioLabel);
        var report = diagnostics.Report("C:/private/game.html", "7"); Assert.DoesNotContain("private", report); Assert.DoesNotContain("timestamp", report); Assert.DoesNotContain("pointerId", report);
        diagnostics.Enable(false); diagnostics.Record(value); Assert.Equal(200, diagnostics.Events.Count); diagnostics.Clear(); Assert.Empty(diagnostics.Events);
    }
    [Fact]
    public async Task PreferencesReadRetainedFlutterWrapperAndPersistNativeOverrides()
    {
        var root = Path.Combine(Path.GetTempPath(), "native-input-" + Guid.NewGuid().ToString("N"));
        try
        {
            var database = new NativeDatabase(root); await database.SetPreferenceAsync("interactionProfile", "comfortable");
            await database.SetPreferenceAsync("legacy.command-bar-preferences.json", "{\"version\":1,\"preferences\":{\"size\":\"large\",\"pageUpEnabled\":true},\"unknown\":1}");
            var store = new InteractionPreferenceStore(database); var value = await store.LoadAsync(); Assert.Equal(InteractionProfile.Comfortable, value.Profile); Assert.Equal(56, value.Bar.TargetSize);
            await store.SaveAsync(InteractionProfile.Compact, value.Bar with { Reach = BarReach.Left });
            var restored = await new InteractionPreferenceStore(database).LoadAsync(); Assert.Equal(InteractionProfile.Compact, restored.Profile); Assert.Equal(BarReach.Left, restored.Bar.Reach);
            Assert.Contains("unknown", await database.GetPreferenceAsync("legacy.command-bar-preferences.json"));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
