# Data compatibility and migration contract

**1.0 promotion:** Native is now the primary product by the user's request. No data/schema migration is introduced by the toggle/Home-confirmation/icon changes. Existing `%LOCALAPPDATA%\TwinePlayer.Native` databases and per-story browser profiles are retained; original games, sidecar saves and read-only Flutter import boundaries stay unchanged. Stable installer upgrades reuse the preview's AppId and previous install location. See RELEASE-1.0.md.

## Authorities and shapes

The Windows runner declares CompanyName `TwinePlayer contributors` and ProductName `Twine Player`. The five Flutter stores append `TwinePlayerFlutter` to path_provider's application support directory. Live inspection confirms this authority on this machine:

`C:\Users\fabio\AppData\Roaming\TwinePlayer contributors\Twine Player\TwinePlayerFlutter`

| File | Shape and semantics | Native destination |
|---|---|---|
| library-history.json | Array of `{path,title,lastPlayed}`; UTC ISO timestamps. Nonempty path required, title falls back to filename, invalid date uses import fallback; duplicates keep newest timestamp. | Games table with persistent ID, original timestamps and path |
| console-commands.json | Object mapping arbitrary story keys to trimmed nonempty string arrays. Normally IFID, otherwise `fallback_<Dart path.hashCode>`. Preserve unknown keys verbatim. | Saved commands keyed by IFID/native ID, plus retained unmapped legacy keys |
| preferences.json | `{version:1,interactionProfile:"auto"|"comfortable"|"compact"}`; malformed profile becomes Auto. | AppPreferences |
| command-bar-preferences.json | `{version:1,preferences:{alignment,order,size,reach,pageUpEnabled,pageDownEnabled}}`; bare preference objects also accepted. | AppPreferences |
| story-assistance.json | `{version:2,games:{<absolute normalized lowercase path>:<preferences>}}`; version 1 shares map shape, known fields read conservatively. | StoryPreferences associated through original path/native ID |

Four files currently exist here; command-bar-preferences.json is absent and must use defaults. Do not infer that a missing file is a broken installation. Do not include private user records in committed fixtures/reports.

Story assistance fields: zoomFactor 0.75–1.75; enhancedChoices false; readabilityEnabled false; textScale 0.9–1.3 (default 1); lineHeight 1.1–2 (1.4); paragraphSpacing 0.5–2 (1); readableLineLengthEnabled false; readableLineLength 45–90 (72); targetSpacing 0.75–1.75 (1). Bound valid persisted values without snapping them to slider steps.

Command IDs: back, undo, save, load, pageUp, pageDown, console, more. Default omits both page controls. Normalize duplicates/unknown IDs; Console and More stay pinned at the end. Alignment start/center/end defaults center; size small/standard/large defaults standard (legacy compact/comfortable aliases); reach left/balanced/right defaults balanced. Auto changes on activation, not hover, with 350 ms anti-flap.

## Sidecars and engine payloads

UX Preview 5 uses native-only Save/Load managers over engine disk APIs. It no longer prepares the game's Saves window to load a file. Engine-format bytes, save permissions, callbacks and file integrity rules remain authoritative. Operation-scoped error handling replaces legacy game save alerts; standard picker/menu and browser Save As routes use native UI. See UX-NATIVE-SAVES.md for behavior and evidence boundaries.

`<game-directory>\<HTML filename without .html/.htm>_saves\<filename>.save` is authoritative, independent of SQLite. Native must read existing files in place without converting them. File lists sort newest first and display filename, modification time and size. Payload maximum is 50 * 1024 * 1024 bytes; reject empty, null-only, oversized, malformed, missing and invalidly named saves visibly. Filenames must be plain Windows filenames ending in .save; reject traversal, NUL/control characters, reserved device names and invalid Windows characters.

The document-created Flutter bridge is the format specification: SugarCube 2 Save.base64.save, legacy Save.serialize and native export interception; SugarCube 1 window.save.serialize. Loading uses supported base64 load/decode/import, deserialize/state paths, native file-input preparation and promises. Do not wrap compatible payloads in a new native envelope or serialize the HTML DOM as a save. Harlowe/Chapbook/Snowman save support is not promised.

Current overwrite writes and flushes a temporary sibling, deletes the destination, then renames: a failure between deletion and rename loses the old save. Native must use File.Replace for existing files and atomic same-directory move for new files, serialize overlapping operations, preserve prior valid data on failure and clean only app-owned stale temporary files older than 24 hours. Check read length before and after reading to enforce the limit.

## Browser data is separate

Vendored `webview_platform.cc:GetDefaultDataDirectory` returns `%LOCALAPPDATA%\flutter_webview_windows\<executable-stem>`, normally `C:\Users\fabio\AppData\Local\flutter_webview_windows\twine_player_flutter`. This is determined from the executable filename, independently of the roaming JSON root. Flutter initializes the controller without a custom profile and maps each selected directory at `https://twineplayer.local/<filename>` with Allow access. Stories therefore share the same browser origin/storage authority.

Native uses `%LOCALAPPDATA%\TwinePlayer.Native\` with its own database, logs and WebView profile; tests override the root. A persistent UUID identifies each story and yields `https://story-<uuid>.twineplayer.local/`. Relink preserves UUID and origin. Duplicate IFIDs alone must not merge unrelated stories. Use DenyCors folder mapping for same-origin resource access; verify relative scripts/styles/media in native integration tests.

