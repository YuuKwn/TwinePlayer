# Flutter 3.47 P0 certification evidence

**Status:** automated evidence complete; physical, visual, accessibility, WebView
content, and hardware cells remain **NOT CERTIFIED**.

**Run date:** 2026-08-25
**Repository:** YuuKwn/TwinePlayer
**Source commit:** 236194855836844cb9537263864fa80d0b858cc4
**Origin:** https://github.com/YuuKwn/TwinePlayer.git
**Delivery branch:** codex/flutter-347-p0-certification

This is an evidence-only pass. No application source, vendored WebView
implementation, legacy Electron source, or test was changed. Generated
dependency/build/package output is ignored and is not part of this PR.

## Toolchain and host facts

- Flutter: 3.47.0 stable, framework revision
  4cf24164269a5ebf0c16a028a00727d0e77bbb05.
- Engine: hash 59d54a2b2896a6bbf356c94b7fac7b9e235bdacd, revision
  5f77625673.
- Dart: 3.13.0; DevTools: 2.60.0.
- Flutter SDK checkout: C:\Users\fabio\development\flutter at framework commit
  4cf24164269a5ebf0c16a028a00727d0e77bbb05. Its pre-existing sparse/deleted
  files were not modified.
- Windows: Windows 10 Pro 25H2, version 10.0.26200.9267, x64.
- Visual Studio Build Tools: 17.14.37314.3; MSVC
  19.44.35227.0; Windows SDK 10.0.26100.0 targeting Windows 10.0.26200.
- Locked Flutter app version: 1.0.0+10; locked SDK constraints are Dart
  >=3.13.0 <4.0.0 and Flutter >=3.47.0.
- Installed WebView2 Runtime facts: registry reports
  Microsoft Edge WebView2 Runtime 151.0.4129.107. The observed binaries were
  151.0.4129.107 and 151.0.4129.86 under
  C:\Program Files (x86)\Microsoft\EdgeWebView\Application.
- Build-time WebView2 SDK: Microsoft.Web.WebView2 1.0.1210.39; the packaged
  WebView2Loader.dll reports 1.0.1210.39.
- Display adapters enumerated on the host: AMD Radeon(TM) Graphics driver
  32.0.21030.31, NVIDIA GeForce RTX 5070 Ti driver 32.0.16.1088, plus Virtual
  Desktop Monitor, Meta Virtual Monitor, Parsec Virtual Display Adapter,
  SudoMaker Virtual Display Adapter, and Sunshine Virtual Display Driver.
  Enumeration is host inventory only; no adapter/client certification was run.

## Automated gates

| Gate | Result |
| --- | --- |
| Clean attribution | PASS: detached base was exactly source commit and origin/main; final pre-documentation status was clean. |
| Flutter dependency resolution | PASS: pub get completed; 21 packages reported newer versions incompatible with the pinned constraints. |
| Flutter analyzer | PASS: No issues found; 5.5 seconds. |
| Full Flutter tests | PASS: 67/67. |
| Vendored webview_windows tests | PASS: 7/7. |
| Windows release build | PASS: release EXE produced; concise confirmation exit code 0. |
| Package copy, manifest, ZIP verification | PASS: 26 files, exact hash parity, ZIP extraction/hash verification. |
| Package smoke cycles | PASS: 3/3, each process closed with exit code 0. |
| Root Node unit suite | PASS: 132/132. |
| Root Flutter bridge DOM suite | PASS. |
| Root Story Assistance DOM suite | PASS: Harlowe, SugarCube, Chapbook, Snowman, unknown-format no-mutation, and save-capture paths. |
| Root Windows resilience suite | PASS: fullscreen/DPI source contract. |

## Exact validation commands

The Flutter commands used the pinned direct entrypoint because the wrapper
needed SDK lockfile access unavailable in the normal sandbox. Commands were
run from the stated working directory.

From flutter_app:

~~~powershell
& 'C:\Users\fabio\development\flutter\bin\cache\dart-sdk\bin\dart.exe' 'C:\Users\fabio\development\flutter\packages\flutter_tools\bin\flutter_tools.dart' --no-version-check pub get
& 'C:\Users\fabio\development\flutter\bin\cache\dart-sdk\bin\dart.exe' 'C:\Users\fabio\development\flutter\packages\flutter_tools\bin\flutter_tools.dart' --no-version-check analyze --no-pub
& 'C:\Users\fabio\development\flutter\bin\cache\dart-sdk\bin\dart.exe' 'C:\Users\fabio\development\flutter\packages\flutter_tools\bin\flutter_tools.dart' --no-version-check test --no-pub
& 'C:\Users\fabio\development\flutter\bin\cache\dart-sdk\bin\dart.exe' 'C:\Users\fabio\development\flutter\packages\flutter_tools\bin\flutter_tools.dart' --no-version-check build windows --release --no-pub -v
& 'C:\Users\fabio\development\flutter\bin\cache\dart-sdk\bin\dart.exe' 'C:\Users\fabio\development\flutter\packages\flutter_tools\bin\flutter_tools.dart' --no-version-check build windows --release --no-pub
& .\tool\package_windows_release.ps1 -SkipBuild -SmokeCycles 3
~~~

