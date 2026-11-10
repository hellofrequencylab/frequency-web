# Hunt accessibility and low-signal test script (FH-017)

Status lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json). This is the script a tester follows on a real Trail, and the pass rules that decide the result. It records no results: nothing here has been run on a device yet, and the results go in `ACCESSIBILITY-RESULTS.md` (row FH-017S) so a pass is never claimed before it happened.

## Setup

One published Trail with at least three stops, one printed sign and one NFC tag per stop (see [PLACEMENT-KIT.md](PLACEMENT-KIT.md)), and one account that has not played it. Test on one current iPhone and one current Android phone, on mobile data and then on a throttled or weak connection.

## Pass rules (apply to every section)

1. **No silent awards.** A stop is credited only after the server confirms it. The screen never shows "done" before that.
2. **Pending is visible.** With no signal the claim shows "Waiting to confirm", keeps the member's place, and retries when signal returns. It never shows an error that loses the visit.
3. **No duplicate grant.** Retrying, refreshing, or scanning twice credits a stop once.
4. **Hidden stays hidden.** Locked stops show no clue or place name in the page, a screen reader, or the share preview.
5. **A physical way in always exists.** Every placement has a printed short code a member can type.

## Checks

| # | Check | Steps | Pass when |
|---|---|---|---|
| 1 | Keyboard only | Tab through browse, join, the current clue, the claim control and the finish. | Every control reachable and operable, visible focus, no trap, order matches reading order. |
| 2 | VoiceOver (iPhone) | Swipe through the same flow. | Stop state ("locked", "your next stop", "visited") is spoken; the clue is read once; progress is announced when it changes. |
| 3 | TalkBack (Android) | Same flow. | Same as above. |
| 4 | Zoom and text size | 200 percent browser zoom and the largest system text size. | No clipped text, no horizontal scroll, claim control still reachable. |
| 5 | Contrast and motion | Light and dark mode, reduce-motion on. | Text and controls meet contrast; no motion needed to understand state. |
| 6 | Camera permission denied | Deny the camera, then scan. | A clear message and the typed short code path, not a dead end. |
| 7 | NFC off or unsupported | Tap with NFC off, and on a phone without NFC. | The printed code or short code works instead. |
| 8 | Location denied | Deny location. | Play still works where the Trail does not need it, and says plainly where it does. |
| 9 | Poor network | Airplane mode at the stop, claim, then restore signal. | Rule 2: pending, then confirmed once. Nothing awarded while offline. |
| 10 | Two devices | Sign in on a second device mid-run. | Same progress and the same next stop on both; the older one catches up without losing credit. |
| 11 | Paused or closed Hunt | Pause the Hunt from the operator side while playing. | The player shows the paused banner, keeps progress, and cannot claim. |
| 12 | Replaced sign | Revoke a sign, then scan the old one. | The revoked page, no credit. |

## Recording a result

For each check write the device, the OS and browser version, date, pass or fail, and what was seen. A fail names the rule it broke. A check that cannot run on the available device is marked "not run", never "pass".
