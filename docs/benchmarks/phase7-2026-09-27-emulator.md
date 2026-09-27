# Phase 7 — monetization, onboarding, i18n & accessibility (emulator, 27 Sep 2026)

Device: Tab_11_16x10 emulator (API 36), debug build.

## What was checked
| Area | Result |
|---|---|
| Paywall (2nd setlist, import over the free 15, Settings) | Opens from all three; honest single screen; price comes only from Play. On the emulator (no product) it shows "—" + "Pro can't be bought right now" and disables Buy |
| Free limits | Existing scores stay readable; over-limit imports are not copied and are listed in the review card; setlist creation is gated before the name dialog |
| Release manifest | No INTERNET permission (billing's datatransport adds it; removed in src/release/AndroidManifest.xml). ACCESS_NETWORK_STATE kept for its job scheduler |
| Onboarding | 3-step intro (skippable, back steps back); 4 samples seeded once (is_sample, don't count toward 15); annotate tip once |
| Crash capture | Forced JS crash → next launch prompt → share sheet with a readable report; nothing leaves the device unless shared |
| Help / Privacy / Licences | Work in all languages; licences generated from the shipped bundle (`npm run licenses`) |
| German + Japanese | Library, setlists, setlist detail, collections, settings, paywall, help, privacy, licences: no truncation |
| 200 % font | Main tabs, settings, setlist detail usable; nav-rail labels capped at 1.3× + shrink-to-fit |
| TalkBack (runtime dump of unlabeled clickables) | 0 on every screen checked (dev-only LogBox excluded); paywall scrim hidden from TalkBack |
| Keyboard / D-pad | Focus ring on every Surface control |

## Bugs found and fixed
- Licences screen crashed: `licenses.ts` next to `licenses.json` — Metro resolved `./licenses` to the JSON. Renamed to `licenseData.ts`.
- Paywall price placeholder spun forever when Play connects but the product doesn't exist.
- Paywall imports message printed a raw `{{limit}}`.
- Replace-restore / nav labels / focus ring items listed in earlier phases.

## Needs the owner / real hardware
- Play Console: create `pro_lifetime`; purchase → uninstall → reinstall → restore with license testers (exit criterion); pending payments; refunds.
- `SUPPORT_EMAIL` in src/config/support.ts is a placeholder.
- A musician should review the bundled samples (design/samples/SOURCES.md lists what to check).
- Full TalkBack walkthrough by ear, and es/fr/it screen review (de covers the longest strings).
