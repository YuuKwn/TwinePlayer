# Per-game command shortcuts — UX Preview 6

Build `20261027-ux6`; product `0.9.0-phase9-test-ux6`.

## Use

1. Open a game and its Console. Save a command using the existing console actions.
2. Select the saved command and choose **Pin to sidebar…**. Give the button a short name and choose **Pin**.
3. Close the console. Tap the named sidebar button whenever you want to run the command in the current game.

Each game has one shortcut set across all its saves. Shortcuts persist in the native app database and return when the game is reopened. They appear in Compact and Comfortable profiles, with names visible in both the narrow and expanded sidebar. Longer lists scroll with the existing sidebar commands. Results remain in console history; errors also appear in the native error bar with the console closed. Running a shortcut leaves any unfinished console input intact and returns focus to the story.

To rename or unpin, select the saved command and choose **Pin to sidebar…** again. The dialog offers **Save** and **Unpin**, so these actions are available with touch. A shortcut's context menu also offers **Rename shortcut…** and **Unpin from sidebar**. Unpinning keeps the saved console command. Deleting the saved command removes its pin for the current game.

## Persistence and execution

Pins are stored as command/name pairs in the native SQLite `console-command-pins` preference, keyed by persistent library game UUID. Games with duplicate IFIDs retain separate shortcut sets, and relinking retains the UUID. Existing saved-command/import formats are retained. Deleting a saved command and its current-game pin uses a single database transaction. Invalid pin data is preserved and reported. Commands retain the existing 4096-character limit; button names allow 1–40 characters, with at most 500 pins per game.

Buttons use the existing story-JavaScript console bridge. They expose no additional native capabilities. Only a current-game pin can execute; commands are serialized while a shortcut is running, and stale results do not enter another story's console. Sidebar actions are unavailable during story opening, save/load operations and shutdown. No game HTML, engine save payload or sidecar format changes.

## Verification

- Locked restore and Release build: zero warnings/errors. All 60 native unit tests pass, including per-game pin persistence after store recreation, duplicate-IFID isolation, rename/order, unpin retention, deletion and corrupt-data preservation.
- Actual native WinUI/WebView2 UX suite: 28 layout renders, including four shortcut views. UI Automation invokes the Pin dialog and buttons in both interaction profiles; the test checks real story variable changes with the console closed, unchanged editor drafts, game switching, stale action rejection, story recreation, native error display, canceled rename, touch-accessible Unpin and saved-command deletion.
- Existing five-fixture native runtime suite covers playback, isolated storage, console, input and lifecycle behavior. Exact run reports and final portable validation are recorded in EXECUTION.md.

XAML renders were visually inspected. They exclude WebView/compositor pixels and do not certify physical touch, remote clients or screen readers. This is a marked portable test build. Earlier packages remain available.
