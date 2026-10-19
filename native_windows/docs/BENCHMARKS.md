# Baseline and performance evidence

UX Preview 5 changes save/load presentation and engine dispatch. Its first-use/repeated-operation checks are correctness evidence, not a startup, throughput or memory benchmark; no new performance-superiority claim is made. See UX-NATIVE-SAVES.md.

Audit date: 2026-10-16. Flutter reference source identity is local main c450a3c / app 1.0.0+10. The existing August 13 Flutter artifact is a historical reference; a newly rebuilt baseline must be identified separately. Existing WPF packages are not the WinUI migration.

Installed WebView2 Runtime: 155.0.4283.45. .NET SDK: 10.0.201. Flutter: 3.47.0 / Dart 3.13.0. Phase 0 machine/source inventory and test results are recorded separately. The plan-referenced `docs/flutter-3.47-certification-report.md` does not exist in this checkout; do not treat it as evidence.

| Measurement | Flutter | WinUI |
|---|---|---|
| Cold/warm time to interactive | Unmeasured | Not implemented |
| Host startup sample at 3 seconds | Working set 148,164,608 bytes; private bytes 221,687,808; cumulative CPU 1.640625 s | Not implemented |
| Total host + browser memory | Unmeasured | Not implemented |
| GPU use, animation/canvas/video | Unmeasured | Not implemented |
| Interaction/scroll/fullscreen latency | Unmeasured | Not implemented |
| Extended play/reopen cycles | Unmeasured | Not implemented |

No WinUI efficiency advantage is claimed. Process survival or a window handle does not prove rendering or interaction. Baseline probing must isolate browser data and avoid writing to the real Flutter profile. Record Windows build, CPU/GPU/driver, executable/fixture hashes, Runtime, launch conditions and process-tree accounting with each future measurement. Repeat identical stories and workloads on this machine; distinguish host-only measurements from total browser-tree memory.

The 3-second probe launched the newly rebuilt reference with a hidden window, opened no story, and closed only its own process. Process survived; no visible window was observed (hidden launch), so time-to-interactive/rendering is unverified. This is one host-only startup sample, not idle CPU, an average or total browser memory. No story saves or browser interaction were performed.

Host: Windows 11 Pro build 26300; AMD Ryzen 7 9800X3D; NVIDIA RTX 5070 Ti driver 32.0.16.1714; AMD Radeon driver 32.0.21030.31. Virtual Desktop, Parsec, SudoMaker and Sunshine display adapters are installed; this does not verify remote-client behavior.

## Phase 8 bounded comparisons (2026-10-16)

Eight completed cases are consolidated in `artifacts/native-benchmark-comparison-20261016/comparison.json` and `summary.csv`, with Windows/CPU/GPU/Runtime inventory in `system.json`. Native measured source is e2134fc / 0.8.0-phase8-test; Flutter uses the unchanged local reference player through `tools/flutter-benchmark.dart`. Native final packaging adds documentation and a DPI-change zoom-reapply callback, which is not exercised at default zoom in these measurements. No measurement is attributed to cached origin/main 711297a.

| Story / browser profile | Flutter rendered-ready proxy | Native rendered-ready proxy | Flutter tree private memory (idle) | Native tree private memory (idle) |
|---|---:|---:|---:|---:|
| Authored workload / fresh | 3294 ms | 1090 ms | 562 MiB | 384 MiB |
| Authored workload / reused | 3458 ms | 1112 ms | 559 MiB | 378 MiB |
| Accidental Mind 3.4 / fresh | 3321 ms | 935 ms | 547 MiB | 375 MiB |
| Accidental Mind 3.4 / reused | 3336 ms | 979 ms | 540 MiB | 370 MiB |

CPU, host memory, total host+browser private memory, per-process GPU-engine samples, decoded video frames and scroll-frame intervals are retained per stage. Controlled viewport: 900 x 450 CSS pixels at DPR 2, verified by 1800 x 900 PNG captures. Observed scroll-frame medians were about 6.9-7.0 ms in both players. The workload includes 40 CSS cards, 100 moving canvas rectangles, local 640x360 H.264 video and scrolling. These observations do not establish an overall performance advantage.

Limits: one sample per case, current desktop/background conditions, differing outer host windows and benchmark entry points; startup is measured before viewport emulation, not OS-cold or end-to-end interaction latency. Reused profile refers to the browser profile, not proof of identical application-store initialization. Working sets may double-count shared pages; private memory is reported separately. Extended play, audio, real interaction latency and physical monitor/client conditions remain unverified. Initial unnormalized measurements used different window sizes/DPI and are excluded from comparisons.

Trial history: the first controlled report completed its two Flutter workload cases but a WinUI subcase lost its browser/CDP connection. That failed case is excluded. A native-only retry waited for host initialization and omitted the unnecessary Page.bringToFront command; all four native cases passed. Its exact failure cause is unproven. The two successfully completed Flutter rows from that report and the later two Flutter real-game cases are explicitly identified in the consolidated report. No failed case is counted as passing.

