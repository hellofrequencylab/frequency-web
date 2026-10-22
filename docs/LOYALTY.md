# Regulars: the Space loyalty, check-in and hunt program

**Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json), not here.** This document explains
how the program works and why. Whether a phase shipped is a backlog row (`LIVE-940` to `LIVE-946`).
Decision record: ADR-1780.

A Space on a Business plan can run **Regulars**: members check in at the door code, earn
25 Zaps and one stamp per visit, and a full card earns a reward the owner chose and priced. Spaces
can also run a **Hunt** together: a member who checks in at every stop in the window earns the
hunt reward on top. Everything reuses the signed check-in node, the exactly-once engagement
ledger and the Zap ledger that already exist; no second scanning or points system is built.

## 1. What already exists (surveyed 2026-10-19)

| Piece | Where | Reused as |
| :--- | :--- | :--- |
| Signed check-in QR per Space, `nodes.kind='checkin'`, `zaps_value 0` | `lib/spaces/checkin.ts`, `app/(main)/n/[nodeId]` | The one way to check in. |
| Exactly-once ledger, one capture per member-local day on a repeatable node | `lib/engagement/capture.ts`, `engagement_events` | The stamp trigger. |
| Zap ledger, `zap_config` amounts and daily caps, `award_zaps_atomic` | `lib/zaps.ts` | Pays the 25 Zaps. |
| Partner offers and the persona loyalty card (`partner_offers.visits_required`) | `lib/partners/*` | Left as is. It hangs on a member persona and an admin-minted plaque, not on a Space, so it cannot be the Space program. It keeps working. |
| Space location, `isMappable`, coarsened reads | `lib/spaces/location.ts` | The geofence source. A pin is optional (LIVE-948). |
| Plan ladder and `featureAllowed` | `lib/pricing/gates.ts`, `lib/spaces/function-access.ts` | The Business-and-above gate. |
| Space Resonance timeline, CRM | `recordSpaceMemberActivity` | Already logs every check-in; the owner numbers read it. |

## 2. The mechanics, and the lever each one pulls

Research summary (Nunes and Dreze 2006 endowed progress; Kivetz, Urminsky and Zheng 2006 goal
gradient; Fogg B=MAP; Duolingo streak data; Swarm's 2015 mayorship fix; Main Street passport
programs; Japanese stamp rallies) is condensed into these rules:

| Rule | Lever |
| :--- | :--- |
| A **stamp card**, not a points balance. 3 to 12 stamps, default 6. The card always says "2 more visits to your free coffee". | Goal gradient: people speed up as the goal nears, and a visit count is legible to a cafe. |
| The owner may **pre-fill 1 or 2 welcome stamps** with a stated reason ("your first one is on us"). | Endowed progress: 34% vs 19% completion in the car-wash study. |
| **25 Zaps per check-in** per Space per member-local day, capped at 75 Zaps a day (three Spaces). Zaps cost the business nothing and roll into Gems at season end. | Immediate, certain reward on the tap (Fogg: trivial action, instant payoff). The cap keeps the economy honest. |
| The **reward is a thing, not a percentage**: the owner names it and gives it a dollar value. Suggested value is 5 to 10% of a typical spend. | Reciprocity. A free item is remembered; a discount trains waiting. |
| **One in ten check-ins earns a surprise stamp**, odds printed on the card, never a wheel or a loot box. | Variable reward, kept small and transparent. |
| A **Regular badge**: three visits in a rolling 30 days, visible to the owner so they can greet regulars by name. It lapses quietly. | Attainable local status, Swarm's rolling-window fix for mayorships. |
| **Weekly streaks** (visited three weeks running) with a free skip. Progress never resets silently and stamps never expire while the member checks in anywhere once a quarter. | Loss aversion used lightly. Rigid streaks lose 40% more users than forgiving ones. |
| A **Hunt**: 3 to 12 Spaces, a 2 to 10 week window, a stop reward at each stop and a completion reward from the host. Every stop can see who the other stops sent them. | Collection sets, scarcity by calendar, and co-marketing that sends strangers to neighbors. |
| A **value promise** on every card: no devaluation without 60 days notice, location read only at tap time. | Trust. Devaluation is the top reason loyalty members quit. |

