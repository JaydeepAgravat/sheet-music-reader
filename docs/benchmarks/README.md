# Benchmarks

How renderer performance is measured. Results live next to this file, one per run (`phase2-*.md`).

## Corpus
```bash
python3 scripts/gen-test-pdfs.py      # → test-assets/pdfs (git-ignored, deterministic)
bash scripts/push-test-pdfs.sh        # → device: files/test-pdfs (debug app) + /data/local/tmp/test-pdfs
```
Files: `scan-300p.pdf` (300 pages, ~100 MB grayscale JPEG scans), `vector-50p.pdf`, `poster-1p.pdf` (A0, ~60k ops), `mixed-10p.pdf` (sizes, /Rotate, CropBox), `tiny-1p.pdf`, and two broken files.

## 1. Native renderer (no React Native)
```bash
cd android && ./gradlew installDebug installDebugAndroidTest
adb shell am instrument -w -e package com.alphastack.scorereader.renderer \
  com.alphastack.scorereader.test/androidx.test.runner.AndroidJUnitRunner
adb logcat -d -s RendererBench:I
```
## 2. End to end through React Native (Renderer Lab)
Settings → Renderer lab (debug builds). Buttons run: 500 pedal-paced turns (250 ms), a 500-turn burst (one turn per frame), open/close ×100.
`jsToPixel` = JS page request → first native draw, on one clock (`NativeScoreRenderer.nowMs()`).

**Release-build numbers:** temporarily set `SHOW_DEV_TOOLS = true` in `src/dev/flags.ts`, `./gradlew assembleRelease`, install, run the lab, read results on screen, then **revert the flag**. Debug JS is ~2× slower than release and is not representative.

## Caveat
Emulator numbers (Apple-silicon host) are optimistic. Phase 8 re-runs everything on the hardware matrix (Galaxy Tab S-series, a budget tablet, a phone).
