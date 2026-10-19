# Fixture inventory

Reuse the checked-in offline runtimes from `../../test/fixtures/story-assistance-official/`, retaining their README/license notices. The Phase 0 inventory records current SHA-256 hashes rather than copying megabytes of identical fixtures. Preserve the existing Node/DOM tests against the unchanged Flutter bridge.

`../../test/fixtures/fake-sugarcube.html` and `minimal-twine.html` are synthetic fixtures. Do not count them as legacy SugarCube 1 or real-game certification. `../../flutter_app/assets/input_lab.html` is the offline interaction fixture to port in Phase 7.

Accidental Mind 3.4 is a user-provided local fixture at the path recorded in COMPATIBILITY.md. It is private, not bundled or committed. Its adjacent existing .save files have unverified creation provenance and cannot be labeled Flutter-created. Automated write/restore tests must work from disposable copies. Add a real SugarCube 1 fixture with licensing/provenance before final parity.
