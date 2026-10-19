# WinUI UX refresh — Preview 1

Date: 2026-10-17. Follow-up authorized after the completed native migration. Visible identity: **UX Preview 1**; product version `0.9.0-phase9-test-ux1`. Portable build ID: `20261017-ux1`. Existing migration packages remain available.

## Design direction and references

Use Windows Fluent materials, typography and controls to establish a consistent reading-oriented app. Mica forms the persistent window surface; a lightly layered library and console create hierarchy. Native flyouts and menus supply their standard transient Acrylic treatment. Semantic theme resources and native controls retain system accent, light/dark and contrast behavior. The story remains responsible for its own colors and layout.

References inspected:

- [Mica guidance](https://learn.microsoft.com/en-us/windows/apps/design/style/mica): persistent, restrained material and content layering.
- [Acrylic guidance](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic): transient surfaces and legibility, with automatic system fallbacks.
- [Native TitleBar and Gallery example](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/title-bar): title, icon, subtitle, built-in back navigation, caption-space and drag-region handling.
- [Modern WinUI app structure](https://learn.microsoft.com/en-us/windows/apps/develop/ui/windows-app-sdk-app-structure): hierarchy, content surfaces and native application structure.
- [CommandBar guidance](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/command-bar): contextual commands and adaptive overflow.

The TitleBar sample in Microsoft's documentation includes the Gallery reference. An installed Gallery app or experimental SDK was unnecessary. The project retains its existing stable dependencies. The material treatment takes its depth and translucency from the Windows compositor and native controls; no custom refraction, continuous blur/render loop or story CSS injection was added.

## Implemented UX

| Area | Result |
|---|---|
| Window | Native TitleBar replaces the hand-spaced title grid; app identity, preview subtitle, native back button and caption/drag layout |
| Library | Layered rounded surface, clear heading, game icon tiles, title/path hierarchy and local last-played timestamps |
| Empty/search states | First-game action, no-results guidance and clear-search recovery; short windows preserve the Open action |
| Selection | Unavailable games are named explicitly; Play is disabled for a missing file; relink stays available; selected entry survives filtering when still present |
| Commands | Story-only commands disappear in the library; selection actions appear when useful; import options live in one native flyout; overflow remains native |
| Navigation | Title-bar back returns to the library; a library action remains in fullscreen where the title bar is hidden |
| Adaptive layout | Search and sorting stack below 720 DIP of available tool width; short windows reduce decorative spacing and retain a scrollable empty state |
| Reading | Status moves to a quiet footer and hides in fullscreen; game content retains its own rendering |
| Console | Layered rounded pane, clear heading, named close action and layout selector on its own row to avoid header crowding |
| Settings | Native expanders group input, touch commands, order, story display, readability and resets; command names are readable; dependent readability controls follow their enabling toggles |
| Input/accessibility | Existing focus restoration, automation names, native controls, keyboard routing and touch target preferences are retained |

## Validation and limits

Locked restore and Release build succeed without warnings/errors. All 57 existing unit tests pass. Actual six-story native runtime suite, including Accidental Mind, passes `native-smoke-583df66fc9804c0f97ff6589d6003bce`. Actual Accidental Mind capture/restore/native-dialog/unchanged Flutter SaveService roundtrips pass `native-save-smoke-2ff1f6f032c7481d9d621b4c819b9156`; originals remain read-only. Focused native UX checks cover light/dark, empty/populated/missing entries, no-result recovery, narrow/short reflow, title-bar back and actual interaction/story settings dialogs. Final source/extracted artifact IDs are recorded in EXECUTION.md.

The opt-in `tools/run-ux-smoke.ps1` creates a fresh isolated data root and authored fixture library. It writes eleven PNGs using the actual WinUI XAML renderer and checks functional state and layout bounds. This renderer cannot capture the compositor's Mica or WebView pixels. Its layout PNGs deliberately flatten the backdrop to a theme background; modal PNG surroundings are transparent. These are layout evidence, not desktop/compositor screenshots.

Desktop inspection through the computer-use tool timed out awaiting access. Two optional Windows key-injection trials (`native-smoke-c095e5639fd0423fa6d1235c1a15ac43`, `native-smoke-75d032433b5b4a7caa050db455388b13`) were refused by the foreground-ownership guard before input was sent; they are excluded from passing keyboard evidence. Native automation peers, directional dialog focus, AppWindow fullscreen/recreation and ordinary gameplay still pass in the non-injection suite. No screen-reader, remote-client, physical display or new performance certification is claimed. The prior migration waiver remains historical and does not manufacture results for this preview.

## Trying the build

Extract the entire portable folder and launch `TwinePlayer.Native.exe`. Confirm the title bar says **UX Preview 1**. Native continues to use its existing separate data root and library; this build does not convert game saves or import legacy data automatically. Review the library, search, selected-game actions, native back navigation, fullscreen and the reorganized interaction/story appearance settings. Previous r4 remains available for comparison and rollback.

Distributed preview verification: binary source f6ae3f5; all 546 extracted file hashes and ZIP checksum pass. Extracted eleven-case layout/state suite native-ux-13e770dc3c6445dd9634c5df02ca7069, six-story native suite native-smoke-82299cef317c478a83851b81aa0d6549 and deployment native-deployment-30c93759999f4988973c2686c0d2fb15 pass. User notified. Details and full checksum are in EXECUTION.md.
