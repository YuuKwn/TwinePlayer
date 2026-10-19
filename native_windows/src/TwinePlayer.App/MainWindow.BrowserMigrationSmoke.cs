using System.Text.Json;
using TwinePlayer.Native.App.Services;
using TwinePlayer.Native.Core;
using TwinePlayer.Native.Persistence;
namespace TwinePlayer.Native.App;
public sealed partial class MainWindow
{
    internal void ScheduleBrowserMigrationSmoke(string input, string output)
    {
        var started = false;
        Root.Loaded += async (_, _) =>
        {
            if (started) return; started = true;
            try
            {
                using var settings = JsonDocument.Parse(await File.ReadAllTextAsync(input));
                var source = settings.RootElement.GetProperty("sourceProfile").GetString()!;
                var gamePath = settings.RootElement.GetProperty("game").GetString()!;
                var game = await _database.RegisterAsync(gamePath, await GameMetadataReader.ReadAsync(gamePath));
                var snapshot = await BrowserProfileSnapshot.CreateAsync(source, Path.Combine(_database.Root, "migration-backups"));
                string json; JsonElement cookies; JsonElement sourceCatalog;
                using (var legacy = await BrowserStorageWorkspace.OpenAsync(Viewport, snapshot.WorkingProfile, "twineplayer.local", default))
                {
                    sourceCatalog = await legacy.CatalogAsync(); cookies = await legacy.CookiesAsync();
                    if (!sourceCatalog.GetProperty("databases").EnumerateArray().Any(item => item.GetProperty("name").GetString() == "__nativeMigrationFixture")) throw new InvalidDataException("Legacy fixture database was not found.");
                    json = await legacy.ExportAsync(sourceCatalog.GetProperty("localStorage").EnumerateArray().Select(item => item.GetProperty("name").GetString()!).ToArray(), sourceCatalog.GetProperty("databases").EnumerateArray().Select(item => item.GetProperty("name").GetString()!).ToArray());
                    await File.WriteAllTextAsync(Path.Combine(snapshot.BackupDirectory, "selected-storage.json"), json);
                }
                JsonElement imported, idempotent, verified; var cookieImported = false;
                using (var target = await BrowserStorageWorkspace.OpenAsync(Viewport, Path.Combine(_database.Root, "WebView2"), game.Identity.HostName, default))
                {
                    await target.EvaluateAsync("localStorage.setItem('__nativePreserved','native-value');true");
                    imported = await target.ImportAsync(json);
                    verified = await target.EvaluateAsync("(async()=>{const r=indexedDB.open('__nativeMigrationFixture');const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const tx=db.transaction('records','readonly'),get=tx.objectStore('records').get(1);const v=await new Promise((resolve,reject)=>{get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);});const index=db.transaction('records','readonly').objectStore('records').index('byName');const countRequest=index.count('fixture');const count=await new Promise(resolve=>countRequest.onsuccess=()=>resolve(countRequest.result));const probe=db.transaction('records','readwrite');const add=probe.objectStore('records').add({name:'probe'});const next=await new Promise((resolve,reject)=>{add.onsuccess=()=>{const key=add.result;probe.onabort=()=>resolve(key);probe.abort();};add.onerror=()=>reject(add.error);});const blob=await v.blob.text();db.close();return {marker:localStorage.getItem('__nativeBrowserMigration'),preserved:localStorage.getItem('__nativePreserved'),typed:v.date instanceof Date&&v.date.toISOString()==='2020-02-03T04:05:06.000Z'&&v.bytes instanceof Uint8Array&&v.bytes.join(',')==='1,2,3'&&blob==='blob-payload'&&v.map.get('answer')===42&&v.set.has('two')&&v.self===v,index:count,next};})()");
                    if (verified.GetProperty("marker").GetString() != "legacy-value" || verified.GetProperty("preserved").GetString() != "native-value" || !verified.GetProperty("typed").GetBoolean() || verified.GetProperty("index").GetInt32() != 1 || verified.GetProperty("next").GetInt32() != 3) throw new InvalidDataException("Migrated typed data/index/generator or native conflict preservation failed: " + verified);
                    var cookie = cookies.EnumerateArray().Single(item => item.GetProperty("name").GetString() == "native-migration-cookie");
                    cookieImported = await target.AddCookieIfAbsentAsync(cookie);
                    var restored = (await target.CookiesAsync()).EnumerateArray().Single(item => item.GetProperty("name").GetString() == "native-migration-cookie");
                    if (!cookieImported || restored.GetProperty("value").GetString() != "cookie-value" || restored.GetProperty("path").GetString() != "/subpath" || !restored.GetProperty("httpOnly").GetBoolean() || !restored.GetProperty("secure").GetBoolean()) throw new InvalidDataException("Cookie value/path/security did not survive migration.");
                    idempotent = await target.ImportAsync(json);
                    if (idempotent.GetProperty("imported").GetArrayLength() != 0 || await target.AddCookieIfAbsentAsync(cookie)) throw new InvalidDataException("Repeated migration overwrote existing native items.");
                }
                await BrowserProfileSnapshot.VerifySourceAsync(snapshot);
                await OpenAsync(gamePath);
                await EvaluateAwaitedAsync("(async()=>{const s=SugarCube.Save||window.Save;if(s.browser?.slot?.load)await s.browser.slot.load(0);else if(s.slots?.load)s.slots.load(0);else throw new Error('No browser slot load API');return true;})()");
                var marker = await _player.ExecuteScriptAsync("SugarCube.State.variables.__nativePhase2Marker");
                if (marker != "\"phase2-real-game-state\"") throw new InvalidDataException("Actual SugarCube progress did not load from migrated browser storage: " + marker);
                await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = true, sourcePreserved = true, backup = snapshot.BackupDirectory, sourceCatalog, imported, idempotent, verified, cookieImported, actualSugarCubeBrowserSaveLoaded = true }, new JsonSerializerOptions { WriteIndented = true }));
            }
            catch (Exception error) { await File.WriteAllTextAsync(output, JsonSerializer.Serialize(new { passed = false, error = error.ToString() })); }
            finally { await RequestCloseAsync(); }
        };
    }
}
