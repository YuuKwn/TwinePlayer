using System.Text.Json;
using Microsoft.Extensions.Logging;
using TwinePlayer.Native.Player;

namespace TwinePlayer.Native.App;

public sealed partial class MainWindow
{
    internal void ScheduleSaveSmoke(string input, string output)
    {
        var started = false;
        Root.Loaded += async (_, _) =>
        {
            if (started) return;
            started = true;
            _saveSmokeMode = true;
            try
            {
                using var settings = JsonDocument.Parse(await File.ReadAllTextAsync(input));
                var game = settings.RootElement.GetProperty("game").GetString()!;
                var mode = settings.RootElement.GetProperty("mode").GetString()!;
                var filename = settings.RootElement.GetProperty("filename").GetString()!;
                await OpenAsync(game);
                for (var i = 0; i < 100; i++)
                {
                    if (await _player.ExecuteScriptAsync("!!((window.SugarCube?.State?.passage||window.SugarCube?.state?.active?.title)&&document.querySelector('#passages .passage'))") == "true") break;
                    await Task.Delay(100);
                }
                await _player.ExecuteScriptAsync("window.__nativeSmokeState=()=>SugarCube.State||SugarCube.state;window.__nativeSmokeVars=()=>__nativeSmokeState().variables||__nativeSmokeState().active.variables;window.__nativeSmokePassage=()=>__nativeSmokeState().passage||__nativeSmokeState().active.title");
                var originalPassage = JsonSerializer.Deserialize<string>(await _player.ExecuteScriptAsync("__nativeSmokePassage()"));
                var marker = "phase2-real-game-state";
                if (mode == "native-ui")
                {
                    await ExerciseNativeSaveUiAsync(game);
                    await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, mode, firstAndRepeatedSaveLoad = true, invalidSaveAndRetry = true, nativeLoadCancelAndNewSave = true, filePickerEntryPoints = true, browserSaveAsSuppressed = true }));
                }
                else if (mode == "capture")
                {
                    await _player.ExecuteScriptAsync($"__nativeSmokeVars().__nativePhase2Marker={JsonSerializer.Serialize(marker)}");
                    // SugarCube saves passage-entry history. Commit the test variable
                    // through an engine transition before capturing its current state.
                    await _player.ExecuteScriptAsync("SugarCube.Engine?SugarCube.Engine.play(__nativeSmokePassage()):SugarCube.state.display(__nativeSmokePassage())");
                    var bytes = await CaptureBytesAsync(default);
                    await _saves.WriteAsync(game, filename, bytes, false);
                    await File.WriteAllBytesAsync(Path.Combine(Path.GetDirectoryName(input)!, "capture-payload.bin"), bytes);
                    await File.WriteAllTextAsync(Path.Combine(Path.GetDirectoryName(input)!, "expected-passage.txt"), originalPassage);
                    await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, mode, bytes = bytes.Length, passage = originalPassage, marker }));
                }
                else if (mode == "existing-save")
                {
                    const string snapshotScript = "(async()=>{const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');const passage=__nativeSmokePassage(),variables=__nativeSmokeVars();return {stateSha256:await hash(JSON.stringify({passage,variables})),passageSha256:await hash(passage),variableCount:Object.keys(variables).length,renderedCurrentPassage:document.querySelector('#passages .passage[data-passage]')?.getAttribute('data-passage')===passage};})()";
                    var before = await EvaluateAwaitedAsync(snapshotScript);
                    var bytes = await _saves.ReadAsync(game, filename);
                    await RestoreBytesAsync(bytes, default);
                    await EvaluateAwaitedAsync("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))");
                    var after = await EvaluateAwaitedAsync(snapshotScript);
                    if (before.GetProperty("stateSha256").GetString() == after.GetProperty("stateSha256").GetString() || after.GetProperty("variableCount").GetInt32() == 0 || !after.GetProperty("renderedCurrentPassage").GetBoolean()) throw new InvalidDataException("Existing export did not restore distinct state and render its current passage.");
                    await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, mode, before, after, bytes = bytes.Length, payloadSha256 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)), provenance = "Existing user export; original creating application is unverified" }));
                }
                else
                {
                    await _player.ExecuteScriptAsync("__nativeSmokeVars().__nativePhase2Marker='mutated-before-restore'");
                    if (mode == "native-dialog")
                    {
                        _testLoadRequest = new(TaskCreationOptions.RunContinuationsAsynchronously);
                        var preparation = await _bridge.PrepareNativeLoadAsync();
                        if (!TwineBridge.IsOk(preparation)) throw new InvalidDataException("The native save manager request failed.");
                        await _testLoadRequest.Task.WaitAsync(TimeSpan.FromSeconds(10));
                        if (await _player.ExecuteScriptAsync("!!window.__twinePlayerPendingLoadInput || !!SugarCube.Dialog?.isOpen?.()") != "false")
                            throw new InvalidDataException("Preparing native Load unexpectedly created a game dialog or pending file input.");
                    }
                    await RestoreBytesAsync(await _saves.ReadAsync(game, filename), default);
                    string? restored = null;
                    for (var i = 0; i < 100; i++)
                    {
                        restored = JsonSerializer.Deserialize<string>(await _player.ExecuteScriptAsync("__nativeSmokeVars().__nativePhase2Marker||null"));
                        if (restored == marker) break;
                        await Task.Delay(100);
                    }
                    var passage = JsonSerializer.Deserialize<string>(await _player.ExecuteScriptAsync("__nativeSmokePassage()"));
                    if (restored != marker)
                    {
                        var diagnostics = await _player.ExecuteScriptAsync("JSON.stringify({marker:__nativeSmokeVars().__nativePhase2Marker,passage:__nativeSmokePassage(),version:document.querySelector('tw-storydata')?.getAttribute('format-version')})");
                        throw new InvalidDataException("The real SugarCube save did not restore the expected variable: " + diagnostics);
                    }
                    var expectedPassage = await File.ReadAllTextAsync(Path.Combine(Path.GetDirectoryName(input)!, "expected-passage.txt"));
                    if (passage != expectedPassage) throw new InvalidDataException("The saved passage was not restored.");
                    var asyncFailureReported = false;
                    var asyncSuccessSettled = false;
                    if (mode == "flutter-service" && await _player.ExecuteScriptAsync("!!SugarCube.State") == "true")
                    {
                        await _player.ExecuteScriptAsync("window.__twinePlayerPendingLoadInput=null;window.Save={base64:{load:()=>Promise.reject(new Error('native-expected-load-error'))}}");
                        try { await RestoreBytesAsync("test-promise-transport"u8.ToArray(), default); }
                        catch (InvalidDataException failure) when (failure.Message.Contains("native-expected-load-error")) { asyncFailureReported = true; }
                        await Task.Delay(100);
                        if (!asyncFailureReported || !ErrorBar.IsOpen || !ErrorBar.Message.Contains("native-expected-load-error")) throw new InvalidDataException("Asynchronous load failure was not reported visibly.");
                        await _player.ExecuteScriptAsync("window.Save={base64:{load:()=>Promise.resolve()}}");
                        await RestoreBytesAsync("test-promise-transport"u8.ToArray(), default);
                        asyncSuccessSettled = true;
                    }
                    var flutterCaptureMarker = settings.RootElement.TryGetProperty("expectFlutterCaptureMarker", out var expectedFlutter) && expectedFlutter.ValueKind == JsonValueKind.True;
                    if (flutterCaptureMarker && await _player.ExecuteScriptAsync("__nativeSmokeVars().__flutterCapturedHere===true") != "true") throw new InvalidDataException("State created inside the actual Flutter runtime did not restore in native.");
                    await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, mode, marker = restored, passage, crossProcessRestore = true, flutterCaptureMarkerVerified = flutterCaptureMarker, asyncFailureReported, asyncSuccessSettled }));
                }
            }
            catch (Exception error)
            {
                _logger.LogError(error, "Native save/load smoke failed");
                await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = false, error = error.ToString() }));
            }
            finally { await RequestCloseAsync(); }
        };
    }
}