Not built, on purpose: background location, spin wheels, paid-for Zaps, tiers (tiers need a year
of history), per-dollar points (no POS data).

## 3. Anti-abuse

Signed QR and HMAC (LIVE-688), one capture per member-local day (LIVE-654), Zap daily cap
(`award_zaps_atomic`), stamps minted inside one RPC under an advisory lock so two taps cannot earn
two rewards (the SCAN-841 lesson), a 10-minute velocity rule across Spaces, and an optional
geofence: when the owner turns on "must be here", the check-in node takes the Space's exact
coordinates and a 200 m radius through the proximity check the capture path already runs.

## 4. Data

- `space_loyalty_programs` (one per Space): status, `stamps_required`, `welcome_stamps`,
  `reward_title`, `reward_value_cents`, `reward_note`, `surprise_odds` (0 or 10), `geofence`.
- `loyalty_stamps`: one row per member per Space per local day, with `kind` (visit, welcome,
  surprise, hunt). Unique on `(space_id, profile_id, visit_day, kind)`.
- `loyalty_rewards`: an earned reward, its six-character counter code, `redeemed_at`, a snapshot
  of the title and value so a later price change never rewrites history.
- `loyalty_hunts`, `loyalty_hunt_stops` (each stop accepts its invite), `loyalty_hunt_completions`.
- RPC `loyalty_record_visit(space, profile, day, zaps)`: stamps, mints a reward when the card is
  full, returns the card state. SECURITY DEFINER, service role only, advisory lock per card.
