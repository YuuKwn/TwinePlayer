# Authored offline performance workload

`performance.html` is an authored test document with 40 animated CSS cards, a 100-rectangle canvas animation, local H.264 video, scrolling and an activation counter. It uses no network resources. The default idle stage stops canvas drawing and CSS animation. Benchmark instrumentation is identical in both players.

`benchmark.mp4` is a four-second 640×360/30 fps mathematical test pattern generated locally with FFmpeg:

```powershell
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=640x360:rate=30 -t 4 -c:v libx264 -pix_fmt yuv420p -an -movflags +faststart benchmark.mp4
```

These authored fixture assets may be used under CC0-1.0. No third-party game, private save or external footage is included. Tool versions and hashes are recorded with actual measurements. The fixture is not a Twine format runtime; the separate official engine fixtures and private real-game runs provide those compatibility checks.
