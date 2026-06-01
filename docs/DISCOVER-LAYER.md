# Public Discover Layer — RPCs & security

> **Scope: the public read layer.** Everything an *anonymous* visitor or a crawler can see
> of community content flows through this one module (`lib/discover.ts`) and a small set of
> **column-safe, location-redacted** Postgres functions. This doc is the security contract
> for that surface. Code + `supabase/migrations/` are the source of truth.

The authed app is `robots`-disallowed, so the `/discover/*` pages are the **only indexable
community URLs** — which is exactly why the redaction below is load-bearing, not cosmetic.

---

## The one rule: never give anon a broad table SELECT

Crawlers and anyone with the anon key can hit the raw PostgREST API directly, so a
row-level `SELECT` policy leaks **every column of every matching row** regardless of what
the app's `.select()` asks for. The defense is to expose reads only through **`SECURITY
DEFINER` functions that hand-pick the returned columns**. The caller cannot widen them.

This continues the principle established in `20240204000000_public_landing_reads.sql` and
hardened in `20240211000000_public_discover_reads.sql` — the latter **dropped** an earlier
anon `SELECT` on `events` that had been returning the full row (including the free-text
`location` address) straight from the REST API.

### What is redacted

| Entity | Anon may see | Never exposed to anon |
|---|---|---|
| Event | title, description, start/end, **owning circle's city** | `events.location` (exact venue / address) |
| Circle | name, about, type, member count, status, **city**, channel | `neighborhood`, `latitude`, `longitude` |
| Post | body, created_at, media, a safe author shape (display name, handle, avatar) | author internals beyond that shape |

City is the coarsest detail that ever leaves the data layer.

---

## The RPCs (`SECURITY DEFINER`, `STABLE`, `SET search_path = public`)

Each is `GRANT EXECUTE … TO anon, authenticated` and returns a fixed `RETURNS TABLE` shape
that mirrors a `Public*` type in `lib/discover.ts`. Limits are clamped server-side
(`GREATEST(1, LEAST(_limit, 200))`).

| RPC | Wrapper in `lib/discover.ts` | Returns |
|---|---|---|
| `public_events(_limit)` | `getPublicEvents` | upcoming, non-cancelled events; city via owning circle; **no location** |
| `public_event_by_slug(_slug)` | `getPublicEventBySlug` | one event regardless of date (so a just-passed event page still renders) |
| `public_circles(_limit)` | `getPublicCircles` | active circles, ordered by member count, city only |
| `public_circle_by_id(_id)` | `getPublicCircleById` | one circle, same safe shape |
| `public_posts(_limit)` | `getPublicPosts` | recent posts with a safe author shape |
| `public_member_count()` / `public_active_circle_count()` | `getPublicCounts` | scalar counts (from `20240204000000`) |

`topical_channels` is read differently: it's a **public-read table** (anon `SELECT` allowed
since `20240201000000`), queried directly with an explicit column list and `is_active = true`
in `getTopicalChannels` / `getTopicalChannelBySlug`. There's no sensitive column to redact,
so an RPC would add nothing.

`getPublicCirclesByChannel` does **not** add an RPC — `public_circles` doesn't filter by
channel, so it fetches the top circles (capped at 200) and narrows in JS. Fine at current
scale; revisit if channels grow large.

---

## The client (`lib/supabase/public.ts`) — cookieless anon

`createPublicClient()` is a `@supabase/ssr` server client that authenticates as the **`anon`
role** (so RLS is fully enforced) and is deliberately **cookieless** — its `getAll`/`setAll`
are no-ops. Two consequences:

1. **No dynamic-rendering opt-in.** Unlike `lib/supabase/server.ts`, it never touches
   `cookies()`, so `/discover` pages can be statically generated / ISR-cached and used inside
   `generateStaticParams` at build time.
2. **Defense in depth.** Even if an RPC were mis-granted, the anon role + RLS is the second
   wall; the column-safe RPCs are the first.

> Two reader paths bypass these RPCs **intentionally** and must not be confused with the
> public layer: the shareable `.ics` route and other server work use the **service-role admin
> client** (RLS-exempt by design), and all in-app reads run as the logged-in user under the
> normal in-scope RLS policies.

---

## Adding to the Discover surface — checklist

1. Need a new field anon can see? **Add it to the RPC's `RETURNS TABLE` and the matching
   `Public*` type** — never by widening a table policy.
2. New entity? Prefer a new `SECURITY DEFINER` RPC over an anon `SELECT` policy. Only use a
   public-read table when **no** column is sensitive (as with `topical_channels`).
3. Confirm no location-precise column (`location`, `neighborhood`, `latitude`, `longitude`)
   is in the returned set. City is the floor.
4. `GRANT EXECUTE … TO anon, authenticated` and clamp `_limit`.

---

## Related

- Migrations: `20240204000000_public_landing_reads.sql`, `20240211000000_public_discover_reads.sql`, `20240201000000…` (topical channels).
- [DATABASE.md](DATABASE.md) — table/RLS overview.
- `app/discover/*` — the pages that consume this layer; `app/robots*`/`sitemap` — indexability.
