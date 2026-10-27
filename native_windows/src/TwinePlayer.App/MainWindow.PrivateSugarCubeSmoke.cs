using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    // Opt-in smoke mode for private-engine games. No engine namespace is injected
    // or recovered: verify actual unmodified HTML through DOM and native save IO.
    private async Task ExercisePrivateSugarCubeSaveAsync(string game, string mode, string filename, string input, string output)
    {
        const string passageScript = "document.querySelector('#passages > .passage:last-child')?.getAttribute('data-passage')";
        for (var i = 0; i < 100 && await _player.ExecuteScriptAsync("!!document.querySelector('#passages > .passage')") != "true"; i++) await Task.Delay(100);
        if (await _player.ExecuteScriptAsync("typeof window.SugarCube === 'undefined' && typeof window.Save === 'undefined' && __twinePlayerDetectEngine() === 'sc2'") != "true")
            throw new InvalidDataException("Private SugarCube engine fallback was not detected.");
        var expectedFile = Path.Combine(Path.GetDirectoryName(input)!, "expected.json");
        string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)));
        async Task<JsonElement> ReadState(byte[] bytes)
        {
            // Parse in the host: SugarCube replaces JSON.parse with a reviver
            // which can execute game constructors and change diagnostic results.
            var script = "LZString.decompressFromBase64(" + JsonSerializer.Serialize(Encoding.UTF8.GetString(bytes)) + ")";
            var decoded = JsonSerializer.Deserialize<string>(await _player.ExecuteScriptAsync(script)) ?? throw new InvalidDataException("Save state did not decode.");
            using var json = JsonDocument.Parse(decoded);
            return json.RootElement.GetProperty("state").Clone();
        }
        bool PreservesSavedFields(JsonElement expected, JsonElement actual)
        {
            if (expected.ValueKind != actual.ValueKind) return false;
            if (expected.ValueKind == JsonValueKind.Object)
                return expected.EnumerateObject().All(p => actual.TryGetProperty(p.Name, out var value) && PreservesSavedFields(p.Value, value));
            if (expected.ValueKind == JsonValueKind.Array)
                return expected.GetArrayLength() == actual.GetArrayLength() && expected.EnumerateArray().Zip(actual.EnumerateArray()).All(p => PreservesSavedFields(p.First, p.Second));
            return JsonElement.DeepEquals(expected, actual);
        }
        var initialPassage = await _player.ExecuteScriptAsync(passageScript);
        string expectedPassage;
        JsonElement expectedState;
        byte[] saved;
        if (mode == "private-sugarcube-capture")
        {
            using var settings = JsonDocument.Parse(await File.ReadAllTextAsync(input));
            foreach (var action in settings.RootElement.GetProperty("startSelectors").EnumerateArray())
            {
                var selector = JsonSerializer.Serialize(action.GetString());
                var script = "(()=>{const el=[...document.querySelectorAll(" + selector + ")].find(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden');if(!el)return false;el.click();return true;})()";
                var clicked = false;
                for (var i = 0; i < 100; i++)
                {
                    if (await _player.ExecuteScriptAsync(script) == "true") { clicked = true; break; }
                    await Task.Delay(100);
                }
                if (!clicked) throw new InvalidDataException("The configured story start action was not available: " + selector);
                await Task.Delay(350);
            }
            expectedPassage = await _player.ExecuteScriptAsync(passageScript);
            if (initialPassage == expectedPassage) throw new InvalidDataException("Start actions did not change the passage.");
            saved = await CaptureBytesAsync(default);
            expectedState = await ReadState(saved);
            await _saves.WriteAsync(game, filename, saved, false);
            await File.WriteAllTextAsync(expectedFile, JsonSerializer.Serialize(new { passage = expectedPassage, state = expectedState }));
        }
        else
        {
            using var expected = JsonDocument.Parse(await File.ReadAllTextAsync(expectedFile));
            expectedPassage = expected.RootElement.GetProperty("passage").GetString()!;
            expectedState = expected.RootElement.GetProperty("state").Clone();
            saved = await _saves.ReadAsync(game, filename);
            if (initialPassage == expectedPassage) throw new InvalidDataException("Cross-process restore must start at a different passage.");
        }
        JsonElement? normalizedState = null;
        for (var round = 0; round < 2; round++)
        {
            await RestoreBytesAsync(saved, default);
            var state = await ReadState(await CaptureBytesAsync(default));
            // Games may add missing defaults in their load hooks. Every field
            // present in the original must survive; repeated loads must agree.
            if (await _player.ExecuteScriptAsync(passageScript) != expectedPassage || !PreservesSavedFields(expectedState, state) || normalizedState.HasValue && !JsonElement.DeepEquals(normalizedState.Value, state))
                throw new InvalidDataException("Restore changed saved fields, the passage, or repeated-load state.");
            normalizedState = state;
        }
        var rejected = false;
        try { await RestoreBytesAsync("invalid-private-engine-save"u8.ToArray(), default); }
        catch (InvalidDataException) { rejected = true; }
        if (!rejected || !ErrorBar.IsOpen) throw new InvalidDataException("Invalid private-engine save was not rejected visibly.");
        await RestoreBytesAsync(saved, default);
        await Task.Delay(400);
        if (!JsonElement.DeepEquals(normalizedState!.Value, await ReadState(await CaptureBytesAsync(default)))) throw new InvalidDataException("Retry changed the saved game state.");
        await Task.Delay(400);
        if (await _player.ExecuteScriptAsync("!!document.getElementById('twineplayer-save-operation') || document.documentElement.getAttribute('data-dialog')==='open'") != "false")
            throw new InvalidDataException("A game save dialog or temporary suppression remained open.");
        await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, mode, privateEngine = true, repeatedRestore = true, preservedSavedFields = true, addedLoadDefaults = !JsonElement.DeepEquals(expectedState, normalizedState!.Value), restoredStateSha256 = Hash(normalizedState.Value.GetRawText()), bytes = saved.Length, invalidSaveAndRetry = true, crossProcessRestore = mode == "private-sugarcube-restore" }));
    }
}
