# Private SugarCube saves — UX Preview 8

Silent Echo v0.4.4 identifies itself as SugarCube 2.36.1, but its modified engine does not expose `window.SugarCube` or `window.Save`. It also removes story metadata after startup. The previous native bridge therefore reported an unknown save engine even though the game's standard export/import handlers worked.

The native-only fallback remembers the declared format before metadata disappears and invokes the existing standard Saves menu and disk export/import controls. During native operations the engine dialog stays hidden; ordinary Save/Load presentation remains native. No engine namespace is recovered or injected. Game source, save serialization, load hooks, sidecar layout, size limits and atomic replacement remain under their existing owners.

Legacy import completion follows the actual save FileReader, including imports deferred until the game dialog closes. The temporary reader wrapper recognizes only the supplied in-memory file and is restored after completion, cancellation or failure. Private-engine completion requires a newly rendered passage. Invalid/foreign saves and engine errors remain visible in native UI. Older menus may silently omit disallowed export handlers; those operations fail through the existing 14-second timeout without capturing a save.

## Verification

- Locked restore and Release build pass with zero warnings/errors; all 60 existing native unit tests pass.
- Genuine-engine Chromium regressions pass for SugarCube 1.0.35, 2.18.0 and a 2.18.0 fixture whose public namespace is hidden. They cover first/repeated restoration, invalid/foreign saves, retry, denied saves, prompt preservation, and input/label/showPicker routing with zero browser downloads or file pickers. Report: `artifacts/native-save-dom-fe739482-eb95-4726-8512-d6f5497eb642/report.json`.
- Existing actual WinUI/WebView2 native Save/Load UI tests pass for SC1 and SC2, including cancel/create-new flows, errors, menu/input routing and browser Save As suppression. Reports: `artifacts/native-save-ui-923292890f7a43f894e10a10d398f23f/`.
- Actual unmodified Silent Echo HTML passes native capture and restore in two processes with separate fresh profiles. Each process repeats restoration, rejects an invalid save visibly, retries successfully, and checks dialog cleanup. All original saved fields survive; repeated restored states agree. The game adds a missing `gwen_passwords` default in its own load hook, so byte-for-byte equality of a re-export is not claimed. Reports: `artifacts/native-private-sugarcube-8528dda06e864893bba4ceaf1031923b/`.
- The smoke runner copies HTML and startup scripts/styles into ignored artifacts. Original HTML SHA-256 is checked after the run. Original games, saves and browser profiles are not written. Private game files and generated saves are excluded from the portable package.

Run against an authorized private game with its own start-action selectors:

```powershell
.\native_windows\tools\run-private-sugarcube-smoke.ps1 -RealStory 'C:\Games\Game\index.html' -StartSelectors '.adultwarning .link-internal','button[data-passage="Intro"]'
```

## Delivery and boundaries

Build `20261027-ux8`, product `0.9.0-phase9-test-ux8`, is a separate marked x64 portable test package. Use the app's Save and Load buttons normally; saves remain beside the selected HTML in its usual `_saves` folder. Existing test packages remain available.

This fallback requires declared SugarCube 2 metadata and the standard engine menu, export button and import input. Arbitrary custom menus, bundles, other story engines and private-engine console commands are not covered. Testing uses an early-game save and omits large media: full-playthrough, media playback, physical input, streaming clients and accessibility certification are NOT CERTIFIED.
