# Engagement Mechanics — `lib/engagement/`

> **Scope: the implementation.** [ENGAGEMENT-ARCHITECTURE.md](ENGAGEMENT-ARCHITECTURE.md)
> describes the *backbone* (the SOURCE → VERIFY → LEDGER + RULES → REWARD pipeline) and
> deliberately leaves mechanics open. This doc is the reference for the concrete code that
> realizes that backbone today: the four modules under `lib/engagement/`. Code +
> `supabase/migrations/` remain the source of truth; this just maps the moving parts so you
> don't have to re-derive them from the files.

The reward economy itself (point values, which action earns what) is still a product
decision — see [START-HERE.md](START-HERE.md) Part B and CHECKLIST. What's built is the
*plumbing* that makes earning exactly-once, server-verified, and source-agnostic.

---

## Module map

| File | Role in the pipeline | Purity |
|---|---|---|
| `events.ts` | **LEDGER.** Append an engagement event exactly once, then fan out to the rules engine + automations. | DB-touching (admin client) |
| `verify.ts` | **VERIFY.** Server-authoritative checks for a physical capture (validity window, signed payload, capture rule, proximity). No writes, no rewards. | DB-touching (admin client) |
| `capture.ts` | **ORCHESTRATION.** Ties VERIFY → LEDGER → audit row → REWARD for node captures (QR / NFC / ghost nodes). | DB-touching (admin client) |
| `currency.ts` | **REWARD routing.** Maps an engagement `source` → the currency it earns (`gems` vs `zaps`). | Pure, framework-independent |

Everything is **server-only** (it uses `createAdminClient()`). None of it is wired to UI
yet — it's infrastructure ready for the wiring in START-HERE Part B.

---

## The ledger (`events.ts`) — exactly-once is the whole point

`recordEngagementEvent(input)` upserts one row into `engagement_events` with
`onConflict: 'idempotency_key', ignoreDuplicates: true`. A conflicting key returns **zero
rows**, so `recorded` comes back `false` and **no reward is granted**. That single
mechanism is what makes retries, double-taps, and at-least-once delivery safe.

```
recordEngagementEvent({ idempotencyKey, source, eventType, actorProfileId, context?, verifiedAt?, gamificationEvent? })
  → upsert engagement_events (ON CONFLICT DO NOTHING)
  → recorded === inserted a new row?
        ├─ yes → if gamificationEvent: processGamificationEvent(...)   // existing rules engine
        │        runAutomationsForEvent(eventType, actor)             // ADR-025 backbone, guarded
        └─ no  → no-op (duplicate)
```

Key properties:

- **It sits in front of the existing gamification system, it does not replace it.** Direct
  callers of `processGamificationEvent` keep working; new sources flow through the ledger so
  they additionally get persistence + exactly-once + a verification hook.
- **`gamificationEvent` is optional.** Supply it for sources that map to a typed
  `GamificationEvent` (most web actions); omit it for sources whose reward is granted
  directly by the caller (node captures award zaps in `capture.ts`).
- **Automations are guarded** — `runAutomationsForEvent` is wrapped in try/catch so a
  misbehaving automation can never break event recording or the reward path.

`EngagementSource` = `'web' | 'task' | 'qr' | 'nfc' | 'geo' | 'p2p' | 'system'`.

---

## Verification (`verify.ts`) — never trust the device

GPS coordinates and QR/NFC payloads are trivially spoofable, so a capture is only trusted
after the **server** clears it. `verifyCapture(attempt)` runs, in order:

1. **Node exists** → else `unknown_node`.
2. **Active** → else `inactive`.
3. **Validity window** (`valid_from` / `valid_until`) → else `not_yet_valid` / `expired`.
4. **Signed payload** — a node with a `secret` only accepts the matching `presentedSecret`
   → else `bad_signature`.
5. **Capture rule** — `once_per_user` / `once_global` block repeats by counting prior
   verified `captures` → else `already_captured`.
6. **Proximity** — when the node sets `proximity_m` + `location`, the geo math is delegated
   to PostGIS via the **`node_within_range` SECURITY DEFINER RPC** (not done in JS) →
   `location_required` if the device sent no position, `too_far` if outside the radius.

It returns `{ ok, reason? }` and **writes nothing** — verification and reward are separate
concerns. See [ENGAGEMENT-ARCHITECTURE.md §2](ENGAGEMENT-ARCHITECTURE.md).

---

## Capture orchestration (`capture.ts`)

`captureNode(attempt)` is the end-to-end physical-engagement flow:

1. **Verify** (`verifyCapture`). On failure, return the reason — nothing else happens.
2. **Look up the node** (`type`, `zaps_value`, `partner_id`).
3. **Ledger** the capture exactly-once, keyed `node:<nodeId>:<actorProfileId>`. A duplicate
   short-circuits with `already_captured` (a second guard on top of the capture rule).
4. **Audit row** in `captures` (`verified: true`).
5. **Reward** — physical sources earn **zaps**; award `node.zaps_value` when
   `currencyForSource(source) === 'zaps'` and the amount is positive.
6. **North-Star `practice.verified`** — a proximity-verified physical capture is also a
   verified practice (the actor was really there), so it emits this event once per
   `(node, actor)` keyed independently (`practice_node:…`) — **except** purely commercial
   partner-plaque bumps (`node.partner_id` set).
7. **Partner plaque** — when `partner_id` is set, log a `partner_redemptions` row and return
   the active offer's title so the UI can surface the unlocked offer.

Node-type → source mapping lives at the top of the file: `qr → 'qr'`, `nfc → 'nfc'`,
`ghost → 'geo'`.

> **Known gap (tracked):** repeatable nodes need a request-scoped suffix appended to the
> idempotency key so legitimate repeats aren't collapsed into the first capture. Pass it
> through `attempt` when that lands (START-HERE Part B3).

---

## Currency routing (`currency.ts`)

The one pure module. `currencyForSource(source)`:

- **`gems`** — internal, on-platform web engagement (`web`); plus `system`/neutral grants.
- **`zaps`** — external + in-person: `task` (crew/outreach), `qr`, `nfc`, `geo`, `p2p`.

At season end, zaps convert to gems at a rank-based rate (`reset_season`); gems buy digital
badges and trade for physical merch. See [GLOSSARY.md](GLOSSARY.md) and ADR-013/ADR-024 for
the currency model. Being pure + framework-independent, this is the natural unit-test target
(`currency.test.ts`) — see [DECISIONS.md ADR-042](DECISIONS.md) for the test-strategy rationale.

---

## Related

- [ENGAGEMENT-ARCHITECTURE.md](ENGAGEMENT-ARCHITECTURE.md) — the backbone / why it's shaped this way.
- [DATABASE.md](DATABASE.md) — `engagement_events`, `nodes`, `captures`, `partner_*` tables.
- Migrations: `…_engagement_events.sql`, `…_physical_nodes.sql`, `…_node_zaps_value.sql`, `…_partners_module.sql`.
- ADR-025 (automation backbone), ADR-028 (agent/test harness gate).
