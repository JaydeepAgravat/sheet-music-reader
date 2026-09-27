# Phase 5 — annotation (emulator, 27 Sep 2026)

Device: Tab_11_16x10 emulator (API 36), **debug build**, finger input via `adb shell input swipe`.

## Architecture decision
Ink is drawn **natively** inside `ScorePageView` (android/.../ink), not with react-native-skia.
This is the plan's own fallback ("native ink view, same storage format") taken up front:
- input straight from `MotionEvent` (historical points, `pointerType`, `BUTTON_STYLUS_PRIMARY`,
  `TOOL_TYPE_ERASER`, `FLAG_CANCELED` palm rejection, `requestUnbufferedDispatch`);
- ink shares the page's placement math, so it is aligned in single, half-page, two-up, zoom
  and rotation by construction, and thumbnails (scrubber) show ink for free;
- no extra ~6 MB native dependency.
JS owns persistence (SQLite `ink_strokes`, Float32 blobs, batched writes) and undo/redo.

| Check | Target | Result |
|---|---|---|
| Draw over a page with 2,016 strokes (finger swipes) | smooth | p50 18 ms, p90 19 ms, 0.8 % janky (clean page: p50 16 ms) |
| Alignment | same spot in every mode | Verified single, two-up (landscape), half-page band, rotation |
| Highlighter | notes stay black | MULTIPLY layer, verified |
| Eraser / undo / redo / clear page + snackbar undo | work | Verified; rows persisted and deleted in SQLite |
| Library badge | "annotated" icon | Verified (list + grid) |

## Not verified (needs the Galaxy Tab + S Pen, Phase 8)
- Subjective latency and frame timing with a real pen; `FLAG_CANCELED` palm rejection.
- Side button reported as `BUTTON_STYLUS_PRIMARY` on Samsung; eraser end as `TOOL_TYPE_ERASER`.
- Stylus never swiping the page (native requests disallow-intercept; RNGH cancels its handlers).

## Known limitations
- Undo of an erase appends the strokes, so overlapping ink can change stacking order.
- Emulator GPU numbers only; re-measure on hardware.
