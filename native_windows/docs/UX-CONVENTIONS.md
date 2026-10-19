# WinUI conventions review — UX Preview 3

Date: 2026-10-18. Follow-up request: review more UX/UI conventions and apply useful improvements. The right-sidebar layout remains in place. Visible identity: **UX Preview 3**; product `0.9.0-phase9-test-ux3`; portable build ID `20261018-ux3`.

## Guidance and implemented changes

| Convention | Observed gap | Implemented result |
|---|---|---|
| Command hierarchy | Every compact icon looked like a raised action button | Transparent resting backgrounds and borders for compact controls; native hover, pressed, focus and checked states remain |
| Keyboard discoverability | Visible sidebar controls had no access keys | Native Alt keytips for sidebar actions, library search/sort and recovery controls; matching keys for dynamic Comfortable commands; visible-scope collisions checked |
| Menu grouping | More was a long flat list | Story zoom and Tools submenus, separated command groups, isolated browser reset and hints for the existing F11/zoom shortcuts |
| Dialog primary action | Settings highlighted Cancel | Apply is the primary default action in interaction and appearance settings; Cancel remains available |
| Form validity | Load was enabled without a selection; invalid filenames failed after committing | Load/Delete enable only for a selected save; Save follows filename validity live, with the existing filename rule explained beneath the field |
| Destructive actions | Save deletion, overwriting and browser reset must stay deliberate | Existing confirmation dialogs retain their safe Cancel default and validation/write protections |

Inspected Microsoft references:

- [Access keys](https://learn.microsoft.com/en-us/windows/apps/develop/input/access-keys): native keytips, meaningful mnemonic choices, visibility and avoiding collisions.
- [Keyboard interactions](https://learn.microsoft.com/en-us/windows/apps/design/input/keyboard-interactions): make supported shortcuts discoverable through the UI.
- [Dialog controls](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/dialogs-and-flyouts/dialogs): explicit primary/close actions, default-button treatment and inline validation.
- [Commanding basics](https://learn.microsoft.com/en-us/windows/apps/design/basics/commanding-basics): use native command surfaces suited to the task and input method.

The review retains the existing native material/theme/focus behavior and avoids a new framework or dependency. Access keys use WinUI's built-in mechanism. No additional global keyboard hook, plain game-key interception or new Ctrl shortcut is introduced. Existing F11 and story-zoom behavior is retained; menu text advertises those established shortcuts.

## Using the new affordances

Press Alt while using native UI to reveal available keytips. Common keys include O for Open, H for Library, S for Save, L for Load, C for Console, M for More and B for sidebar collapse/expand. Only the controls visible in the current mode participate. Library search uses Q; sorting uses T. Comfortable controls retain their full labels and touch target sizes.

Settings Apply is now visually primary. A save name must end in `.save` and satisfy the existing Windows filename rules before Save enables. Load and Delete require selection. Cancel remains available throughout. Filename, payload, atomic write, overwrite confirmation and cancellation safeguards remain enforced at the original service boundaries.

## Validation scope

Locked restore and zero-warning Release build pass; 57 unit tests pass. Six-story native runtime/input suite `native-smoke-385d64de5ea24f78b85acc2e9e0cfa33` and actual Accidental Mind capture/restore/native-dialog/Flutter SaveService suite `native-save-smoke-7075406b41bb422b97a70961961175d6` pass. Originals are read-only; tests use separate native profiles and disposable game/save copies.

The focused UX suite exercises visible access-key uniqueness in compact/Comfortable modes, real native menu groups and UI Automation labels, settings primary actions and actual Save/Load form transitions. Form tests use an authored fixture copy: select a save, correct an invalid name, clear it, cancel, and verify no additional save was written. Existing sidebar bounds, vertical placement, short-window scroll, collapse, library/search and native settings checks remain covered.

Actual XAML layout PNGs are inspected for library/sidebar/settings and save/load validation. Mica, WebView and native flyout pixels are outside this renderer's capture scope. The initial transparent menu PNGs are excluded; menu evidence uses the loaded native popup's automation tree and command structure instead. No physical Alt-key, screen-reader, remote-client or new performance certification is claimed. Exact final source/extracted reports and package checksums are recorded in EXECUTION.md.

Extract the entire portable folder and run TwinePlayer.Native.exe. Keep earlier previews for comparison and rollback. No automatic user-data import or game/save-format conversion is performed by this preview.

Delivered verification: binary source 06fd069, build 20261018-ux3; all 546 extracted hashes and ZIP checksum pass. Extracted UX/native menu UIA/form suite native-ux-345fd8fa95114d87aa556d64e6835e70, six-story runtime native-smoke-cc4dd1b40cdc4d76b2bb019401056473 and deployment native-deployment-0c9b37036731446a947eb7ea1c0ba2dd pass. Full ZIP hash and delivery record are in EXECUTION.md.
