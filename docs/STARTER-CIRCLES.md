# Starter Circles

Status: live. Foundation + actions + admin + member builder + gallery shipped and applied to prod (`azsqfeonabsbmemvddqd`); the `circle_templates_enabled` master flag is ON. The twelve blueprints are also surfaced as geo-located, claim-able virtual circles in the main `/circles` directory and on its map (ADR-391). This doc is the technical source of truth; decisions are recorded as ADRs in `docs/DECISIONS.md` (foundation + **ADR-391** for the directory/map surfacing).

## What this is

Twelve staff-authored **Starter Circles**: reusable blueprints for ongoing interest-based clubs, three per Pillar. A would-be leader browses the gallery, adopts one ("Make it yours"), gets a private **draft they own**, edits it with Vera and edit-mode best-practice callouts, and **publishes a completely original live Circle** (no link back, no template badge). Publishing makes the adopter a **Host**, which opens the Leadership tab (`/lead`).

A Circle is an ongoing club, not a time-boxed program. Pillars are **not** how Circles are sorted: each leans one **primary Pillar** and carries the other three inside it. Channels are intentionally omitted (the Channel taxonomy is being reworked) — bind to a primary Pillar only.

## Confirmed decisions

| # | Decision |
|---|---|
| 1 | Dedicated `circle_templates` table (not `is_demo`) |
| 2 | A template bundles identity + the four Pillars inside + rhythm (Meetup / Gathering / Thread) + format + size + agreements + remix ideas + a **reference** to a recommended Pillar Journey. No bespoke per-Circle curriculum; "Run the Quest together" is a pointer, started later as a Run |
| 3 | Direct `primary_pillar` field, three per Pillar; no Channel binding |
| 4 | Adopt → private **draft** → **publish** original live Circle |
| 5 | Full-page builder borrowing the Journey editor chrome (deferred creation, autosave, Vera, outline upload, callouts); body is a structured Circle form, not a curriculum tree |
| 6 | Full multi-path Vera: spark (Q&A or uploaded outline) / compose section / edit-by-instruction / slot-coach |
| 7 | Edit-mode callouts = standard baked-in library (`lib/circles/templates.ts`) + per-template extras; survive remix, hidden on publish |
| 8 | Builder entry points: template / outline upload / Vera Q&A / scratch |
| 9 | Templates managed by staff in `/admin`; members manage their own Circles in `/lead` |
| 10 | Per-template `is_active` + global `platform_flags` master switch |
| 11 | Suggested cadence on the template; one-click "generate events" on adopt |
| 12 | Staged delivery, one draft PR |

Name: **Starter Circles** member-facing, **Circle Templates** operator-facing.

## Data model (migrations `20260803000000..200`)

- **`group_status` gains `'draft'`** (isolated migration). A draft is hidden from discovery for free because every discovery read already filters `status IN ('forming','active')` / `<> 'archived'`. Only the circles SELECT policy is tightened so a draft is visible to its owner + guide+ oversight.
- **`circle_templates`** — the blueprint catalog. Typed columns for the framework fields; jsonb for the repeating structures (`pillars_inside`, `meetup`, `gathering`, `agreements`, `remix_options`, `callouts`). `is_active` per-template switch, `display_order`, public-read-when-active RLS, service-role writes.
- **`circle_profiles`** — 1:1 companion to `circles` holding the rich adopted content (kept OFF `circles` so the hot table and the live page-overhaul queries are untouched). `editor_notes` carries the edit-mode callouts into the draft. RLS mirrors circle visibility so draft content never leaks.
- **`circles`** gains `primary_pillar` (queryable) and `origin_template_id` (internal analytics only, never surfaced). Partial indexes keep common paths free.
- Global flag `circle_templates_enabled` (off by default) gates the member surface; the twelve seed rows are `is_active = true` and ready.

## Lifecycle

1. **Remix** ("Make it yours") → `remixTemplate` clones template identity → new `circles` row (`status = 'draft'`, adopter = `host_id`), clones rich content → `circle_profiles`, copies callouts → `editor_notes`. The adopter's `community_role` is elevated to `host` here (on creation) so `/lead` opens to find and finish the draft. Elevation is upward-only and capped at `host` (`ensureHostOnOwnership`), safe to run as a system effect of the member's own action, unlike the escalation-guarded operator `assignRole`. **Open for confirmation:** elevate on remix (current) vs only on publish.
2. Adopter edits at `/circles/[slug]/edit` with Vera + instruction boxes live.
3. **Publish** (`publishCircle`) → `status = 'active'` (original, no template badge); Host role re-ensured; best-effort announcement + `circle_start` reward. One-click `generateCircleEvents` creates the first Circle Meetup + Weekend Gathering as dated Events scoped to the Circle (single events for now; recurrence is a follow-up). The recommended Journey stays a suggestion to start as a Run later.

Role-appropriate visibility throughout: drafts owner/guide+ only; active Circles per existing rules; `/lead` is role-scoped (a new Host sees only their own Circle, not guide/mentor networks).

## Surfaces (collision risk vs the live admin/page reorg)

