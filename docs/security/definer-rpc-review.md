# Anon-callable SECURITY DEFINER functions: review (SCAN-1224)

Status lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json) (row SCAN-1224); findings are filed as their own rows.

Reviewed 2026-11-16 against production (Frequency Community, project `azsqfeonabsbmemvddqd`) with read-only
`execute_sql`. Nothing was changed and no migration was applied. The set is every `public` function with
`prosecdef = true` that `anon` holds `EXECUTE` on: 23 rows (the advisor's count). A definer runs with its owner's
rights, so each one must prove its own authorization inside the function. All 23 pin `search_path`, except the three
`st_estimatedextent` overloads (PostGIS, extension-owned, one-line wrappers).

**Re-checked 2026-11-19** (same read-only method, after a cohesion audit found the catalog ahead of this page). The
live set is now 25: the 23 below, plus `public_circles_page` (shipped 2026-11-16 by migration `20270346066000`, after
this review was written) and `fw_relay_ingest_delta` (not from this repository; see "Stray function"). 21 of the 25
are created by this repository's migrations, 1 is the stray, 3 are PostGIS. Every first-party one pins `search_path`.
`node scripts/probes/definer-review-covers-anon-rpcs.mjs` (SCAN-1279) now fails when a `public`-verdict definer function
in `scripts/function-grants.txt` is missing from this page.

## Write-capable functions (7)

| Function | Reads / writes | Checks it makes | Verdict |
|---|---|---|---|
| `capture_guest_rsvp(event, email, name, tier)` | inserts or updates one `event_rsvps` row for a signed-out guest; returns only an opaque receipt | Email shape and length; the event must be published, not removed, not cancelled, public or unlisted, inside its booking window and before the door closes; tickets-mode events need a free tier of that event. Every refusal returns the same receipt, so it is not an oracle. A resubmit never moves the seat, never promotes off the waitlist and never renames an existing guest. Capacity is enforced by the `enforce_event_rsvp_capacity` trigger | Sound on authorization. **No rate limit inside the function**: see SCAN-1245 |
| `capture_signup_lead(...)` | upserts `signup_leads` by lower(email); returns `{id, claim_token}` | Email shape; source clamped to a fixed list; names truncated; payload and attribution capped at 8KB; first-touch attribution and `source` are immutable | Writes only marketing lead rows. **Any caller can rotate the claim token of an existing address**: see SCAN-1246 |
| `update_signup_lead(lead, token, ...)` | updates the named `signup_leads` row | Requires lead id and claim token; compares `sha256(token)` to the stored hash; same 8KB cap | Sound (122-bit token, hash compare) |
| `read_guest_seat(token)` | reads one RSVP, its event title and times, the event's questions and the guest's answers | Token resolves through `private.guest_seat_for_token`: hash match, guest row not claimed by an account, event published, not removed or cancelled, not yet ended | Sound; returns one seat's own data only |
| `update_guest_seat(token, plus_ones, answers)` | updates plus-ones (cap 5, no raising after start, only when going and approved) and upserts answers to that event's own questions | Same token gate; answer keys must be question ids of the seat's event; 2000 char cap | Sound |
| `release_guest_seat(token)` | sets the seat to not_going, zeroes plus-ones, clears the token hash | Same token gate | Sound |
| `handle_is_available(check_handle)` | one `exists` over `profiles.handle` | None needed | Returns a boolean about a value that is public on `/people/<handle>`. Throttled app-side at `/api/check-handle`. Accept |

## Public readers (14)

`public_events`, `public_event_by_slug`, `public_circles`, `public_circles_page`, `public_circle_by_id`, `public_circle_by_slug`,
`public_posts`, `public_featured_posts`, `public_organizer_events`, `public_organizer_handles`,
`public_member_count`, `public_active_circle_count`, `space_public_unavailable`, `space_wall_feed`.

- Events: each filters to published, not removed, not cancelled, not demo, public visibility (the by-slug reader also
  allows unlisted, which is link-only by design) and re-applies the Space wall (`visibility = 'network'`, active), since
  a definer bypasses row security. `public_organizer_events` also hard-excludes unlisted and demo, and bounds the past
  tail to 180 days.
- Circles: `public_circle_by_id`, `_by_slug` and `public_circles` gate through `private.can_see_circle(...)` (the
  `public_circles` body is 362 bytes and was read as the same shape; its gate was not read line by line).
- `public_circles_page(_limit, _offset)` (added 2026-11-19 re-check; body read in full from migration `20270346066000`
  and from `pg_get_functiondef` on production): a `language sql stable` reader with the same projection and the same
  predicate as `public_circles` (status forming or active, not unlisted), at most 200 rows per call, offset clamped to
  0..100000, ordered by member count, creation time and id. It takes no caller input beyond the two clamped integers,
  writes nothing and returns only columns the public circles list already shows. `search_path = public`. Called by the
  sitemap walk (`lib/discover.ts`, `walkPublicCirclesPast`). pgTAP: `supabase/tests/public_circles_page.test.sql`. Sound.
- Posts: `public_posts` and `public_featured_posts` return only `visibility = 'public'`, top-level, not hidden
  posts, with author display name, handle and avatar. These are public by intent.
- `space_wall_feed` requires `private.can_read_space_wall(space)` and `visibility = 'cluster'`. Its `reactions` column
  returns reactor profile ids; that is fine behind the gate. The gate's behavior for the `anon` role was not
  executed here.
- `space_public_unavailable` returns only calendar entries a manager marked `public_unavailable`, windowed to 400 days
  and 500 rows. It does not check the Space's own visibility; an entry the manager marked public is public.
- `public_member_count`, `public_active_circle_count`: counts only.

## Extension functions (3)

`st_estimatedextent(text,text[,text[,boolean]])` are PostGIS statistics readers returning a bounding box. The
advisor lists them on every PostGIS project. No data leaves beyond an extent; leave them.

## Stray function (1)

`fw_relay_ingest_delta(p_token text, p_keys text[], p_entries jsonb, p_report jsonb)` is in the production catalog and
in no migration here, no row of `supabase_migrations.schema_migrations`, and not in `scripts/function-grants.txt`.
Read on 2026-11-19:

- It belongs to FlowWeb. FlowWeb's schema lives in the other Supabase project (`hook`, `qakbtenvporcfkznivdh`), which
  holds `fw_runners`, `fw_mirror` and 34 `fw_*` functions including this one. Frequency Community holds this one
  function and none of the `fw_*` tables, so it was most likely run in the wrong SQL editor.
- It cannot run here. The body resolves a runner by `sha256(p_token)` in `public.fw_runners`, then replaces that
  account's rows in `public.fw_mirror`. Neither table exists in this database (in any schema), so every call ends in
  `42P01 relation "public.fw_runners" does not exist` before anything is read or written. `pg_stat_user_functions` has
  no calls recorded for it.
- Grants: `anon`, `authenticated` and `service_role` hold EXECUTE (the Supabase default privileges). Owner `postgres`,
  `SECURITY DEFINER`, `search_path = ''`, every relation schema-qualified.
- Risk: none today, because it fails closed. It would become a live anon write endpoint only if tables with those
  names were ever created here, and nothing in this repository creates them.
- Nothing in Frequency calls it: FlowWeb reaches Frequency through `/api/webhooks/flowweb-*` and
  `/admin/growth/funnels`, not through this RPC.

Owner ruling, 2026-11-19 05:39Z (Daniel, asked remove / lock to service role / leave): **leave it as is.** It stays in
the catalog with its default grants and is recorded here as a known stray; do not drop or re-grant it without asking
again. The static gates cannot see a function made by hand in the
database, so this is the catalog read to repeat; it must return only functions named on this page:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
order by 1;
```

## Revoking execute from anon

Not done, on purpose. Every write function above is called by the app through the request's cookie client
(`createClient`, role `anon` for a signed-out visitor): `app/(main)/events/guest-rsvp-actions.ts`,
`app/(main)/events/[slug]/seat/[token]/seat-actions.ts`, `lib/events/guest-seat.ts`, `app/join/(induction)/lead-actions.ts`,
`lib/create-space/draft-io.ts`, `app/api/check-handle/route.ts`. A revoke without moving those calls to the service
client first would break guest RSVP, the seat page, the join funnel and the Space draft. The follow-up for each is in the
findings below; revoking becomes safe once the callers use the service role behind their existing app-side rate limits.

## Findings filed

- SCAN-1245 (P2): `capture_guest_rsvp` can be called straight over PostgREST with the public anon key, bypassing the
  app's per-IP and per-event limits, to fill an event's capacity with made-up addresses.
  Migration `20270346063000` (written 2026-11-16, applied through the gated path) adds a cap inside the function: 60 new
  guest seats per event per hour, 300 per 24 hours. A room smaller than that can still be filled in one burst; the revoke
  described above is the full fix.
- SCAN-1246 (P3): `capture_signup_lead` rotates the claim token for an address already in the table, so a stranger who
  knows an address can take over that lead row and lock out the person's own browser.
  Migration `20270346064000` (written 2026-11-16, applied through the gated path) stops the rotation and makes the stored
  names and handle win. The payload still merges newest-wins and stays unverified.
