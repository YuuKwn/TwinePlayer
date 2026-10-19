# Genuine SugarCube 1 fixture

This is an authored two-passage story compiled with Thomas Michael Edwards's actual offline SugarCube 1.0.35 runtime, not a mocked save API. Runtime release: 2016-04-22. Source: https://www.motoslave.net/sugarcube/1/ and https://www.motoslave.net/sugarcube/download.php/1/sugarcube-1.0.35-for-twine-2.0-local.zip (downloaded 2026-10-16).

Archive SHA-256: `45980BD4FDF39C84637B87E1FF3F6142D3579A7D9627405DEDF05BC6581D5655`.
Generated HTML SHA-256: `ac3982421500ebe20cfcce7e9508640c5489f42d6a817d29c65351cfff493b16`.

Reproduce with `node native_windows/tools/build-sugarcube1-fixture.js <official extracted format.js>`. The builder embeds a small authored story without changing the runtime. Retain LICENSE beside the fixture and runtime's embedded third-party notices. Runtime source/license: https://github.com/tmedwards/sugarcube-1 . Tests run offline.

The genuine v1 runtime exposes SugarCube.SaveSystem.exportSave/importSave and SugarCube.UISystem, rather than the Flutter bridge's assumed window.save.serialize API. The native adapter must preserve the engine's disk format and FileReader import path. Native save/load certification is recorded in the Phase 2 report, not inferred from fixture generation.