- `zap_config` gains `space_checkin` (25, daily cap 75). Hunt completion pays `hunt_complete`.
- `meet_codes` (a member's 60-second code) and `meet_taps` (one row per pair per week); RPC `meet_tap`.
  `zap_config` `meetup_tap` (15, daily cap 45), paid to both members.

## 5. Phases (one PR, one row, one migration each)

| Row | PR | What ships |
| :--- | :--- | :--- |
| `LIVE-940` | 1 | Program table, RPC, `space_checkin` Zaps. Owner panel "Regulars" under Money (turn on, reward, value, stamps, welcome stamps, geofence). The check-in result shows the card. The member's cards and codes at `/rewards`. Owner hands out a reward from the roster. Gate: plan at or above Business and a mappable location. |
| `LIVE-942` | 2 | Hunts: host creates, invites Spaces, stops accept, public hunt page with the route, progress on the check-in result, completion reward and Zaps. |
| `LIVE-943` | 3 | Surprise stamp, Regular badge, weekly streak with a skip, the "one stamp away" nudge through the notification router, the three owner numbers (new vs returning, rewards handed out and their cost, neighbors who sent people). |
| `LIVE-944` | 4 | Discovery: nearby Regulars Spaces and live hunts on `/rewards`, the Regulars line on the Space page, the "Check in with Frequency" door on Space websites, a member help article. The map keeps its city centroids (no Space pins, ADR-1783) and the marketing section is operator content. |

## 6. Tap, three ways (owner ask 2026-10-19)

One tap system, all in the web app, before the iOS app:

| Mode | How it works | Row |
| :--- | :--- | :--- |
| **Tap to check in for loyalty** | The door code is already a signed `/n/<node>?s=` link. Written to an NFC tag (NDEF URL record) it opens on iPhone and Android with no app and lands on the same check-in that stamps the card and pays 25 Zaps. Phase 1 says so next to the door code. | `LIVE-940` |
| **Tap to check in for events** | The host gets a signed event check-in link to write to a tag or print. A tap runs `checkInEvent` (window, RSVP, host switch all unchanged), which pays `event_attend`. | `LIVE-945` |
| **Tap phones in the wild** | A web page cannot read or emit NFC on iOS, so true phone-to-phone NFC waits for the iOS app. The web version is **Tap to meet**: one member shows a 60-second code (QR, or a sticker tag on their case that resolves to it), the other opens it, and both are paid `meetup_tap` Zaps. Once per pair per week, three a day, both members signed in, both present (the code never leaves the screen). | `LIVE-946` |

Every phase reads `envFlag('LOYALTY_ENABLED')` until the launch switch is thrown; the gate lives in
`docs/RUNBOOKS.md`.

### One link for the placard and its QR (`LIVE-1185`)

A Space's NFC placard and its QR code are the same check-in point. The QR encodes
`signedNodeUrl(node)`; the placard (and any NFC tag for a node) holds `signedPlacardUrl(node)`, the
same link plus a trailing `&m=nfc`. The verifier reads only `s`, so the marker never touches the
signature. The `/n` page passes `m` to `claimNode`, and `captureNode` records the medium the member
used (`qr`, `nfc`, or `device` for a card at a counter scanner) on the `node_capture` ledger row as
`context.medium`, with the ledger `source` following it. Admin Scan stats counts check-ins next to
scans, split by medium, per Space. QR Studio prints a "Tap or scan" placard
(`/print/qr?node=<id>&placard=1`) and links a check-in node to the placard portal.

## 7. Counter scanners (`LIVE-1125`)

The door code turned around: instead of the member's phone reading the Space's code, the Space's own
card reader (the CyberUnicorn 5000, an ESP32 with a PN532) reads the **member's** card at the
counter. The server then runs the Space's own check-in through `captureNode`, so the ledger, the
stamp, the 25 Zaps, hunts and the CRM timeline are the ones a phone scan gets. Nothing is
re-implemented. Behind `SCANNER_DEVICES_ENABLED` (envFlag); the gate is in `docs/RUNBOOKS.md`.

**Pieces.** Migration `20270346014500_scanner_devices.sql` (`scanner_devices`, `member_cards`,
both service role only). `lib/devices/` (credentials, store, scan, the device wire). Routes
`app/api/v1/devices/{scan,cards}` and `app/c/[token]`. Owner panel: the Space's Manage console,
Offerings & Money, **Check-in & scanners** (catalog row `space.scanners`, which opens the `?panel=checkin`
workspace); "Counter scanners" sits under Regulars (`scanners-section.tsx`).

**Trust.**

- A device is registered by a Space owner (canEditProfile and the per-Space check-in function).
  Its secret (32 random bytes, base64url) is shown once; only `sha256(secret)` is stored. Revoking
  sets `active = false` and the next request is a 401.
- A card is an opaque token (16 random bytes, base64url); only `sha256(token)` is stored. A card
  minted by a device works at that device's Space only. `space_id null` is a Frequency-wide member
  card, which the console writes (see "Member cards" below) and every Space's scanner takes.
- The chip UID is bound on the card's first scan, or straight after the write when the owner's USB
  console wrote it (an HMAC under the server signing key, never the raw UID). After that, the token on another chip, or with no UID, is refused as `card_mismatch`.
  A token copied before its first scan is the one gap: the owner revokes the card.
- The device is the witness of presence. The scan presents a node code the server signs on the spot
  and the Space's own pin as the location, which satisfies the "must be here" geofence. A stolen
  device secret can check in only cards issued for that one Space, once a member-day each; revoke it.
- A member holds at most 5 live cards per Space; a Space at most 10 live scanners.

### The device contract

Base URL is the site (`https://frequencylocal.com`, or `http://<lan-ip>:3000` for a dev server).
Both endpoints are `POST`, JSON in and out, header `X-Frequency-Device: <device id>.<secret>`
(never `Authorization: Bearer`: that header is the member app's and `lib/contract/caller.ts` 401s
anything that is not a Supabase session). Replies are flat JSON, **not** the `/api/v1`
`{ data, error }` envelope.

| Status | Body | Meaning |
| :--- | :--- | :--- |
| 200 | `{ "ok": true, … }` | Done. |
| 200 | `{ "ok": false, "reason": "…", … }` | A real answer to show at the counter. |
| 400 | `{ "ok": false, "reason": "invalid_input" }` | The body is not in the expected shape. |
| 401 | `{ "ok": false, "reason": "device_unauthorized" }` | Header missing, malformed, unknown, wrong or revoked. |
| 404 | `{ "ok": false, "reason": "not_enabled" }` | Scanners are switched off on this server. |
| 429 | `{ "ok": false, "reason": "rate_limited" }`, `Retry-After: 30` | 300 a minute per address, then 30 scans or 10 cards a minute per device. |
| 5xx | `{ "ok": false, "reason": "internal" }` | Retry later (queue the scan). |

**`POST /api/v1/devices/scan`**

```json
{ "card_token": "abcdefghijklmnopqrstuv", "uid": "04:A2:1F:9C", "queued": true, "scanned_at": 1760900000 }
```

`card_token` is required (base64url, 16 to 128 characters). `uid` is optional hex, 4 to 10 bytes,
any case, `:` `-` or spaces allowed. `queued` and `scanned_at` are accepted and ignored: the check-in
is credited on the member's day as the server resolves it.

```json
{
  "ok": true,
  "member": { "display_name": "Maya" },
  "zapsAwarded": 25,
  "loyalty": { "stamps": 6, "required": 6, "earned": true, "reward_code": "K7Q2MX" },
  "greeting": "Welcome back, Maya",
  "perk": "Cardholder perk: free oat milk upgrade"
}
```

`loyalty` is `null` when the Space does not run Regulars (or `LOYALTY_ENABLED` is off).
`reward_code` is present only when this scan filled the card. `greeting` and `perk` are optional
(`LIVE-1282`): `greeting` is on every check-in, and `perk` only when a numbered member card checks in at
a Space that set a cardholder perk. A client must ignore any field it does not know; fields are only
ever added. On `ok: false`, `member` is the card
holder when the card was recognized, else `null`; `zapsAwarded` is 0 and `loyalty` is `null`.
Reasons: `unknown_card` (no such live card, or one for another Space), `card_mismatch` (the token on
the wrong chip), `card_paused` (the card's face is paused, `LIVE-1282`), `checkin_not_set_up` (the Space has never opened its Check-in panel, so it has no
door node), `already_captured` (already checked in today), and the verifier's own: `inactive`,
`not_yet_valid`, `expired`, `too_far`, `location_required`, `capacity_reached`, `bad_signature`,
`unknown_node`.

**`POST /api/v1/devices/cards`**

```json
{ "member_handle": "@maya" }
```

```json
{ "ok": true, "token": "abcdefghijklmnopqrstuv", "url": "https://frequencylocal.com/c/abcdefghijklmnopqrstuv", "member": { "display_name": "Maya" } }
```

The device writes `url` to the card as an NDEF URI record. On a scan it reads that record back and
sends the last path segment (`/c/<token>`) as `card_token`. The token is returned this once and
never stored in the clear. Refusals: `unknown_member`, `too_many_cards`.

**`GET /c/<token>`** is what the card opens on a phone: the reader's **own** `/rewards` (through
sign-in when signed out), or `/code-unavailable` for a revoked card. It checks nobody in.

