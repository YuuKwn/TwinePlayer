# Native UX Preview 5 publication

The user approved the tested UX Preview 5 candidate, requested a PR, squash merge and release. This publication branch starts from current origin/main, preserving its Flutter changes, and imports the native snapshot through b3b9c63. Older WPF development commits and the original checkout's uncommitted WPF work are excluded.

The published ZIP is the previously tested candidate, not a relabeled rebuild. Build ID: 20261018-ux5. Binary source: d169dce17306ba43180261beea0360279dccae89. ZIP SHA-256: 95C09DCAED9535264471940C20281098ED7ECE178C29EBDC9234A75CF8CAB8A5. Product version remains 0.9.0-phase9-test-ux5 with source metadata. The release is a published GitHub prerelease because the candidate retains its 0.9 preview identity.

All native application source, project/dependency locks, fixtures, tools and embedded bridge/Input Lab assets are carried over without behavioral changes. Publication adds build-output ignore rules, LF rules for embedded scripts, native build/test CI, release notes and README links. Source correspondence is verified against the candidate; release-provenance.json records the squash commit, candidate identity and runtime source comparison. Original manifests are retained with the asset.

Candidate validation is recorded in EXECUTION.md: 58 unit tests, four-version genuine-engine and actual WebView2 save UX regressions, real-game/Flutter save compatibility, 24 XAML renders, six-story runtime/input, deployment cases and all 546 extracted hashes. The clean main-based publication checkout also receives locked restore, Release build and tests. No private games, saves, profiles, installers, signing or updater changes are distributed.

Existing main workflow run 32983481931 at 711297a failed in the legacy Electron smoke step before this PR. Its status is kept distinct from the new native Windows checks; this publication does not alter Electron to address an unrelated failure.

Publication validation: imported 128 candidate runtime/build/test/tool/embedded files with identical Git blobs and verified original source bytes. Clean-main checkout locked restore and Release build pass with zero warnings/errors; all 58 unit tests pass. Actual four-engine WebView2 first-use/native Save UI suite native-save-ui-d937496a4e484ec4ba1a099cb6fe306b passes in this checkout. Flutter and WPF paths are absent from the publication diff. Existing main Electron failure was confirmed in run 32983481931 before PR creation. User authorized PR, squash merge and release; exact tested archive is retained rather than rebuilt/rebranded.