Phase 3 storage: native-library.db is authoritative. Schema 1 adds Games.PathKey for deduplication while retaining FilePath and Games.Removed for Undo without losing IDs/settings. Earlier native story-identities.json is read transactionally once, remains untouched and retains its IDs; new identities are then written only to SQLite. Earlier native binaries do not read this library. Explicit Flutter snapshots live under migrations/<timestamp>-<id>/ with source-hashes.json and report.json. Unknown commands/unmapped preferences remain in legacy JSON values. Repeat imports do not overwrite native values. Browser-origin transfer is a separate opt-in Phase 9 operation.

Browser origin changes do not automatically migrate localStorage, IndexedDB or cookies. In the library select the receiving game and choose **Import browser data**. Close Flutter and other native windows first. The selected folder must contain `EBWebView/Local State`. Source files are read only: native creates a byte/hash-verified `original` backup and a separate `working` profile under `migration-backups/b-<id>/`. Only the working copy is opened with a trusted offline migration page at the legacy origin. No game script runs there. WebView2 user-data environment/policy overrides disable this operation. Source changes during copying or before import abort the transfer.

Preview lists localStorage keys, IndexedDB databases and matching cookies. Nothing is selected initially. Flutter's shared origin cannot identify a game's data reliably: explicitly select the relevant items for the receiving native game. Import skips existing native keys, entire databases and cookies with the same name/path. It preserves IDB versions, stores, indexes, keys, generators and supported structured-clone value graphs. Snapshot JSON and completion/failure reports remain beside the original backup. A failure/cancel can leave completed **new** items; existing items are retained and retry skips those completed items.

Limits: selected snapshot JSON is capped at 128 MiB. Unsupported structured-clone types fail visibly; partitioned cookies are unsupported. Session storage, service-worker/cache contents, other origins and automatic per-game association are not transferred. Encrypted production cookies and historical profile versions are not certified by the fixture. Long custom data-root paths can exceed Chromium's backing-store path limits; use a shorter native data root if opening a copied database fails. Do not delete either application or its source profile based on these tests.

Actual runtime evidence: `native-browser-migration-64e7a791643d4c6080ed2ee0fe083f1a/report.json` passed copied-profile localStorage, IDB Date/typed array/Blob/Map/Set/cyclic graph, unique index and next-key preservation, secure HttpOnly path-cookie transfer, conflict retention and idempotence. Accidental Mind loaded the migrated browser slot and restored the expected variable. Original profile hashes remained unchanged. This is controlled fixture evidence; production import is opt-in and unperformed.

## Opt-in importer protocol (Phase 3)

1. Preview the selected Flutter root, valid/invalid/skipped counts and import destinations without writes.
2. Snapshot original JSON bytes into a native migration backup with SHA-256, timestamp and source paths. Source access remains read-only.
3. Validate/normalize entries; retain original path and date strings in the report when correction is needed.
4. Transactionally import into versioned SQLite Games, AppPreferences and StoryPreferences tables. Use normalized path identity and retained import keys for idempotence. Re-import cannot silently overwrite newer native edits.
5. Store unmapped command keys; report ambiguous associations. Preserve relink identity/settings and don't relocate sidecars implicitly.
6. Persist imported/skipped/invalid report and snapshot identity. Fresh installations work with no Flutter data.

Rollback: close native, reopen the unchanged Flutter executable. JSON files, original browser profile, game HTML and sidecars remain in place. New native browser progress is not reverse-synchronized: export a sidecar save before switching. Actual Accidental Mind native-created payload restored through the unchanged Flutter bridge with exact passage/variable and unchanged payload hash (`flutter-rollback-8c33cd29-4daa-4393-a8b8-5bcf21da67ed`). Genuine SugarCube 1.0.35 native payload restored in the actual Flutter browser through the game's own disk-import API (`flutter-rollback-99c2356e-178d-4711-8f17-41dc6fb7ac45`); the unchanged Flutter host bridge reports that engine as unknown (`flutter-rollback-18aac312-3611-487d-8920-b6e95580c435`). For that legacy runtime use the game's Saves → Import control. Do not claim Flutter's host Load button supports it. No Flutter source was modified.

Additional direction/provenance checks: `flutter-rollback-fdd4851a-71ff-4c6c-a469-902b62b3b60e` loaded the game in the unchanged actual Flutter player, created a new variable inside that runtime, captured through its unchanged bridge, wrote the payload through unchanged Flutter SaveService, and restored it in native with the extra variable verified. This proves an actual Flutter producer, beyond merely writing native-produced bytes through Flutter's file service. Separately, `native-existing-save-271f64dd81d34c0085cad5f5d0dd3d71` restored a 204,888-byte existing user export in a copied game, changed the initial state to a distinct state and rendered the restored current passage. Original HTML/export and copied payload SHA-256 remained unchanged. The older export's original creating application is unknown; no historical GUI provenance is invented. Reports retain hashes/counts instead of private variable contents.

Browser profile isolation (r4): story opening and the trusted migration workspace refuse WEBVIEW2_USER_DATA_FOLDER or applicable WebView2 UserDataFolder policies before environment creation, and verify the returned folder before controller creation. Remove the environment redirect or have the administrator resolve the applicable policy, then restart. No host policy is modified. Original profiles must still be closed, previewed and copied before opt-in import; see PHASE-9.md for verified disposable-profile evidence.

Version 1.1 stores per-game pins in the native AppPreferences database keyed by library UUID. Console commands, game files, save payloads and sidecars retain their existing formats; pane sizes are session-only. See RELEASE-1.1.md.
