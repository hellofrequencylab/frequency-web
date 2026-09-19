# Frequency — SEO / AEO Plan

> **Status lives in [`docs/BUILD-BACKLOG.json`](docs/BUILD-BACKLOG.json)** — run `pnpm backlog`.
> This document is the spec and the rationale. It does **not** record what is done, because prose
> cannot be verified and this repo has lost that bet five times ([ADR-1043](docs/DECISIONS.md)).

**Status:** Phases 1–3 COMPLETE and pushed to `origin/main` (2026-05-28).
**Owner:** Daniel.
- Phase 1 (safety + foundation): leak closed, column-safe RPCs live, landing rewired, robots/sitemap/OG. Migrations pushed to prod.
- Phase 2 (public pages): `/discover` hub + topics/circles/events on the safe RPCs, dynamic sitemap. Commit `02693ac`.
- Phase 3 (AEO): JSON-LD (Organization/WebSite site-wide; Event/ItemList/BreadcrumbList; FAQPage on hub).
**Remaining manual step:** submit `sitemap.xml` via Google Search Console + Bing Webmaster
once the production domain is verified (can't be automated without those credentials).

## Goal

Let people **and crawlers/answer-engines** see community content read-only, while
keeping the platform safe:

- ✅ View public posts, events, circles, topical channels (read-only)
- ❌ No interacting (post/comment/like/message/RSVP) without signing up
- ❌ No precise location — **city/area is the coarsest** detail shown to anon
  (hide venue/address, neighborhood, latitude, longitude)
- ❌ No registering/joining/RSVPing without signing up

## Decisions (locked 2026-05-28)

| Decision | Choice |
|---|---|
| Location granularity for anon | **City/area only** — derived from the circle's `city`; never expose `events.location`, `circles.neighborhood/latitude/longitude` |
| Public surfaces | **All four**: public posts/feed, events, circles, topical channels |
| Architecture | **Dedicated public routes** under `/discover`, plus self-canonical public URLs that live in `(main)` (`/events/<slug>`, networked `/spaces/<slug>`, marketplace details). `app/robots.ts` is the live crawl map. |

## Privacy leak (closed 2026-05-28)

The anon policy `events: public read future non-cancelled` used to grant a full-row
SELECT on every future event, including free-text `location`. Phase 1 dropped it
(`supabase/migrations/20240211000000_public_discover_reads.sql`) and replaced it
with column-safe `SECURITY DEFINER` RPCs. Do not re-add a broad anon SELECT on
`events`. The live crawl map is `app/robots.ts` + `app/sitemap.ts`, not this
historical section.

## Guiding principle

Never give anon a broad table SELECT. Expose exact columns via `SECURITY DEFINER`
RPCs/views (the pattern already established in migration `20240204000000`). Location
redaction happens at the **data layer**, not the UI — crawlers read the raw API.

## Route structure

Authed app stays untouched: `/feed`, `/circles`, `/events`, `/channels`, etc.
New public, indexable, redaction-safe pages:

```
/discover                 hub — channels grid, featured circles, upcoming events, public feed preview
/discover/topics/[slug]   topical channel page (Movement, Spirituality, …) — evergreen SEO/AEO
/discover/circles/[id]    circle: name, topic, city, member count → "Sign in to join"
/discover/events/[slug]   event: title, date, description, city → "Sign in to RSVP / see location"
```

Duplicate-content risk is handled per family, not by a blanket "only /discover":
`robots.ts` disallows member twins (`/journeys`, `/partners`, `/spaces/directory`) while
`/events/<slug>` and networked Space profiles are self-canonical. The discover event
page currently *hints* its canonical at `/events/<slug>` (`SCAN-636`).

## Phase 1 — Safety + foundation (DO FIRST)

**Data layer** — new migration:
1. DROP the `events: public read future non-cancelled` anon policy (closes the leak).
2. New `SECURITY DEFINER` RPCs returning only safe columns (city derived from the
   circle; never `location`/`neighborhood`/`latitude`/`longitude`):
   - `public_events` / `public_event_by_slug` → id, slug, title, description, starts_at, **city**, circle name
   - `public_circles` / `public_circle_by_id` → id, name, topic, **city**, member_count, status
   - `public_channels` → slug, name, description, counts
   - safe author read for the public feed → display_name, handle, avatar only
   - (keep the existing posts anon policy: public, top-level only)
3. Update `app/page.tsx` landing reads to use the safe RPCs (it currently selects
   `events.location` via the anon policy being dropped).

**SEO foundation** (re-create — these were rolled back from the first pass):
- `lib/site.ts` — `SITE_URL` (env `NEXT_PUBLIC_SITE_URL`, fallback
  `https://frequencylocal.com`), name, tagline, description.
- Root `app/layout.tsx` metadata — `metadataBase`, `openGraph`, `twitter`, title template.
- `app/opengraph-image.tsx` + `app/twitter-image.tsx` — generated 1200×630 branded
  card: `public/images/hero.jpg` background + dark gradient + "FREQUENCY" wordmark
  (Nunito 900, white, text-shadow) + "A PLACE TO BE HUMAN" + indigo accent bar.
  Use `runtime = "nodejs"`, `readFile` the hero, best-effort Google-Fonts fetch with
  fallback. NOTE: `runtime` cannot be re-exported — declare it statically in
  `twitter-image.tsx`, re-export only `default, alt, size, contentType`.
- `app/robots.ts` — **allow** `/` and `/discover/*`; disallow the authed app paths
  (mirror `proxy.ts` PROTECTED_PATHS) + `/api/`, `/join/`, `/unsubscribe`.
- `app/sitemap.ts` — **dynamic**: `/`, `/discover`, plus every public circle, event,
  and topic via the new RPCs.
- `app/page.tsx` + `app/privacy/page.tsx` — per-page metadata/canonical (privacy
  title must be a plain string or `.absolute` so it doesn't double-brand under the
  new title template).

## Phase 2 — Public pages

Build `/discover` hub + circles/events/topics pages on the safe RPCs. Read-only;
every interaction control replaced by a sign-in CTA. `generateMetadata` per page.

## Phase 3 — AEO

JSON-LD: `Organization`/`WebSite` site-wide; `Event` (city-level), `ItemList`,
`BreadcrumbList` on listings. FAQ block with `FAQPage` schema on landing/topics.
Submit sitemap to search engines.

## Domain note

**Update (2026-06-01):** the brand is moving to the custom domain `frequencylocal.com`
(registered at GoDaddy, apex → Vercel), replacing the old `go.findafreq.com` host. Once
DNS is pointed, the remaining gap is config: set `NEXT_PUBLIC_SITE_URL=https://frequencylocal.com`
in the Vercel project. `lib/site.ts` already falls back to `https://frequencylocal.com`, so metadata,
sitemap, robots, and JSON-LD advertise the apex even if the env var is missing; set it explicitly so
the canonical host is pinned rather than relying on the fallback. This was the highest-leverage
remaining SEO move (framed as "verify a custom domain" in P3.31).
