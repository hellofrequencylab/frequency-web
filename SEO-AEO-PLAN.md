# Frequency — SEO / AEO Plan

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
| Architecture | **Dedicated public routes** under `/discover` — separate from the authed `(main)` app to avoid leaking via authed components |

## ⚠️ Live privacy leak to fix FIRST

`supabase/migrations/20240204000000_public_landing_reads.sql` (lines 43–49) adds:

```sql
CREATE POLICY "events: public read future non-cancelled"
  ON events FOR SELECT TO anon
  USING (is_cancelled = false AND starts_at >= now());
```

This grants anon a **full-row** SELECT on every future event, including the
free-text `location` column. A bot can read every event's location straight from
the Supabase REST API today. Phase 1 must DROP this policy and replace it with
column-safe RPCs.

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

Not a duplicate-content risk: the authed app is `robots`-disallowed, so `/discover/*`
are the only indexable URLs.

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
  `https://frequency-web-three.vercel.app`), name, tagline, description.
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
in the Vercel project — otherwise `lib/site.ts` falls back to `frequency-web-three.vercel.app`
and metadata, sitemap, robots, and JSON-LD advertise the vercel.app host. With it set, all SEO
surfaces follow automatically. This is the highest-leverage remaining SEO move
(was framed as "verify a custom domain" in P3.31).