### Write a card over USB (the CyberUnicorn console, `LIVE-1168`)

The **CyberUnicorn console** (`components/spaces/loyalty/cyberunicorn-console.tsx`) lives in the admin
menu at `/admin/cyberunicorn` (Growth, Acquisition), for platform staff only: web_role Admin or Janitor
(`requireAdmin('admin')`, and `consoleStaffGate` on every write). It moved off the Space's Check in tab on
the owner's call (2026-10-20, `LIVE-1180`): Spaces ask, staff write. It is the one surface in the
CyberUnicorn 5000 design system (`lib/theme/cyberunicorn.ts`, scoped to that block). It
talks to the board over Web Serial (Chrome or Edge on a computer) in the device's remote protocol v1
(`lib/device/`, a copy of `mobile/src/device/`; the device half is `cyberpunkunicorn-os/apps/remote/PROTOCOL.md`).
Writing a card needs no scanner registration and no device secret: the staff member's own session mints
it. Setting the board up as a counter scanner is below (`LIVE-1181`).

1. Connect. The port opens at 115200 8N1 with DTR and RTS set low in one call (the CYD's auto-reset
   circuit resets the ESP32 when they differ), then `system.status` is re-sent for up to 40 s until the
   board answers. Measured 2026-10-20: on macOS the CH340 driver resets the board on open regardless, and
   it takes about 18 s to reach the main menu, so every connect is a reboot and the console keeps one
   connection open. `hat.probe` reports whether the PN532 is live (DIP 3).
