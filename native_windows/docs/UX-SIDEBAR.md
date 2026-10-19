# Right sidebar — UX Preview 2

Date: 2026-10-18. Requested follow-up: move app controls from the top/bottom to the right edge. Visible identity: **Right sidebar · UX Preview 2**. Product version: `0.9.0-phase9-test-ux2`. Build ID: `20261018-ux2`. Prior UX Preview 1 and migration r4 packages remain available.

## Layout and behavior

- Player commands, app menus, library selection/import actions, loading and status now live in the right sidebar. The main content uses the available height beneath the native window caption; there is no top or bottom command bar.
- Compact mode uses a 72 DIP icon rail with named controls and tooltips. Comfortable mode uses larger labelled buttons in a rail up to 184 DIP wide, bounded on narrow windows.
- The chevron collapses either mode to 56 DIP and remains available to expand it. Returning to the library restores focus to the visible sidebar control when collapsed.
- Both modes scroll vertically in short windows. Comfortable Console and More remain pinned below the scrolling commands. More always provides library navigation during gameplay, including when a customized command order omits Library.
- Comfortable command placement is Top, Center or Bottom. The existing alignment preference is applied vertically; command order, target sizes and optional page commands remain supported. Historical left/right reach values are preserved in storage for compatibility; this requested layout always uses the right edge.
- The sidebar stays on the right in fullscreen. The native title bar retains Windows window controls in windowed mode; its app back button is hidden because Library navigation is in the sidebar.
- Search, sorting and the empty-library action remain part of library content. Error notifications remain transient overlays, so a narrow icon rail does not squeeze error details into unreadable lines.
- The developer console opens beside the rail within the content area. Story files, browser identity, user data and save formats retain their existing contracts.

## Verification

Locked restore and Release build pass without warnings/errors. All 57 existing unit tests pass. The six-story native suite, including Accidental Mind, passes `native-smoke-dad5b7cf9ddf49759146e15b9405a2b9`. Real-game capture/restore/native-dialog/Flutter SaveService checks pass `native-save-smoke-57442ecb6c9b4ee9be5345ce442a7ba6` using disposable copies.

Native layout/state suite `native-ux-fd500ebd4bce4fc39f5b89aed3b2ee63` passes fifteen XAML renders: prior library/settings cases plus compact, Comfortable, short and collapsed player sidebars. It verifies actual right-edge/full-height bounds, vertical command placement, short-window scroll access, retained expand control, native sidebar library navigation, and two root rows rather than toolbar/footer rows. Native input tests verify trusted mouse/touch profile changes, vertical command order, pins, target sizes and collapse behavior.

The renderer excludes compositor Mica and WebView pixels; player-layout PNGs therefore leave the story surface blank. They verify the controls' layout, not game rendering. Actual game rendering is covered separately by the native runtime suite. No new physical keyboard, remote-client, screen-reader or performance certification is claimed.

Extracted portable-build hashes and runtime/layout evidence are recorded in EXECUTION.md after packaging. Extract the whole folder and run TwinePlayer.Native.exe; confirm **UX Preview 2** in the title bar. The sidebar chevron and interaction settings let you test compact, labelled touch and collapsed states.

Delivered artifact: source a6a68f6, build 20261018-ux2. All 546 extracted file hashes and ZIP checksum pass. Extracted layout suite native-ux-bc69b94f9b2944bcbe7cf3db96cf5036, six-story native suite native-smoke-7ea3d95ba06d4c22a4de8dbad7aaad38 and deployment suite native-deployment-a26688b879e24266a55bfb45aa96d56d pass. Exact ZIP hash and notification record are in EXECUTION.md.