The verbose build trace observed CMake configuration, D3D texture support,
MSVC compilation, and the release output. The concise repeat ended with exit
code 0 and built
build\windows\x64\runner\Release\twine_player_flutter.exe. The trace also
reported the non-failing CMake CMP0175 developer warning and the script's
automatic NuGet bootstrap.

From flutter_app/vendor/webview_windows:

~~~powershell
& 'C:\Users\fabio\development\flutter\bin\cache\dart-sdk\bin\dart.exe' 'C:\Users\fabio\development\flutter\packages\flutter_tools\bin\flutter_tools.dart' --no-version-check test --no-pub
~~~

From the repository root:

~~~powershell
npm ci --no-audit --no-fund
npm test
npm run test:flutter-bridge-dom
npm run test:flutter-story-assistance
npm run test:windows-resilience
~~~

The first non-elevated npm test attempt stopped before loading repository code
with Node EPERM while resolving C:\Users\fabio. The unchanged command was
retried with the required elevated filesystem access and passed 132/132.

## Build and package hashes

Package directory:
C:\Users\fabio\.codex\worktrees\c046\TwinePlayer\artifacts\TwinePlayer-touch-phases-0-10-windows-x64

Manifest metadata: version 1.0.0+10, generatedUtc
2026-08-25T17:17:59.2255162Z, fileCount 26.

- Release EXE:
  C:\Users\fabio\.codex\worktrees\c046\TwinePlayer\flutter_app\build\windows\x64\runner\Release\twine_player_flutter.exe
  SHA-256 79EDFB2A109AA1F4B6BFB261D9D87B1013E3CDDEE4458F3FE645D98877D92F7A
- Packaged EXE:
  C:\Users\fabio\.codex\worktrees\c046\TwinePlayer\artifacts\TwinePlayer-touch-phases-0-10-windows-x64\twine_player_flutter.exe
  SHA-256 79EDFB2A109AA1F4B6BFB261D9D87B1013E3CDDEE4458F3FE645D98877D92F7A
- Manifest:
  C:\Users\fabio\.codex\worktrees\c046\TwinePlayer\artifacts\TwinePlayer-touch-phases-0-10-windows-x64-manifest.txt
  SHA-256 7318937A3AC4CB196008534CFC05C5E439211FE79FEA340EF6CBBF734125C445
- ZIP:
  C:\Users\fabio\.codex\worktrees\c046\TwinePlayer\artifacts\TwinePlayer-touch-phases-0-10-windows-x64.zip
  SHA-256 79F3E78129FB0D25D7B4B5AD604B6A9B6E5319642793CAA9ABB48959305F0857

The manifest-verified package inventory is:

