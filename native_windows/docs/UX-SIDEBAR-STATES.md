# Sidebar states and console readability — UX Preview 4

Date: 2026-10-18. Requested fixes: make the sidebar switch between usable icons and icons with names, and make the overlay console readable over the story. Visible identity: **UX Preview 4**; product `0.9.0-phase9-test-ux4`; build `20261018-ux4`.

## Behavior

- The sidebar starts as an icon rail. The chevron expands it to icons plus command names; selecting Collapse returns to icons. Commands stay available in both states, including library actions, Console and More.
- Icon width is 72 DIP for Compact and 80 DIP for Comfortable targets. Expanded width is 176–200 DIP according to window width. Expansion is independent of mouse/touch profile changes and remains selected while navigating within the app session.
- Comfortable mode retains command order, optional page commands, target sizes, vertical placement, scrolling and pinned Console/More. Both presentations retain accessible names, tooltips and native Alt keytips. Expanded controls use the same quiet native button styling as the rail.
- The console uses the opaque native `ApplicationPageBackgroundThemeBrush`, replacing the translucent layer brush. Overlay and side-by-side layouts both follow the active theme; story content cannot show through the console surface. Native theme resources retain system contrast handling.
- No changes to save formats, browser identity, game files or existing preferences.

## Verification

Locked restore, Release build (zero warnings/errors), and all 57 existing unit tests pass. The focused native UX suite adds expanded library/player states, usable icon-only Comfortable commands, a meaningful width difference and fully opaque light/dark console backgrounds in overlay and docked layouts. All 24 XAML layout/form renders and actual native menu automation checks pass in `native-ux-7e7fbb1ea6504faa8e2afcffdf84ea71`.

XAML captures flatten compositor Mica and exclude WebView/native-flyout pixels; actual native state verifies background alpha 255 and distinct light/dark surface colors. Rendered states were inspected. Actual story runtime/input behavior and the extracted portable build are verified separately in EXECUTION.md. Existing manual certification boundaries remain unchanged.

Extract the entire portable ZIP and run `TwinePlayer.Native.exe`. Confirm **UX Preview 4** in the title bar. Test the chevron in the library and while playing; try the console over a bright or busy game scene. Earlier marked test packages remain available.
