# Native migration rules

Use the YUUKWN Git/GitHub profile. Follow `../docs/winui-native-migration-plan.md` and the user's execution instruction: produce a marked test build and notify the user at each development phase, then continue. That instruction supersedes the plan's stop-for-approval gates. Optional Phase 10, publishing, installers, signing, automatic updates, telemetry and AI services require separate authorization.

- Implement one phase at a time, on a dedicated `codex/` branch, in small reviewable commits. Check branch and user changes before each phase.
- Never delete, overwrite or refactor `flutter_app/`; it is the behavioral specification. Do not modify Electron or existing WPF work.
- Keep native implementation under this directory. Do not share writable databases or browser profiles with Flutter or WPF.
- Preserve original games, `.save` payloads and sidecars. Import is opt-in, previewed, backed up, repeatable and read-only toward source data.
- Game compatibility and save integrity take precedence over presentation. Save support is SugarCube 1/2-specific; assistance supports four verified engines.
- Use stable WinUI 3, Windows App SDK 2.5.1, .NET 10, WebView2 and official Windows APIs where appropriate. Validate dependencies against actual restore/build output; document deviations.
- Use MVVM and DI without speculative layers. App owns dialogs, Player owns runtime/bridge, Core owns models/rules and Persistence owns SQLite/import. No circular references.
- Give stories stable persistent isolated virtual origins and approved resource roots. Validate source, operation, shape and size of host messages. Deny unsolicited popups, permissions and downloads. Never expose native shell/filesystem privileges to content.
- Use cancellation, generation checks, event unsubscription and disposal for WebView lifecycle. Move filesystem/database work off the UI thread. Surface errors.
- Preserve the 50 MiB save limit. Use same-directory durable temporary writes and atomic replacement; never delete the old save before its replacement is ready. Serialize conflicting operations.
- Accessibility, focus and security apply from Phase 1. Honor theme, contrast, reduced motion and text scaling.
- After every implementation phase run restore, Release build, tests and applicable DOM/integration checks. Package a uniquely named x64 test folder/ZIP with phase/build identity, source hashes, SHA-256 manifest and test notes. Never overwrite earlier phase builds.
- Keep FEATURE_PARITY, MIGRATION, COMPATIBILITY, BENCHMARKS and phase reports current. Distinguish static, DOM, native runtime, manual and hardware evidence. Do not claim real-game, accessibility, hardware, performance superiority or clean-machine certification without corresponding tests.
- Do not replace Flutter until all mandatory parity and release gates pass. Unperformed checks remain unverified and cannot be counted as passing.

Work solo unless the user or applicable instructions explicitly request delegation.