2. Pick who. A request from the queue (below) fills in the Space and the member; otherwise staff type
   the Space's link name and the member's handle. Program and Check a card stay off until `hat.probe`
   finds the PN532, and "Look for the reader" probes again without a reconnect.
3. Program. Staff pick **Member card (every Space)** (the default) or **Space card (opens this Space)**,
   and `startConsoleCard(kind, spaceId, handle)` mints it (same token and hash as a scanner-issued one,
   `issued_by` null, numbered; see "Member cards" below). The page sends
   `frequency.write_tag { url, label, timeout_ms: 30000 }`; the device emits `frequency.waiting_for_tag`,
   writes the NDEF URI to the NTAG and reads it back.
4. Bind or discard. On success `finishConsoleCard` binds the chip UID at once and closes the member's
   badge request. On a definite device
   failure (no card in time, not an NTAG, write failed) `cancelConsoleCard` deletes the mint (its number
   is not reissued), and it
   deletes only an unbound, never-used, console-minted row. When the outcome is unknown (cable pulled,
   no reply) the mint is kept: the card may be good, and its first counter scan binds it.

"Check a card" runs `frequency.read_tag` and shows what a tag holds. The page never logs a card token
(the device log in the panel masks `/c/<token>`), and the firmware's write log keeps host and path only.

### Badge requests (`LIVE-1180`)

A member asks a Space for a scannable badge from the Space's page: a line under the Regulars line
(`components/spaces/badge-note.tsx`) reads **Get a scannable badge** (signed out: a sign-in link),
**Badge requested** once they asked, or **Your badge works here** once they hold a live card there.
The button files one `badge_requests` row (migration `20270346018000_badge_requests.sql`, service role
only, one pending row per member per Space, so a second tap is a no-op). The console lists pending
requests oldest first; **Use** fills in the Space and the member, **Clear** cancels the request, and a
written card marks it done and points it at the card. A request filed against the Frequency root Space
(`loadRootSpaceId`) is a request for a member card and the queue labels it **Member card**. A member
card closes every pending request the member filed, since it checks in at each of those Spaces; a Space
card closes the one at its Space. A live Frequency-wide card reads as **Your badge works here** on every
Space's page. Behind `SCANNER_DEVICES_ENABLED` like the rest.

### Member cards (`LIVE-1282`)

Decision: [ADR-1874](DECISIONS.md). Schema: migration `20270346024000_member_card_faces.sql`. Rules
with no IO: `lib/member-cards/face.ts`; reads and writes: `lib/member-cards/store.ts`. Rides
`SCANNER_DEVICES_ENABLED`.

**The face.** A card always holds the same `/c/<token>` link. What a phone tap opens is the card's
face, one `card_faces` row per owner (a member, or a Space), set on the website: `page` (the owner's
own page, and the default when there is no row), `card` (the virtual card at `/card/<token>`, with
Save contact and Swap contacts), or `link` (one https link). `paused` stops every tap and every
counter check-in. A member's face never carries a perk.

**The tap decision** (`tapTarget`, run by `app/c/[token]/route.ts`): a paused face shows "This card is
paused." and nothing about the owner; the owner tapping their own member card lands on `/crew/card`;
otherwise the mode decides (`link`, `card`, then `page`). A tap checks nobody in.

**Member card.** Frequency-wide: `space_id` null, so every Space's counter scanner takes it, and its
taps read the holder's own face. Getting one is a Crew perk: the console refuses a member who is not
Crew (`isCrewMember`, the real effective tier) with "Member cards come with Crew. Ask them to join Crew
first." Holding and controlling a card needs no tier, so a lapsed member can still pause theirs. A
member holds at most 5 live Frequency-wide cards (`SCANNER_LIMITS.cardsPerMember`).

**Space card.** Registered to one Space: `face_space_id` and `space_id` are both that Space, so its
taps open the Space's face and it checks in at that Space only. It goes to someone on the Space's team
(its owner, or an active member above viewer) and needs no Crew. The cap is the per-Space one.

