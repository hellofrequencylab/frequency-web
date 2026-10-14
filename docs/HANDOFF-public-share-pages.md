# Handoff: public share pages (events first)

Status of record is docs/BUILD-BACKLOG.json (ledger). This file is a handoff note only.

Owner ask (Daniel, 2026-10-14): "Public event pages look like trash. All public links are designed for SEO/GEO as well as an eye catching experience. Make sure they are all well formatted, carry a share card with the info on it and allow people to buy / register before having an account (they get their account in the process)."

Branch: `claude/project-thread-pr9aip` (pushed, no PR open). One commit, row SCAN-867.

## Why the event page looked bad
- Signed-out visitors get the cached ISR page `app/(public)/events/[slug]/page.tsx`. Signed-in members are rewritten to `/events/<slug>/full` (lib/nav/member-event-rewrite.ts).
- Under Frequency, `(public)/layout.tsx` wraps pages in SiteShell with no container, so EventDetailTemplate ran edge to edge (no gutter).
- The guest RSVP form and guest ticket form exist (components/events/guest-rsvp-form.tsx, guest-ticket-form.tsx) but were only on the member page. The public page showed "Find your Circle".
- Share card (opengraph-image.tsx) and Event JSON-LD already existed for events.

## Done on the branch (PR 1, events, closes SCAN-867)
- `lib/events/public-join-door.ts`: cookie-free (admin client) loader and a pure `resolvePublicJoinDoor` that mirrors the member page's signed-out chain: guest RSVP (free, or "pay at the door"), guest ticket (tiers a guest can buy, flat price), sold out, sales not open yet, booking window closed, payouts not ready, members-only, ended, cancelled. Fail-soft: a read error keeps the old sign-up card.
- `components/events/public-join-door.tsx`: draws the door with the existing guest forms plus "Already on Frequency? Log in".
- `components/frequency/members/event/public-event-body.tsx`: the Event.html anatomy for the public page (split hero card with photo, title, when, where, host, going count and the join box; About and Where; Host and "New to Frequency?" panels). Its own kit scope inside the site `.wrap`. Not FqEventBody, because that body's panels call the cookie client and would void ISR.
- `app/themes/frequency/members-b.css`: `.fqm-public` scope, plus resets for site-kit class collisions (`.sec`, `.side`, `.panel`).
- Page: DAWN keeps EventDetailTemplate with the join door in the side card; Frequency returns the new body. Meta description no longer says "Sign in to RSVP".
- SCAN-867: `publicPageWhere` takes the free-text `location` when the address is visible; JSON-LD uses it as streetAddress and Place name; an event with no city takes the host Space's city (`getPublicEventVenue` returns `area`).
- `scripts/admin-client-baseline.txt` gains the join door with a reason line.
- Tests: lib/events/public-join-door.test.ts, lib/events/public-location-fallback.test.ts, app/(public)/events/[slug]/public-join-door.render.test.tsx. Related suites pass (lib/events, jsonld, event layout, ISR guard). check:backlog, check:admin-client, check:headers, check:phantom, check:tokens pass. Lint clean on changed files.

## Before pushing PR 1 from the Mac
- Run the app with NEXT_PUBLIC_SITE_DESIGN=frequency and open a signed-out event page: free event, ticketed event (payouts ready), hidden address, visible free-text address.
- Do a real guest RSVP and a real guest ticket purchase (payment stays on the page) and confirm the confirmation email's sign-in link attaches the RSVP or ticket.
- Merge fresh main, then `pnpm design:use dawn` before commit (committed tree stays DAWN stubs).

## Guest account default (picked, tell Daniel if changed)
Guests type an email and RSVP or pay. The confirmation email carries a sign-in link with the email prefilled; signing in attaches the seat or ticket (claim_guest_rsvps, claim-guest-orders-on-sign-in). No account is created from an unconfirmed address at checkout, because that would let anyone open an account under someone else's email.

## Left (one PR each, one ledger row each, under 40 files)
2. Circles: public Circle page (app/discover/circles/[id]) in the Frequency layout, check its share card and JSON-LD, and a guest join path if Circles allow joining without an account.
3. Spaces: public Space page (app/(public)/spaces/[slug]) gutter and layout check under Frequency (it uses FqSpaceChrome `.fqs-public` with no `.wrap`, likely the same edge-to-edge problem), share card check.
4. Journeys and Marketplace listings: app/discover/journeys/[slug] layout check; classifieds, housing, market and store pages under app/(public) have NO opengraph-image yet, so each needs a share card.
Also worth a follow-up: the member page's FQ_EVENT_KIT_LAYOUT is still false by the earlier ruling; only the public page changed.