~~~text
331F14D9D73F61FB7053A73673F673329D6FB91839FEEFD00EAA3896677B653A  dartjni.dll
9815B9CDA4A1E8B5CA3812CB3BDAF526CAD91CBB5A1943BEC977D9E3EE08397A  data/app.so
F0566FCE4BE273AA999D4C7E103C24002276E330CB428F6480639152D3B1615C  data/flutter_assets/AssetManifest.bin
17A6F6874BE1C7E2EB725B2C443967CBE8BCEAF6E53167FACE005AED2385DD50  data/flutter_assets/assets/input_lab.html
A199CEEEFF209BE1AC452C43CD06EDA00743A3C64B11284BAC9500CE8B6DF9A6  data/flutter_assets/FontManifest.json
740E8F868154A1C31DD9B3B5B79CBA7186CB83BFC27FB7CFEBB597BC18FF715D  data/flutter_assets/fonts/MaterialIcons-Regular.otf
9548A31E4A048135C1D94F919328BFB62AE2C7BB3CAB96557C7941DAA97776CB  data/flutter_assets/NativeAssetsManifest.json
57B0CC10C310257AF25EA9E8CA76F812B6D458CB625DDB0F8091AB54AEA0FEBB  data/flutter_assets/NOTICES.Z
28E833DF423271EF318089DF03B393A04C12B062E9DE8762D964335F4CFDAADF  data/flutter_assets/packages/forui_assets/assets/lucide.ttf
4795B76B5B54D140FA17432EB4EE2EB27C63156CA0C8184ED27C4781FAAFE276  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-Black.ttf
412C068EAB6F36E6807D630FF89127165E8E4D3E8653434CDFB56B60CDCC3A32  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-Bold.ttf
D78D9777567FC7320968861417653CBBB80D861F0DFD9978E9705B4400696910  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-ExtraBold.ttf
3BE0E36C828B773E3F10568461F3A0BAF7323CFF772D9408DF04222A205BCB1F  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-ExtraLight.ttf
A04215A19659C1CFDF462157FC69EFA03DF8CC67C7353F83D80F8EAD7698A169  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-Light.ttf
A645F55492D1C8CDACE43C72BE8CBEC08E680B5A86D8B4C2D1C50D6E41E9CC96  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-Medium.ttf
3127F0B873387EE37E2040135A06E9E9C05030F509EB63689529BECF28B50384  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-Regular.ttf
B0B540E69BF6717016E33874670E09ACF4BFFC2CA3F4C1CF174A4FF696308C65  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-SemiBold.ttf
9406F2ADBB821D34651F66265B24BF67ED1731AC4133DA8EB56270956009434F  data/flutter_assets/packages/forui/assets/fonts/inter/Inter-Thin.ttf
1FE8436A743884CB65078FE8C7B38E18F5365F2A2961270916F426FD13C604AF  data/flutter_assets/shaders/ink_sparkle.frag
BC7599DBBBAAB310EFE41520574138D21FB18A88C8FE4495ED79315309336F6F  data/flutter_assets/shaders/stretch_effect.frag
325A86063D26334C2EABE1743CEA073B612540FBF3D8FC2EF0B5708E3763A8C7  data/icudtl.dat
D469AD200D909E3F8504DE698EA34535C957E26DB8A548CA1447EA70178BDF59  file_selector_windows_plugin.dll
8F989F1255D14D8521C20D8869484E65A9661DAB5E90DC00B7DA97490EAED220  flutter_windows.dll
79EDFB2A109AA1F4B6BFB261D9D87B1013E3CDDEE4458F3FE645D98877D92F7A  twine_player_flutter.exe
1A0350995933309C9F7EB2A2BA3A498035E4D70CBAE46327A3E3AB43F134B61F  webview_windows_plugin.dll
F0FCCD520AFD3056DF3130B6CCD3386FEF029FE8A5637F190B1DA57C96330E85  WebView2Loader.dll
~~~

## Runtime evidence

The packaged EXE was launched with the working directory set to its package
directory. After three seconds it was still running with a non-zero main
window handle, loaded twine_player_flutter.exe, flutter_windows.dll,
webview_windows_plugin.dll, and WebView2Loader.dll, then accepted a close
request and exited with code 0.

A separate bounded launch with the argument --verbose-logging produced empty
stdout and this stderr telemetry:

~~~text
[IMPORTANT:flutter/shell/platform/embedder/embedder_surface_gl_impeller.cc(126)] Using the Impeller rendering backend (OpenGLESSDF).
~~~

This is reliable runtime evidence for the renderer selected in that run. It is
not a claim that every GPU path, WebView texture, display, or physical input
cell works. The source Impeller switch and successful compilation were not used
as substitutes for this observed telemetry.

## Certification boundary

The following automated and bounded process evidence is complete:

- Flutter 3.47 dependency, analyzer, 67-test, vendored 7-test, release-build,
  package-inventory, hash, ZIP, and three-cycle launch/close checks.
- Root Node/DOM and Windows resilience checks.
- One observed Impeller OpenGLESSDF runtime selection and clean packaged-process
  close.

The following remain **NOT CERTIFIED** because they were not exercised:

- physical Intel/AMD/NVIDIA GPU matrix, adapter selection, GPU recovery, and
  four-client matrix;
- real WebView2 story content, including blank/black/upside-down/stale frames,
  navigation, scroll, clipping, resize, fullscreen, dispose/reopen, and
  save/load;
- visual text/antialiasing/tooltips, keyboard traversal, screen-reader
  traversal, focus restoration, touch, mouse, wheel, and pen behavior;
- search/console/scenario-label editing, selection, Korean IME composition, and
  high-DPI multi-monitor/display transitions;
- physical SugarCube save/overwrite/cancel behavior.

The next implementation dependency is P0 DXGI adapter alignment for the
vendored WebView D3D11 device. This PR intentionally does not modify that
implementation.

## GitHub delivery check

PR #3 check run 32878086307 is **not green**: the legacy Electron smoke test
selects a fixture game and supports library search and sort, and
getByRole('button', { name: /Library/ }) resolves the Back to Library button
outside the viewport before timing out at test/electron-integration.js:209.
This exact test, locator, outside-viewport signature, and line number match
merged Flutter PR #2 check run 31730990711. It is therefore verified
pre-existing and unrelated to this three-doc-only PR. Electron remains out of
scope and unfixed; no Flutter gate result is changed.

## No-defect and reproducibility notes

No reproducible application defect appeared in the executed gates, so no source
change was made. Flutter pub get attempted to add generated build/platform
exclusions to analysis_options.yaml; those four generated Flutter metadata
paths were restored to the verified base and the final documentation-only diff
contains no application or generated source. Node engine warnings and the
initial non-elevated filesystem EPERM are environment facts, not suppressed
test failures.