**The number.** Every console card takes the next number from `next_member_card_number()` (one
sequence for all of Frequency, never reissued, so a discarded mint burns its number). 1 to 100 is the
Founders edition, every later number a Crew card (`cardEdition`). After a write the console shows the
line to print or write on the card, like `No. 0042 · Founders edition` (`formatCardNumber`). Cards
written before numbering have no number and keep working.

**The perk.** A Space may set one cardholder perk (`card_faces.cardholder_perk`, up to 120
characters, any plan). When a numbered member card checks in at that Space, the scan reply carries it
as `perk`. A Space card, or an unnumbered card, gets no perk line.

**At the counter** (`lib/devices/scan.ts`). After the chip check, a Space card reads its Space's face
and every other card its holder's; a paused face refuses with `card_paused`. A check-in adds
`greeting` ("Welcome back, Maya", or "Welcome back" with no display name) and, as above, `perk`
("Cardholder perk: free oat milk upgrade"). Both are optional fields: the firmware reads the reply by
name and skips anything it does not know.

### Setup and scans over the cable (`LIVE-1181`)

The same console makes the plugged-in board a Space's **counter scanner** without typing on it (build
plan phases 3 and 5; device half `cyberpunkunicorn-os/apps/remote/PROTOCOL.md`, "Setup over the cable"
and "Scans through the cable").

- **On connect** the page reads `system.caps`, sets the board clock with `system.time { epoch }` (again
  on every `hello`, since the board has no battery clock), reads `frequency.config`, and pings
  `system.status` every 10 s. The board relays through the cable only when it heard from the page in
  the last 30 s, its clock is set, it is provisioned, and it has no Wi-Fi.
- **Make it the Space's scanner.** `provisionConsoleScanner` (staff only, `registerScannerFromConsole`)
  registers a scanner for the chosen Space and returns its id and one-time secret to the page, which
  sends `frequency.provision { device_id, secret, base, reader: true }`. The secret goes to the board
  and is never shown. Switching Spaces revokes the old scanner id; **Forget setup** sends
  `frequency.unprovision` and revokes it too. The scanner then shows on the Space's Check in tab.
- **Wi-Fi** by `wifi.scan` and `wifi.join`. A board on Wi-Fi posts scans itself with its secret header.
- **A scan through the cable.** The board emits `frequency.scan_relay { nonce, device_id, body, signature }`.
  The page (`lib/device/cable-scan.ts`) posts `body` byte for byte to `POST /api/v1/devices/scan` with
  `X-Frequency-Device-Id` and `X-Frequency-Signature` and no secret, then answers
  `frequency.relay_reply { nonce, status, body }` (`status` 0 when the server was unreachable, so the
  board queues). **Test a check-in** runs `frequency.scan`; through the cable its reply carries `relay`,
  which the page posts itself.
- **The server check** (`signatureMatches`, `authenticateSignedDevice`): HMAC-SHA256 keyed on the 32 raw
  bytes of the stored `sha256(secret)`, over `scan:v1:<device id>:<body>`, sent as `v1=<hex>`. Only the
  scan route takes it. A signed scan also needs `scanned_at` within 300 s of the server clock
  (`400 stale_scan`) and a `nonce` not seen from that device in the window (`409 replayed`, Upstash
  `SET NX`; with no Upstash the window and the once-a-day ledger bound a replay). Keying on the stored
  hash means a database leak could forge that Space's cable scans, the same blast radius as a leaked
  device secret: revoke the scanner either way.
- The on-screen device log runs every line through `redactLine` (`lib/device/protocol.ts`), which masks
  `secret`, `password`, `card_token` and `signature`.

### Check-in placards (`LIVE-1182`)

A placard is an NFC sticker with a Space's door check-in link on it. A member taps it with their phone
and lands on the same check-in the door QR code runs, which stamps their Regulars card. No app, no card,
no scanner at the counter. Staff (Admin and Janitor) write placards from the CyberUnicorn console at
`/admin/cyberunicorn` with the Unicorn plugged in over USB.

