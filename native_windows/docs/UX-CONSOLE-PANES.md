# Scrollable, resizable console lists — UX Preview 7

2026-10-26. Build `20261026-ux7`; product `0.9.0-phase9-test-ux7`.

Saved commands now appear as a vertical list in their own bordered container, matching console history. Both lists scroll independently. Long saved commands wrap within the list, and the existing Run saved, Pin to sidebar and Delete saved actions remain available below it.

Drag the horizontal grip between **History** and **Saved commands** upward to give saved commands more room, or downward to give history more room. The pointer shows the vertical resize cursor. Keyboard users can focus the divider and press Up/Down; Home/End select the minimum/maximum split. Both sections retain a minimum share of the available height. The split is retained while switching overlay/docked layouts and reopening the console during the current app session; it is not a new saved preference.

The implementation uses a native WinUI Thumb and proportional grid rows. No dependency, command storage, save format or story bridge changes. UX Preview 6 per-game shortcut behavior is retained.

The native UX suite populates 80 history entries and 50 saved commands, verifies independent vertical scrolling and running a selected command after scrolling, dispatches native drag-delta events in both directions, checks resize bounds and layout switching, and renders the console in overlay/docked and short-window layouts. These are programmatic native checks; physical mouse/touch, screen-reader and compositor certification are not inferred. Exact build, test and package evidence is in EXECUTION.md.