| Area | Route | Risk |
|---|---|---|
| Migrations + seed | `supabase/migrations/` | low (done) |
| Types + guidance library | `lib/circles/templates.ts` | low (done) |
| Server actions: adopt / publish / generate-events / Vera | `lib/circles/*`, action files | low |
| Staff admin: index + per-template builder + toggles | `/admin/circle-templates` (+ nav registration, **deferred** — `sections.ts` / `lib/admin/nav.ts` / `lib/menus` are the reorg hot zone) | medium |
| Member builder + 4-entry wizard + gallery | `/circles/new`, `/circles/[slug]/edit`, `/circles/templates` | high (defer to post-reorg) |
| Wiring into Circle detail + `/lead` | `/circles/[slug]`, `/lead` | high (defer) |

## The gut list (proposed — execute alongside the replacement, never before)

Replace the popup-based creation with one clean builder. Remove only once the new builder + actions exist, so the app never has a gap; ship the removal in the same change.

| Retire / replace | File | Note |
|---|---|---|
| Circle creation popup | `components/compose/new-circle-compose.tsx` | replaced by the full-page builder |
| Old single-shot Vera suggest | `lib/ai/circle-wizard.ts` (`suggestCircle`, `fallbackCircleSuggestion`) | replaced by the four-path circle Vera; update callers `lib/ai/vera/read-tools.ts`, `lib/ai/space-copilot.ts` |
| Popup create action | `app/(main)/circles/actions.ts` (create path) | replaced by adopt/publish actions |
| Admin create-circle path | `app/(main)/admin/actions.ts` (`createCircle`) + `app/(main)/admin/circles/page.tsx` | fold into the new admin surface |
| Popup mount points | `app/(main)/circles/page.tsx`, `app/(main)/channels/[id]/page.tsx` | point to the new builder |

Open question for sign-off: the **demo "claim" flow** (`components/circles/claim-circle.tsx`, `app/(main)/circles/[slug]/claim-actions.ts`) is the existing "adopt a demo Circle to make it real" mechanism. Keep it as part of the demo system, or fold its intent into the new "Make it yours"? Recommendation: keep for now (different surface, demo-scoped), revisit after the builder ships.

## Geo-located surfacing in the main directory + map (ADR-391)

Beyond the `/circles/templates` gallery, the active blueprints are surfaced as **virtual, claim-able circles scattered within ~10 miles of each viewer** — so a member anywhere sees startable Circles near them. They are NOT rows in `circles`: nothing is persisted, and the synthetic ids (`starter-<slug>`) never collide with real circle ids. Gated by the same `circle_templates_enabled` flag.

| Piece | File | Role |
|---|---|---|
| Projection core (pure, client-safe) | `lib/circles/starter-projection.ts` | `projectStarterCircles(...)` + `StarterSeed`; seeded mulberry32, uniform-disk offset, stable per viewer (rounded location folded into the seed) |
| Directory cards (server) | `app/(main)/circles/page.tsx` | injects Starter `CircleCardData` (`isStarter: true`) honoring the page facets; order = members → Starters → discovery; passes `starterSeeds` to `MapZone` |
| Card badge + Claim action | `components/circles/circle-card.tsx`, `components/ui/starter-badge.tsx` | `isStarter` ⇒ Starter badge, `/circles/starter/<slug>` link, Claim (not Join), "Ready to start" meta |
| Map markers (client) | `components/circles/circles-map.tsx` → `components/circles/circle-map.tsx` | projects Starters around the IP/precise viewer center; renders a separate **unclustered violet layer** (`#7C5CD6`) with a popup linking to the preview |
| Preview + Claim | `app/(main)/circles/starter/[slug]/page.tsx`, `components/circles/starter-claim.tsx` | Detail-template read-only blueprint; Claim runs the existing `remixTemplateAction` → private draft → builder |

**Why client-side for the map:** viewer location is resolved only in the browser (`lib/geolocation.ts` IP geo, inside `MapZone`); the server page never sees it. So cards (no geo) are injected server-side and markers (need geo) are projected client-side. When the flag is off, every surface renders exactly as before.

## Build stages

1. **Foundation** (done, local): migrations + seed + types + guidance + this doc.
2. **Actions + Vera** (done, local): `lib/circles/templates-data.ts` (read layer), `lib/circles/remix.ts` (remix + publish + `ensureHostOnOwnership`), `lib/circles/events.ts` (one-click events), `app/(main)/circles/remix-actions.ts` (authz wrappers), and the full Vera set: `circle-spark` (draft the frame from Q&A or outline), `circle-compose` (fill one section), `circle-edit` (edit-by-instruction patch). Claim relabeled to **Remix** (`components/circles/claim-circle.tsx`) + canon in `NAMING.md`. **Wires in at Stage 4:** outline upload reuses `lib/journeys/extract-text.ts`; the compose/edit apply-to-draft actions live with the builder's autosave.
3. **Staff admin**: `/admin/circle-templates` index + per-template builder + toggles (nav registration deferred until the reorg settles).
4. **Member builder**: full-page builder, 4-entry wizard, gallery, then wire into the Circle detail page and `/lead`; execute the gut list in the same change.

Nothing is pushed or applied to the database until the page/admin reorg lands and the owner gives the go.