- **Pick a Space.** Any Space, not only ones you run. `startSpaceTag` (`lib/devices/tag-actions.ts`)
  finds the Space's door node, or makes one through `ensureCheckinNodeForStaff` (`lib/spaces/checkin.ts`)
  if it has none, and returns its signed link from `signedNodeUrl` (`lib/qr/node-code.ts`):
  `/n/<node>?s=<code>`.
- **Write it.** The console sends `frequency.write_tag` with that link, and you hold an NTAG213, 215 or
  216 sticker on the reader. The link is about 95 characters, so the smallest chip, the NTAG213, holds
  it with room to spare.
- **List it.** `finishSpaceTag` records the chip the board read back (its serial, chip type, a label like
  "front door", and who wrote it) in `public.space_tags`. The console shows the Space's placards, and
  `dropSpaceTag` takes one off the list.
- **Try it.** The console then asks you to tap the placard with your phone. `checkPlacardTap` polls
  check-ins (captures) on that node since the write and shows "<name> checked in" when one lands.

The table is service role only (RLS on, revoked from `public`, `anon` and `authenticated`; `internal` in
`scripts/table-grants.txt` and listed in `scripts/rls-deny-all.txt`). Every read and write in
`lib/devices/space-tags.ts` runs behind `consoleStaffGate`. The table is an inventory and takes no part
in the check-in itself. **Removing a placard from the list does not turn it off.** Signed node codes do
not expire, so the link on the sticker keeps working. To stop a placard, peel it off the wall.

**The screen mirror.** The console also shows a live copy of the Unicorn's screen, with Next, Prev,
Select and Back buttons that send `screen.nav`, and plays the board's boot animation while it boots. It
rides Bruce's `display start` stream (`lib/device/screen-mirror.ts`). Its limits:

- USB only. Nothing mirrors over Wi-Fi or the internet relay.
- Bruce mirrors drawing calls, not pixels, so screens drawn from sprites (the boot scene, Light Show,
  Spectrum) show as blank or as a placeholder. The board itself looks fine.
- Bruce can stop the stream without saying so. If the mirror freezes, press **Refresh** in the console.

### Try it locally

1. `SCANNER_DEVICES_ENABLED=1` (and `LOYALTY_ENABLED=1` to see stamps) in `.env.local`, apply the
   migration to the local or a branch database, `pnpm dev`.
2. As the owner, open the Space's Manage console, Offerings & Money, Check-in & scanners (or
   `/spaces/<slug>/full?panel=checkin`). Opening it mints the door node. Under
   "Counter scanners", add a scanner and copy its key (shown once).
3. Issue a card and scan it:

```bash
curl -s -X POST localhost:3000/api/v1/devices/cards -H 'content-type: application/json' -H "X-Frequency-Device: $KEY" -d '{"member_handle":"maya"}'
curl -s -X POST localhost:3000/api/v1/devices/scan -H 'content-type: application/json' -H "X-Frequency-Device: $KEY" -d '{"card_token":"<token>","uid":"04A21F9C"}'
```

## 8. Internet relay (`LIVE-1155`, [ADR-1870](DECISIONS.md))

The owner's phone controls a registered device (the CyberUnicorn 5000) from any network. Both are
**clients** of Supabase Realtime and meet on one private Broadcast channel, `device:<scanner id>`, so
neither opens a port. The device side and the payloads are the CyberUnicorn remote protocol v1,
section 6 (`cyberpunkunicorn-os/apps/remote/PROTOCOL.md`): the phone broadcasts `rpc` with
`{line:"rpc {...}"}`, the device answers `reply` / `evt` with the `@rpc` / `@evt` line, and
`track()`s presence. Behind `DEVICE_RELAY_ENABLED` (envFlag, needs `SCANNER_DEVICES_ENABLED`); the
gate is in `docs/RUNBOOKS.md` "Internet relay".

**Pieces.** Migration `20270346015500_device_relay.sql`. `lib/devices/relay.ts` (the token, pure) and
`lib/devices/relay-store.ts` (IO). Routes `POST /api/v1/devices/realtime-token` (device wire),
`GET /api/v1/me/devices` and `PATCH /api/v1/me/devices/{id}` (app contract, bearer or cookie).

