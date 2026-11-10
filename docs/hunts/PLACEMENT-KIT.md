# Hunt placement kit (FH-015)

Status lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json), not here. This doc is the kit an operator follows to put a Hunt stop on a wall, a table or a tag. It reuses what the QR program already ships; nothing here is a second system.

## What a placement is

A placement is one printed sign or one NFC tag at one stop. It carries a short code that resolves through `resolvePlacement` (`lib/hunts/placement.ts`, FH-014): landing page for a member, public landing for a crawler, redirect to the canonical host, refusal when revoked or unknown. A scan never credits by itself. Credit goes through the claim path only.

## Reuse, do not rebuild

| Need | Use |
|---|---|
| Render the code | `renderQrSvg` / `renderQrPng` in `lib/qr/render.ts` |
| Check it will scan | `scannabilityWarnings` in `lib/qr/scannability.ts` (contrast and quiet-zone warnings) |
| Short code | `generateSlug` / `normalizeSlug` in `lib/qr/codes.ts` (unbiased alphabet, no look-alike letters) |
| Write a tag | `nfcTagMessage(link)` in `lib/qr/nfc-tag.ts`: one NDEF URL record, nothing else |
| Read a tag back | `readTagUrl` and `tagMatches`: write, then read, then compare before the tag leaves the desk |

## Print a sign

1. Create the placement for the stop. The placement address is the Hunt placement URL for its short code.
2. Render the SVG for print (vector), PNG only for screens.
3. Run the scannability check. Fix any warning before printing. Dark code on a light field, never inverted.
4. Print at least 3 cm square for a table, 6 cm for a wall at arm's length, 12 cm or more for anything read from a few steps away. Leave a blank border of four modules.
5. Print the short code in plain type under the code (the accessible fallback below).
6. Test with two phones (one iOS, one Android) and the camera app, not only a scanner app, before it goes up.

## Write a tag

1. Use a tag with at least 144 bytes (NTAG213 or better).
2. Write exactly one record: `nfcTagMessage(placementUrl)`. Add the `m=nfc` marker so taps count apart from scans.
3. Read it back with `readTagUrl` and confirm `tagMatches`. A tag that fails readback is discarded, not "fixed".
4. Lock the tag after a good readback.
5. Stick a printed code and the short code next to it. A tag is never the only way in.

## Accessible fallback

Every placement shows the short code as large, high-contrast text and a one-line instruction: "Type this code at the Hunt page." A member who cannot scan or tap enters the code by hand and lands on the same page. The placement sign states the stop name in text, never in the code art alone. Never place a code where it cannot be reached by someone seated.

## Replace or revoke a placement

- **Damaged or stolen sign:** revoke the placement, create a new one for the same stop, print and test it. The old code refuses from the moment it is revoked, so a photo of the old sign stops granting.
- **Wrong stop:** revoke, do not edit. A code never changes meaning.
- **Venue closes:** pause the placement. Staff proof refuses a paused placement (`placement_paused`, FH-020).
- Record the date and who replaced it in the placement note so the next operator can see the history.

## Done check

Printed sign and tag both land on the same placement page on a current iPhone and a current Android phone. A revoked sign shows the revoked page and grants nothing. Both are checked by hand once per Trail before it goes public, by Local operations. The route that serves the page is FH-014S.
