using System.Text;
using System.Text.Json;
using TwinePlayer.Native.Core;

namespace TwinePlayer.Native.Player;

public interface IStoryScriptHost
{
    Task<string> ExecuteScriptAsync(string script, CancellationToken token = default);
}

public sealed record CaptureResult(byte[]? Bytes, bool Pending, string? Error);

public sealed class TwineBridge(IStoryScriptHost host)
{
    public static string Script
    {
        get
        {
            using var stream = typeof(TwineBridge).Assembly.GetManifestResourceStream("TwinePlayer.Native.Bridge.js")!;
            using var reader = new StreamReader(stream, Encoding.UTF8);
            return reader.ReadToEnd() + CompletionAdapter + NativeSaveScript + NativeInputBridge.Script;
        }
    }

    // Keep the shared Flutter payload unchanged; native save presentation and
    // operation-correlated completion live in a separate embedded adapter.
    private static string NativeSaveScript
    {
        get
        {
            using var stream = typeof(TwineBridge).Assembly.GetManifestResourceStream("TwinePlayer.Native.NativeSaves.js")!;
            using var reader = new StreamReader(stream, Encoding.UTF8);
            return reader.ReadToEnd();
        }
    }
    private const string CompletionAdapter = """
        ;(()=>{
          window.__twinePlayerNativeReadImage=async function(source,id){
            try{
              const response=await fetch(source);if(!response.ok)throw new Error('Image request failed: '+response.status);
              const reader=response.body.getReader(),chunks=[];let total=0;
              try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>50*1024*1024)throw new Error('Image exceeds 50 MiB.');chunks.push(part.value);}}
              finally{await reader.cancel();}
              const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
              window.__twinePlayerPost({type:'image-data',operationId:id,bytes:Array.from(bytes)});
            }catch(error){window.__twinePlayerPost({type:'image-data',operationId:id,error:String(error&&error.message||error).slice(0,4096)});}
          };
        })();
        """;

    public async Task<CaptureResult> CaptureAsync(CancellationToken token = default, string? operationId = null)
    {
        var json = await ExecuteObjectAsync($"JSON.stringify(window.__twinePlayerCaptureSave({JsonSerializer.Serialize(operationId)}))", BridgeMessages.MaxEnvelopeBytes, token);
        if (!IsOk(json)) return new(null, false, Error(json));
        if (json.TryGetProperty("pending", out var pending) && pending.ValueKind == JsonValueKind.True) return new(null, true, null);
        if (!json.TryGetProperty("data", out var payload) || payload.ValueKind != JsonValueKind.String) throw new InvalidDataException("Save capture returned no game state.");
        var bytes = Encoding.UTF8.GetBytes(payload.GetString()!);
        SaveRules.ValidatePayload(bytes);
        return new(bytes, false, null);
    }

    public async Task<JsonElement> RestoreAsync(byte[] bytes, string operationId, CancellationToken token = default)
    {
        SaveRules.ValidatePayload(bytes);
        var text = new UTF8Encoding(false, true).GetString(bytes);
        return await ExecuteObjectAsync($"window.__twinePlayerNativeLoadId={JsonSerializer.Serialize(operationId)};JSON.stringify(window.__twinePlayerRestoreSave({JsonSerializer.Serialize(text)}))", 16 * 1024, token);
    }
    public Task<JsonElement> PrepareNativeLoadAsync(CancellationToken token = default) => ExecuteObjectAsync("JSON.stringify(window.__twinePlayerPrepareNativeLoad())", 16 * 1024, token);
    public async Task<AssistanceStatus> ApplyAssistanceAsync(StoryAssistancePreferences preferences, CancellationToken token = default)
    {
        var config = preferences.Normalized;
        var json = JsonSerializer.Serialize(new { enabled = config.ReadabilityEnabled, config.TextScale, config.LineHeight, config.ParagraphSpacing, config.ReadableLineLengthEnabled, config.ReadableLineLength, config.TargetSpacing }, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var script = "JSON.stringify((()=>{const detected=window.__twinePlayerDetectReadabilityEngine();window.__twinePlayerSetEnhancedChoices(" + (config.EnhancedChoices ? "detected.verified" : "false") + ");const result=window.__twinePlayerSetStoryAssistance(" + json + ");return {...result,engine:detected.engine,verified:detected.verified};})())";
        var result = await ExecuteObjectAsync(script, 16 * 1024, token);
        bool Flag(string key) => result.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.True;
        string Text(string key) => result.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() ?? "" : "";
        return new(Text("engine"), Flag("verified"), Flag("enabled"), Flag("stylePresent"), Flag("observerPresent"), result.TryGetProperty("markedCount", out var count) && count.TryGetInt32(out var value) ? Math.Clamp(value, 0, 100000) : 0, Text("reason"));
    }
    public async Task<string> RunCommandAsync(string command, CancellationToken token = default)
    {
        command = command.Trim();
        if (command.Length is 0 or > 4096) throw new ArgumentException("Enter a JavaScript command up to 4096 characters.");
        var result = await ExecuteObjectAsync($"JSON.stringify(window.__twinePlayerRunCommand({JsonSerializer.Serialize(command)}))", 256 * 1024, token);
        if (!IsOk(result)) throw new InvalidOperationException(Error(result));
        return result.TryGetProperty("result", out var value) && value.ValueKind == JsonValueKind.String ? value.GetString()! : throw new InvalidDataException("Command returned a malformed result.");
    }
    public async Task<IReadOnlyList<string>> CompleteAsync(string input, CancellationToken token = default)
    {
        if (input.Length > 4096) return [];
        var raw = await host.ExecuteScriptAsync($"JSON.stringify(window.__twinePlayerCompletions({JsonSerializer.Serialize(input)}))", token);
        if (raw.Length > 128 * 1024) throw new InvalidDataException("Completion response is oversized.");
        using var outer = JsonDocument.Parse(raw);
        using var list = JsonDocument.Parse(outer.RootElement.ValueKind == JsonValueKind.String ? outer.RootElement.GetString()! : raw);
        if (list.RootElement.ValueKind != JsonValueKind.Array) return [];
        return list.RootElement.EnumerateArray().Where(v => v.ValueKind == JsonValueKind.String).Select(v => v.GetString()!).Where(s => s.Length <= 512).Take(50).ToArray();
    }
    public static bool IsOk(JsonElement json) => json.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True;
    public static string Error(JsonElement json) => json.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.String ? error.GetString()! : "The game rejected the operation or does not expose a supported SugarCube save API.";

    private async Task<JsonElement> ExecuteObjectAsync(string script, int limit, CancellationToken token)
    {
        var raw = await host.ExecuteScriptAsync(script, token);
        if (raw.Length > limit || Encoding.UTF8.GetByteCount(raw) > limit) throw new InvalidDataException("Story response exceeds its bounded limit.");
        using var outer = JsonDocument.Parse(raw);
        var text = outer.RootElement.ValueKind == JsonValueKind.String ? outer.RootElement.GetString() : raw;
        using var json = JsonDocument.Parse(text ?? "null", new JsonDocumentOptions { MaxDepth = 16 });
        if (json.RootElement.ValueKind != JsonValueKind.Object) throw new InvalidDataException("Story returned a malformed save response.");
        return json.RootElement.Clone();
    }
}