**Who manages a device.** One SQL rule, `public.relay_manageable_devices(profile)`: the device is
active and the profile is its personal owner (`device_relay_settings.owner_profile_id`), the owner of
its Space, or an active admin of its Space. The phone's list and the channel policy both call it.

**The device token.** `POST /api/v1/devices/realtime-token` with `X-Frequency-Device` and no body.
Reply `{ok:true, token, expires_at, channel, realtime_url, apikey, allowed_cmds}`. The token is an
HS256 JWT signed with `SUPABASE_JWT_SECRET`, 15 minutes, claims `role: "anon"`, `sub` and
`device_id` = the device id, `frequency_kind: "device"`. Refusals: 404 `not_enabled`, 401
`device_unauthorized`, 429 `rate_limited` (10 a minute per device), 503 `not_configured` (no secret),
200 `ok:false` `relay_disabled` (the manager switched it off, or never on). The device re-mints about
two minutes before `expires_at` or on a 401, and sends the new token as an `access_token` push.

Two differences from the protocol draft, both on purpose: `sub` is the bare device id (a uuid; a
`device:` prefix would make `auth.uid()` raise in any other policy Realtime evaluates), and the role
is `anon`, not `authenticated` (in PostgREST the token reaches only what a signed-out visitor can).

**Realtime authorization.** Four policies on `realtime.messages`, Broadcast and Presence only:

| Who | Role | May receive and send on |
|---|---|---|
| A device token | `anon` + `frequency_kind = device` | `device:<its device_id>`, while active with the relay on |
| A member session | `authenticated` | `device:<id>` for a device they manage whose relay is on |

Realtime checks policies at join and on token refresh, not on every message. The command allow-list
(`allowed_cmds`, never `cli.run`) is therefore enforced **on the device**, which receives it in the
token reply; the owner narrows it with `PATCH /api/v1/me/devices/{id}`.

**Switches.** `relay_enabled` defaults off per device. The owner turns it on with
`PATCH /api/v1/me/devices/{id}` `{"relayEnabled": true}`. `{"owner": "me"}` makes the caller the
device's personal owner, so they keep control even without a Space role.

Not built: the audit table of relayed commands (protocol section 6, item 5, optional), and an owner
panel for the switch on the web (the phone's PATCH is the only control today).

**Staff Wi-Fi remote (`LIVE-1186`).** The portal at `/admin/cyberunicorn` has a "Wi-Fi remote"
feature for Admin and Janitor. It lists every active device (`listRelayDevicesForConsole`), switches a
device's relay on or off (`setConsoleRelay`, writing `device_relay_settings` as the caller), and drives
it with the same `RpcClient` over `lib/device/relay-transport.ts`. Migration
`20270346020000_relay_staff_join.sql` adds the staff branch to `private.relay_member_may_join`: staff
may join `device:<id>` for any active device whose relay is on. `relay_manageable_devices` is
unchanged, so the phone's list still follows the owner and Space-admin rule. The board answers only its
allow-list over the relay, so placards, badges, scanner setup and the live screen stay on USB.

## 9. Firmware updates (`LIVE-1186`)

The portal's "Update firmware" feature installs the newest CyberUnicorn OS over USB, replacing the
Terminal `./flash.sh` step. Releases are GitHub releases on `hellofrequencylab/projects` tagged
`cu5k-v<version>` with `app.bin` and `manifest.json` (board `cyd-2432s028r`, `app.offset` 0x10000,
`app.size`, `app.sha256`). `lib/devices/firmware.ts` reads and checks them; the browser cannot fetch
release assets itself (no CORS), so two staff-only routes proxy them:
`GET /api/devices/firmware` (the newest release, or null) and
`GET /api/devices/firmware/app?tag=` (the checked `app.bin`). Both answer 404 while
`SCANNER_DEVICES_ENABLED` is off. `lib/device/flasher.ts` loads `esptool-js` only when the button is
pressed, checks the sha256 again, writes `app.bin` at 0x10000 at 230400 baud and verifies the MD5. The
bootloader, the partition table and NVS are left alone, so Wi-Fi, the device credential and settings
survive. After an install the board needs unplugging for 5 seconds. Set `GITHUB_TOKEN` to lift
GitHub's anonymous rate limit.
