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

## 7. Counter scanners (`LIVE-1113`)

The door code turned around: instead of the member's phone reading the Space's code, the Space's own
card reader (the CyberUnicorn 5000, an ESP32 with a PN532) reads the **member's** card at the
counter. The server then runs the Space's own check-in through `captureNode`, so the ledger, the
stamp, the 25 Zaps, hunts and the CRM timeline are the ones a phone scan gets. Nothing is
re-implemented. Behind `SCANNER_DEVICES_ENABLED` (envFlag); the gate is in `docs/RUNBOOKS.md`.

**Pieces.** Migration `20270346011500_scanner_devices.sql` (`scanner_devices`, `member_cards`,
both service role only). `lib/devices/` (credentials, store, scan, the device wire). Routes
`app/api/v1/devices/{scan,cards}` and `app/c/[token]`. Owner panel: Space settings, Check-in,
"Counter scanners" (`scanners-section.tsx`, under Regulars).

**Trust.**

- A device is registered by a Space owner (canEditProfile and the per-Space check-in function).
  Its secret (32 random bytes, base64url) is shown once; only `sha256(secret)` is stored. Revoking
  sets `active = false` and the next request is a 401.
- A card is an opaque token (16 random bytes, base64url); only `sha256(token)` is stored. A card
  minted by a device works at that device's Space only. `space_id null` (a Frequency-wide card) is
  allowed by the schema and the scan, with no issuer yet.
- The chip UID is bound on the card's first scan (an HMAC under the server signing key, never the
  raw UID). After that, the token on another chip, or with no UID, is refused as `card_mismatch`.
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
  "loyalty": { "stamps": 6, "required": 6, "earned": true, "reward_code": "K7Q2MX" }
}
```

`loyalty` is `null` when the Space does not run Regulars (or `LOYALTY_ENABLED` is off).
`reward_code` is present only when this scan filled the card. On `ok: false`, `member` is the card
holder when the card was recognized, else `null`; `zapsAwarded` is 0 and `loyalty` is `null`.
Reasons: `unknown_card` (no such live card, or one for another Space), `card_mismatch` (the token on
the wrong chip), `checkin_not_set_up` (the Space has never opened its Check-in panel, so it has no
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

### Try it locally

1. `SCANNER_DEVICES_ENABLED=1` (and `LOYALTY_ENABLED=1` to see stamps) in `.env.local`, apply the
   migration to the local or a branch database, `pnpm dev`.
2. As the owner, open the Space's settings, Check-in. Opening it mints the door node. Under
   "Counter scanners", add a scanner and copy its key (shown once).
3. Issue a card and scan it:

```bash
curl -s -X POST localhost:3000/api/v1/devices/cards -H 'content-type: application/json' -H "X-Frequency-Device: $KEY" -d '{"member_handle":"maya"}'
curl -s -X POST localhost:3000/api/v1/devices/scan -H 'content-type: application/json' -H "X-Frequency-Device: $KEY" -d '{"card_token":"<token>","uid":"04A21F9C"}'
```

## 8. Internet relay (`LIVE-1120`, [ADR-1870](DECISIONS.md))

The owner's phone controls a registered device (the CyberUnicorn 5000) from any network. Both are
**clients** of Supabase Realtime and meet on one private Broadcast channel, `device:<scanner id>`, so
neither opens a port. The device side and the payloads are the CyberUnicorn remote protocol v1,
section 6 (`cyberpunkunicorn-os/apps/remote/PROTOCOL.md`): the phone broadcasts `rpc` with
`{line:"rpc {...}"}`, the device answers `reply` / `evt` with the `@rpc` / `@evt` line, and
`track()`s presence. Behind `DEVICE_RELAY_ENABLED` (envFlag, needs `SCANNER_DEVICES_ENABLED`); the
gate is in `docs/RUNBOOKS.md` "Internet relay".

**Pieces.** Migration `20270346015000_device_relay.sql`. `lib/devices/relay.ts` (the token, pure) and
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
