# Data governance: export and delete

**A member can download everything Resonance stores about them, and they can
delete it.** Both run server-side over the `resonance` schema, scoped to one
verified user id, and never touch another member's rows.

| ✅ Now | Surface |
|---|---|
| Export own data (JSON download) | `GET /api/account/export` |
| Delete own data (typed confirm) | `POST /api/account/delete` `{ "confirm": "DELETE" }` |
| Member UI for both | `/dev/account` |
| Shared logic | `lib/governance/repo.ts` |

## Controller / processor stance

Resonance is the **controller** for the member data it holds: it decides what is
collected (the tables below) and serves the member's access and erasure rights
directly. Supabase is the **processor** that stores it. There is no third party
in the data path; AI features do not persist member rows. Identity arrives as a
trusted `uuid` (own auth id, or a host-federated id in embedded mode), never as a
join into another schema (ADR-002), so governance acts on values this app owns.

## What Resonance stores per user

Every user-keyed table in the schema, and the column that carries the id:

| Table | User column(s) | What it is |
|---|---|---|
| `profiles` | `user_id` | Display name, avatar, bio (per world) |
| `venue_seats` | `occupant_user_id` | A seat the user currently holds |
| `queue_items` | `user_id` | Tracks the user queued as a DJ |
| `votes` | `user_id` | The user's awesome/lame votes |
| `zaps_ledger` | `user_id` | Currency ledger rows (balance = sum of deltas) |
| `reputation` | `user_id` | Per-season DJ points and rank |
| `event_tickets` | `user_id` | Tickets the user holds |
| `events` | `host_user_id` | Events the user hosts |
| `presence_pings` | `user_id` | Live heartbeat rows (per venue) |
| `user_inventory` | `user_id` | Cosmetics the user owns |
| `game_scores` | `user_id` | Per-venue mini-game scores |
| `creator_earnings` | `creator_user_id`, `buyer_user_id` | Revshare rows where the user earned or paid |

The single source of enumeration is `OWNED_TABLES` (plus the hosted-events pass)
in `lib/governance/repo.ts`. Add a user-keyed table there and both export and
delete pick it up.

## How export works

`GET /api/account/export` (auth required) calls `exportUserData(userId)`, which
selects every row matching the caller's id in each table and returns a map of
`table -> rows`. The response is a JSON document
(`{ userId, exportedAt, data }`) served as an attachment download
(`resonance-data-export.json`).

If a table cannot be read, export records it as an empty list plus a
`<table>__error` note instead of failing, so one gap never blocks the download.

## How deletion works

`POST /api/account/delete` requires the body `{ "confirm": "DELETE" }` (a request
without it is rejected 400, so a stray POST never wipes an account). It calls
`deleteUserData(userId)` and returns `{ ok: true, deleted }`, a per-table count of
rows removed.

**Order.** Hosted events are deleted first. Deleting a row in `events` cascades
its `event_tickets` (migration 0008), so clearing hosted events before the
per-user passes keeps the counts clean. Every other table is then purged by the
user-id column.

**What is removed.** The user's own rows in every table above: profile, seat,
queue items, votes, ledger entries, reputation, tickets, presence pings,
inventory, scores, and earnings rows where the user was either the creator or the
buyer. Plus the events the user hosts.

**What cascades.** Deleting a hosted `events` row removes that event's
`event_tickets` for all attendees (the event no longer exists, so its tickets
cannot). This is a deliberate choice: a hosted event is treated as the host's
data. Live `venue_seats` and `presence_pings` also clear, which simply drops the
user out of any room they were in.

**What is intentionally kept.** Aggregate effects that have already settled are
not reversed. Zaps the user *received by others' actions* and revshare already
credited stay reflected in other members' balances and in counterparties' rows;
deletion removes the user's own rows, not other members'. A counterparty's
`creator_earnings` row that names the deleted user only on the *other* side is
left intact, because it is that other member's record of their own sale or
purchase.

**Safety.** Every query filters on the caller's verified id only. Deletion is
defensive: a table that cannot be purged is recorded with a `-1` count and
skipped, so one gap never aborts the rest of the purge.

## Isolation note

All of this lives in the `resonance` schema and runs through the service-role
client (`lib/supabase/server.ts`), matching the isolation contract
(`docs/ISOLATION.md`): no cross-schema reach, identity is a trusted value, and the
whole governance surface lifts with the app in a breakout.

## Deferred (future work)

| ⏳ Item | Note |
|---|---|
| Per-world RLS policy convergence | Tables run RLS-on, no-policy (service-role only). A future multi-tenant `worlds` model wants real per-world policies so governance can also be enforced at the row level, not only in the data layer. |
| Region pinning | Data residency (pinning member rows to a region) is not modeled yet. |
| Versioned consent | Recording which consent/policy version a member agreed to, and re-export of that record, is not built. |
| Async erasure receipt | Deletion is synchronous and returns counts; a durable, timestamped erasure receipt (and soft-delete grace window) is future work. |
