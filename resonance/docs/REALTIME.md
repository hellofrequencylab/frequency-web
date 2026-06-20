# Realtime transport

**The answer:** Resonance talks to one realtime interface, `RealtimeTransport`.
Supabase Realtime implements it today. Moving to dedicated infra (PartyKit,
Liveblocks, Colyseus) later is a config change, not a rewrite: write one adapter
file, register it in the driver, set an env var. The seam is in place now so
that swap is low risk later. It is deferred infra work, not a feature.

## At a glance

| Piece | File | Status |
| --- | --- | --- |
| Contract (the interface) | `lib/realtime/transport.ts` | ✅ Stable |
| Supabase adapter (production) | `lib/realtime/supabase-transport.ts` | ✅ In use |
| Driver factory (env select) | `lib/realtime/driver.ts` | ✅ Ready |
| PartyKit adapter (skeleton) | `lib/realtime/partykit-transport.ts` | ⏳ Stub, not wired |

## The seam

`lib/realtime/transport.ts` defines the only contract that game, venue, DJ, and
sync code depend on:

- `RealtimeTransport.join(channel, handlers) -> Promise<RealtimeChannel>`
- `RealtimeChannel` with `send(event)`, `track(state)`, `leave()`
- `ChannelHandlers`: `onEvent`, `onPresenceSync`, `onJoin`, `onLeave`

Adapters implement this interface. Nothing above the seam knows which transport
is running.

## Selecting a driver

`createTransport()` in `lib/realtime/driver.ts` reads one env var and returns the
matching adapter.

| `NEXT_PUBLIC_RESONANCE_REALTIME_DRIVER` | Adapter | Behavior |
| --- | --- | --- |
| unset (default) | Supabase | Production realtime |
| `supabase` | Supabase | Production realtime |
| `partykit` | PartyKit stub | Safe no-op until wired |
| anything else | Supabase | Falls back to default |

The default path always works. An unknown value falls back to Supabase rather
than failing.

> Note: existing call sites (e.g. `components/dj/useVenue.ts`) import
> `createSupabaseTransport` directly. Switching them to `createTransport()` is
> the one-line change this seam enables. That migration is intentionally not
> done yet, so the working Supabase path is untouched.

## Current implementation: Supabase

`createSupabaseTransport()` uses Supabase Realtime Broadcast plus Presence (not
Postgres Changes), so it needs no DB publication and stays portable.

| Seam concept | Supabase mechanism |
| --- | --- |
| `join(channel, handlers)` | `supabase.channel(name)` then `subscribe()` |
| `send(event)` | Broadcast send (`{ type, event, payload }`) |
| inbound `onEvent` | Broadcast listener on event `"*"` |
| `track(state)` | Presence `track()` |
| `onPresenceSync` | Presence `sync` event + `presenceState()` |
| `onJoin` / `onLeave` | Presence `join` / `leave` events |
| `leave()` | `supabase.removeChannel(channel)` |

### Events on the wire

Broadcast event types are the sync channel constants (see `lib/sync/channels.ts`),
for example `room:update`, `venue:changed`, `vote:tally`, `chat`, `reaction`,
`zaps:awarded`, `rank:changed`. The transport is event-agnostic: it carries
`{ type, payload }` and the venue hook routes by `type`.

### Presence

`track(state)` publishes this client's presence payload (user id, name, avatar).
`onPresenceSync` receives the full keyed presence map; the venue hook flattens it
into the live roster.

## Adding a dedicated-infra adapter

Three steps, all additive:

1. **Implement `RealtimeTransport`.** Add `lib/realtime/<name>-transport.ts`
   exporting `create<Name>Transport(): RealtimeTransport`. Map your provider's
   broadcast and presence onto the same `ChannelHandlers`, and return a
   `RealtimeChannel` whose `send` / `track` / `leave` match the Supabase shapes.
   Keep the wire payloads equivalent so `transport.ts` stays the source of truth.
2. **Register it in `driver.ts`.** Add a `case` to the `switch` in
   `createTransport()` and a value to the `RealtimeDriver` union.
3. **Set the env var.** `NEXT_PUBLIC_RESONANCE_REALTIME_DRIVER=<name>`, plus any
   adapter-specific config (e.g. a room host URL).

`lib/realtime/partykit-transport.ts` is the worked skeleton: it implements the
interface as safe no-ops and documents exactly where the websocket connect,
presence mapping, and broadcast mapping go. It is dependency-free and never
throws, so selecting it without config cannot break a build or runtime; realtime
simply goes quiet and the UI falls back to snapshot refetch.

## Why this is deferred, not done

Supabase Realtime is the working transport and is good enough for current
concurrency. The dedicated-infra swap is infrastructure work to take on when
concurrency demands it, not a product feature. The value of this seam is that the
work is scoped and low risk: one new file, one `switch` case, one env var, with
zero changes above the interface.
