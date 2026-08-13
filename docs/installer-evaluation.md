# Windows installer evaluation

Phase 10 ships a portable folder and ZIP first. The release gate is the
self-contained Flutter Windows directory produced by
`flutter_app/tool/package_windows_release.ps1`; it includes a SHA-256 manifest
and does not modify the existing Phase 0–7 artifact.

An installer is not part of this authorization. Before considering MSIX, an
MSI, or an EXE bootstrapper, evaluate the following separately:

- package identity, WebView2 runtime prerequisites, and upgrade/uninstall
  behavior on a clean Windows account;
- code-signing certificate ownership, timestamping, SmartScreen reputation,
  and rollback of a failed upgrade;
- per-user versus machine install permissions and whether save/library data
  remains in the documented app-support location;
- accessibility, DPI/multi-monitor placement, and repair behavior after a
  partially removed install;
- an offline install path and an explicit security review of every bundled
  custom action.

No installer, signing, auto-update, telemetry, or publishing claim is made by
the portable Phase 10 artifact. Approve those as separate changes only after
the portable build, manifest, and bounded smoke cycles pass.
