# Anon-callable SECURITY DEFINER functions: review (SCAN-1224)

Status lives in [`docs/BUILD-BACKLOG.json`](../BUILD-BACKLOG.json) (row SCAN-1224); findings are filed as their own rows.

Reviewed 2026-11-16 against production (Frequency Community, project `azsqfeonabsbmemvddqd`) with read-only
`execute_sql`. Nothing was changed and no migration was applied. The set is every `public` function with
`prosecdef = true` that `anon` holds `EXECUTE` on: 23 rows (the advisor's count). A definer runs with its owner's
rights, so each one must prove its own authorization inside the function. All 23 pin `search_path`, except the three
`st_estimatedextent` overloads (PostGIS, extension-owned, one-line wrappers).

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

## Public readers (13)

`public_events`, `public_event_by_slug`, `public_circles`, `public_circle_by_id`, `public_circle_by_slug`,
`public_posts`, `public_featured_posts`, `public_organizer_events`, `public_organizer_handles`,
`public_member_count`, `public_active_circle_count`, `space_public_unavailable`, `space_wall_feed`.

- Events: each filters to published, not removed, not cancelled, not demo, public visibility (the by-slug reader also
  allows unlisted, which is link-only by design) and re-applies the Space wall (`visibility = 'network'`, active), since
  a definer bypasses row security. `public_organizer_events` also hard-excludes unlisted and demo, and bounds the past
  tail to 180 days.
- Circles: `public_circle_by_id`, `_by_slug` and `public_circles` gate through `private.can_see_circle(...)` (the
  `public_circles` body is 362 bytes and was read as the same shape; its gate was not read line by line).
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