Reproduction: build the normal native solution from this directory, build Flutter with `flutter build windows --release --target=../native_windows/tools/flutter-benchmark.dart`, and archive the complete resulting Release folder with a `BENCHMARK-ONLY.txt` marker before restoring Flutter via `flutter build windows --release --target=lib/main.dart`. Use Node 22+ to run `tools/benchmark-players.js <native-exe> <archived-flutter-benchmark-exe> [real-story]`. The harness refuses an unmarked ordinary Flutter executable, requires isolated stores/profiles, records module hashes for future runs and closes only its own hosts. The migration-run wrapper is retained under `artifacts/TwinePlayer-Flutter-BENCHMARK-20261016/`; normal Flutter output has been restored. CLI-generated analyzer exclusions were removed without changing the reference source.

Phase 9 bounded recreation sample: `native-smoke-35d37c95fbb54ef4a83e6e9e21e3db7d` completed 60 native recreations in about 9.7 seconds. Tree private memory at seven snapshots ranged 372.7–429.5 MiB; host handles ranged 1386–1473 (1402 initially, 1423 finally). This samples normal allocation/cache/GC behavior, not a proof of no leak or a comparison with Flutter. A later 60-cycle report `native-smoke-6e3ea3906f5c475da175fea1b00b1b99` also checks exactly one delivery of a correlated current-document message. The intervening failed fixture used `text` rather than the existing log envelope's `message` property; it was rejected as malformed and is excluded.

For sustained workload sampling, `--soak-seconds=300` repeats the existing identical idle/CSS/canvas/video workload for at least five minutes per host in one fresh-profile session. It records incremental session-samples.json and runs the players sequentially, retaining existing viewport, video decode, CPU/GPU/tree and module-hash checks. The default fresh/warm benchmark remains unchanged. A five-minute run is bounded evidence, not long-play or OS-cold certification.

Completed sustained sessions are consolidated in `artifacts/native-sustained-comparison-20261017/`: Flutter 341.2s and native 327.8s, six samples per stage. Median tree-private memory across stages: Flutter 558.9–568.4 MiB, native 375.5–384.3 MiB. Median CSS CPU was 1.701% versus 2.063% of the 16-logical-processor machine. These are one session per player, not evidence of general superiority; native's higher CSS CPU is retained as an observation. The first native trial lost CDP around 103s; no matching app log/dump/Windows crash event was found, cause remains unproven, and that incomplete case is explicitly excluded. New failure diagnostics capture target/process/reconnect state before the harness stops its own host. The single targeted native retry completed normally.

The low native canvas CPU prompted a focused progress check rather than an assumption that selected stages were running. Fixture counters and harness checks now require canvas-frame, decoded-video-frame and CSS animation-time advancement. Short paired canvas/video report `native-benchmark-28da4f47-7778-4514-acff-508f7ab3c533` passed: 1799/1818 canvas frames and 374/377 additional decoded video frames for Flutter/native. That sample's canvas CPU ordering reversed (0.032%/0.104%), illustrating why no CPU superiority claim is justified. The counters are new instrumentation; earlier sessions did not record per-stage advancement and retain that limitation. Use `--single-session --stages=canvas,video` for a focused check. Do not replace failed or older uninstrumented evidence silently.

Focused CSS validation `native-benchmark-a820c21c-e5d1-4c0c-8493-2128ff2c7a1b` passed with 40 active animations in each player and about 12.5s advancement of the first animation during sampling. CPU ordering also reversed here: Flutter 3.055%, native 2.563% of the machine. Across these bounded trials the small CPU differences do not establish a repeatable regression or general advantage. Outer host surfaces, allocation/cache state and desktop scheduling remain comparison limits. No production tuning or dependency change was made merely to improve a benchmark result.

Published r3 bounded activity check `native-benchmark-1975fd3a-f40c-4990-aae2-c14b08f12455` passed CSS, canvas and video advancement. Its CSS CPU sample was 5.195% of the machine, versus 2.563% in the earlier r2 focused sample. These samples are not comparable evidence of a code regression: initial host DPR changed from 1 to 2 and measured scroll-frame median changed from 6.9ms to 2ms, despite the same emulated CSS viewport/DPR. The r3 canvas counter advanced 6067 frames versus 1818 in the earlier check. Host cumulative CPU including startup was 0.938s versus 0.766s; the total tree value is dominated by browser/rendering work. This identifies changed presentation conditions and does not establish their physical cause. Do not attribute the total CPU difference to the new native message hook or claim an improvement. Stable physical display/refresh conditions remain a manual performance gate.

UX Preview 1 (2026-10-17) retains Mica and standard control materials. It introduces no custom compositor blur, continuous animation loop or new dependency. Existing benchmark comparisons remain historical; no new comparative performance advantage is claimed for the refreshed layout.
