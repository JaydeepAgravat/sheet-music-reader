# Phase 3 — reader & pedals (emulator, 26 Sep 2026)

Device: Tab_11_16x10 emulator (1600×2560, API 36), debug build; phone checks via `wm size 1080x2400` + `wm density 420`.

| Check | Result |
|---|---|
| 500 simulated pedal presses (`input keyevent`, 250 ms apart): 250 × PAGE_DOWN then 250 × DPAD_LEFT on the 300-page scan | p. 6 → 256 → 6: exactly 500 turns, 0 doubles, 0 misses |
| Presses closer than the 200 ms debounce | Collapsed into one turn (by design) |
| First pedal press right after touching the screen | Turns (fixed: main page view holds key focus, see ScorePageView.holdKeyFocus) |
| Portrait tablet | Single page, fitted |
| Landscape tablet | Two-up, pages meet at the spine |
| Landscape phone | Single page fitted to width; pedal scrolls 85 % of a screen, then turns |
| Half-page | Full → half (next top / current bottom, tags + divider) → full; split draggable and remembered |
| Swipe | Follows the finger; short/slow swipes spring back; resistance at the ends |
| Performance mode | Immersive, no controls, one-time hint; 1 s hold in the centre fills the ring and exits |
| Filters | Night renders inverted/softened on scans; filter remembered per score |
| Resume | Reopening a score lands on its last page with a "Resumed at page N" snackbar |

Notes
- `uiautomator dump` briefly attaches an accessibility service that swallows the next key event; wait ~2 s after a dump before injecting keys in scripted tests.
- Density changes (`wm density`) recreate the activity and return to the library (MainActivity passes a null bundle on purpose).
- Real pedals (arrow mode + PgUp/PgDn mode) and TalkBack on hardware are still to be verified in Phase 8.
