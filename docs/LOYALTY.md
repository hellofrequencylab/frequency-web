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
