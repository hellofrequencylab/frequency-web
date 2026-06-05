# Entry Points & Campaigns

**The distribution layer.** An **Entry Point** is one shareable, trackable *door* into
Frequency — a short link + a branded QR + a print-ready flyer, pointed at a destination,
owned by a member, grouped in a campaign, and crediting its owner with points when it
converts. **Campaigns** group entry points under a shared template, branding, and goal.

This is the "lead page / funnel" system, built the Frequency way: crew never see a blank
canvas — they fill a few slots in an on-brand template and out comes a link, a QR, and a
beautiful flyer. The advanced builder lives with operators.

> Decision + rationale: [ADR-126](DECISIONS.md#adr-126-entry-points--campaigns--the-distribution-layer).
> Builds directly on **personas + lead flows** ([ADR-125](DECISIONS.md#adr-125-personas--lead-flows--the-self-identified-intake-rework), [LEAD-FLOWS.md](LEAD-FLOWS.md)).
> Operator "how to run a campaign / read the numbers" guidance lives in Notion (Training & Strategy), linked back here.

---

## Why this is ~60% built already

The hard plumbing exists. Entry Points is a **template + flyer layer** and **two surfaces**
over primitives we already ship:

| Capability | Already in repo |
|---|---|
| Branded QR → **vector SVG + PNG** | `lib/qr/render-styled.ts` (`renderStyledQrSvg`), `lib/qr/raster.ts` (`renderStyledQrPng`), `/api/qr`, `lib/qr/style.ts` (`QrStyle`: logo, gradient, eye/module shapes, CTA frame) |
| Short links + scan tracking | `qr_codes` table, `/q/[slug]/route.ts` resolver, `qr_scans` table, `record_qr_scan` RPC |
| First-touch attribution | `lib/attribution/first-touch.ts` (`fq_attr`), `channels.ts` (`deriveChannel`), `acquisition.ts` (`persistAcquisition`) |
| **Owner credit on signup** | `lib/qr/referral.ts` (`applyReferralAttribution`: `fq_ref` → `profiles.referred_by_profile_id` + `invite_accepted` zaps) |
| Points ledger (idempotent) | `lib/engagement/events.ts` (`recordEngagementEvent`), `lib/zaps.ts` (`awardZapsForAction`), `zap_config` |
| Personas + lead flows (the destinations) | `lib/onboarding/{personas,lead-flows}.ts`, `/start/<flow>` (ADR-125) |
| Operator workspace | `/marketing/**` (contacts · campaigns · automations · analytics), `contacts` table |
| Visual page editor | Puck `pages` table (`20240226000000_pages_cms.sql`) |
| Crew QR hub (today) | `/codes` (`app/(main)/codes/**`): personal "connect" code + ≤3 crew marketing codes → circles/events only |

**The work** is: a template registry, a flyer-composition layer, a dead-simple crew builder,
an admin campaign builder, and wiring entry-point destinations to lead flows + the points.

---

## The model

### Entry Point
One door. Generalizes today's crew "marketing codes" (which are owner-scoped `qr_codes`
limited to circles/events) by lifting the limits and broadening the destination.

| Field | Source |
|---|---|
| `slug` · `style` · `scan_count` · `owner_profile_id` · `active` · validity | reuse `qr_codes` ✅ |
| `destination_type` ∈ `lead_flow · circle · event · profile · url` | broaden `qr_codes.destination_type` |
| `lead_flow_slug` / `persona` (when destination is a lead flow) | references ADR-125 |
| `campaign_id` | new FK → `entry_campaigns` |
| `template_id` | the template it was built from |

### Campaign
A themed set of entry points sharing a template, branding, goal, and content (titles /
content / graphics / links). Admin-created; crew can clone an approved one.

> **Naming note:** the existing `campaigns` table is **email broadcasts** — ours is a new
> table **`entry_campaigns`** to avoid collision.

### Template
A predefined, on-brand recipe with two outputs from one set of slots:
1. a **goal-typed landing surface** (or a direct destination), and
2. a **matching flyer**.

Code-first registry (the `lib/onboarding/lead-flows.ts` pattern), with a DB-override layer
later (the `vera_config` pattern). Fully-custom admin landings use Puck `pages`.

**Starter template set** (goal-typed, à la ClickFunnels funnel types — kept small):

| Template | Goal | Destination | Flyer |
|---|---|---|---|
| **Event** | Fill a local gathering | event (or lead flow → event) | date/place/QR poster |
| **Circle** | Grow a circle | circle | "join us" card |
| **Invite** | Personal referral | profile / lead flow | "scan to join me" |
| **Waitlist / Beta** | Capture leads | lead flow (`welcome`/`event`) | "get on the list" |
| **Partner** | Local-business outreach | lead flow (`partner`, persona-routed) | business one-pager |
| **Custom** (admin) | Anything | Puck landing | bespoke |

---

## Two surfaces, one engine

### 1. Crew portal — "My Entry Points" (evolves `/codes`)
Ruthlessly simple. The "crew needs a flyer for a local event" flow, **under 60 seconds:**

1. **New entry point** → pick a template (Event · Circle · Invite · Custom)
2. Fill **3–4 slots** (title, date/place, one line, where it points)
3. **Done** → short link + branded QR + a **print-ready flyer**, download **SVG (vector)** or **high-res PNG**
4. **Earn zaps** for creating it; more when it converts

Also: their stats (scans → signups), their **leaderboard rank**, restyle the QR. No blank
canvas, no layout editor — those live only in admin.

- **Template:** `DashboardTemplate` (metric-led), registered `none` rail at `/entry-points`
  (or keep under `/codes`). Create flow uses a `FocusTemplate` modal/step.

### 2. Admin campaign builder — `/marketing/campaigns/...`
Everything the crew tool hides:
- Build **campaigns** from predefined templates (titles, content, graphics, links)
- Compose the landing (Puck) + flyer template + lead flow + persona routing
- Spin up **many** entry points, assign to crew or places, bulk-generate QR/flyers
- A/B variants, per-campaign analytics, segments, wire **automations** (per-persona nurture)
- **Curate** which templates crew may use (governance)

---

## The flyer / QR generator

The standout, and a thin layer over what exists.

- **Flyer = an on-brand SVG** composing: a brand frame + headline/slots + the **styled QR**
  (`renderStyledQrSvg`).
- **Outputs: SVG** (true vector — scales to a billboard, editable in their own design tools)
  **and** high-res **PNG** (both already served by `/api/qr`; we add the flyer composition +
  a few preset layouts).
- **Beautiful by default:** built from design tokens (no hardcoded hex, per PRESENTATION.md),
  so even a 60-second crew flyer looks designed.

---

## Points (simple; anti-farm)

Launch with few mechanics; balance effort-to-reward; show rank (research consensus).

| Action | Reward | Mechanism |
|---|---|---|
| **Create an entry point** | small zaps, **first-N capped** | new `entry_point_created` zap action (capped) |
| **Scan → signup** (attributed to owner) | `invite_accepted` (40 zaps) ✅ | extend `fq_ref` credit to entry points |
| **Signup that activates** (first practice) | bonus zaps | new `referral_activated` zap action |
| **Crew leaderboard** | rank by signups driven | reuse season rank |

All grants flow through `recordEngagementEvent` (exactly-once). Badges/tiers later
(`achievements` already exists).

---

## Analytics (simple)

Per entry point: scans · unique · leads · signups · conversion % · top place. Reuse
`qr_scans` + `engagement_events` + `contacts`. Crew see their own; admin sees all + per-campaign
rollups. No new analytics store.

---

## How it composes with personas + lead flows (ADR-125)

Entry points are the **distribution** layer; personas are the **routing** layer. An entry
point can point at a **lead flow** (`/start/<flow>`), which asks persona and routes the
marketing track. So a crew flyer for a local event can point at the event *or* at a lead flow
that captures + routes — the **template decides**. The lead/persona/credit all thread through
the existing `fq_attr` / `fq_ref` / `persistAcquisition` pipeline already in place.

---

## Data model — reuse-first

| Object | Change |
|---|---|
| Entry point | **Extend `qr_codes`**: add `campaign_id`, `template_id`; broaden `destination_type` (+ `lead_flow_slug`, `persona`); lift the crew "≤3 / circles-events-only" cap for `purpose='entry_point'` |
| Campaign | **New `entry_campaigns`**: `id, name, goal, template_id, branding, lead_flow_slug, owner_profile_id/org, status` |
| Template | **Code-first registry** (`lib/entry-points/templates.ts`), DB-override later; custom admin = Puck `pages` |
| Flyer | Generated on the fly; optional cache to `site-media` bucket. No new model |
| Points | New zap actions `entry_point_created`, `referral_activated` in `zap_config` / `ZAP_AMOUNTS` |

Migrations are written to `supabase/migrations/` but **not applied** from a PR (apply is a
separate, reviewed step).

---

## Phasing

| Phase | Ships | Reuses |
|---|---|---|
| ✅ Foundation | QR engine · scan resolver · attribution · referral zaps · CRM · personas/lead flows | in repo |
| ✅ **1 — Crew MVP** | "My Entry Points": template → branded QR + **flyer (vector SVG + PNG)** → create points → signup credit | `qr_codes` · QR render · attribution · zaps |
| 🟡 **2 — Admin builder** | ✅ Campaign builder (`/marketing/funnels`) + per-campaign scans + in-place entry-point creation + **assign-to-crew**. ⏳ Puck landings · template curation | `/marketing` · Puck `pages` |
| ✅ **3 — Growth** | ✅ Per-persona nurture (`/marketing/nurture`, ADR-131) · ✅ Recruiter leaderboard + tiers (`/crew/leaderboard?scope=entrypoints`, ADR-134) · ✅ A/B testing (ADR-136) · ✅ Segment broadcasts (persona segments seeded; `/marketing/campaigns` targets them) | `automations` · `achievements` |

### Phase 3 — A/B testing (ADR-136)

- **Destination variants under one printed QR:** `entry_point_variants` (key · label · target · weight · active) per entry point. The `/q` resolver splits scans by weight (`pickVariant`, pure + unit-tested); **no active variants ⇒ the default destination (control)**.
- **True conversion attribution:** the served variant is logged on the scan (`record_qr_scan` → `qr_scans.variant_key`) and carried to signup via a `fq_var` cookie (parallel to `fq_ref`) → `entry_point_conversions` (one per person per entry point). Per-variant **rate = conversions / scans**.
- **Admin surface:** `/marketing/funnels/variants/<codeId>` (linked from each entry point in a campaign) — define variants, toggle, read scans / signups / rate with a leading-variant marker. Targets validated as safe internal destinations (no open redirect).
- **Data:** migration `20260607020000` (additive; `record_qr_scan` extended with an optional `p_variant`). Service-role only.

### Phase 3 — what shipped (so far)

- **Per-persona nurture** (ADR-131): a **Nurture** tab in `/marketing` where operators build, per persona, an ordered list of timed email steps. When a lead is captured with that persona (`captureLead`), they're **enrolled** (`lib/nurture/enroll.ts`, idempotent, fire-safe); a 15-min cron (`/api/cron/nurture` → `lib/nurture/runner.ts`) sends each due step through the durable email outbox — **consent-gated** (unsubscribe / lifecycle opt-out cancels) with a contact-level unsubscribe on every send.
- **Data:** `nurture_sequences` / `nurture_steps` / `nurture_enrollments` (migration `20260607000000`, additive, service-role only). Pure scheduling logic in `lib/nurture/schedule.ts` (unit-tested).
- **Recruiter leaderboard + tiers** (ADR-134): an **Entry points** tab on `/crew/leaderboard` ranking crew by **signups referred** (then scans, then point count), with cumulative-signup tiers (Scout → Connector → Recruiter → Ambassador → Luminary) and a "N more to next" nudge. Computed at read time from `qr_codes` + `profiles.referred_by_profile_id` — **no migration**. Pure tier/ranking logic in `lib/entry-points/leaderboard.ts` (unit-tested).
- **Still pending (3b):** in-app/push step channels (email-only today), A/B variant steps, backfilling existing contacts, segment-targeted broadcasts, and entry-point leaderboards/tiers.

### Phase 2 — what shipped

- **Surface:** `/marketing/funnels` (a **Funnels** tab in the marketing workspace; admin/staff-gated by the existing `/marketing` layout). Distinct from `/marketing/campaigns` (email broadcasts).
- **Campaigns:** `entry_campaigns` CRUD — `lib/entry-points/campaigns.ts` (reads) + `app/(main)/marketing/funnels/actions.ts` (admin-gated create/rename/archive). Each campaign shows its entry-point count + total scans.
- **Campaign detail** (`/marketing/funnels/<id>`): rename/archive + an in-place builder that **reuses the Phase 1 `EntryForm`/`EntryRow`**, filing new entry points under the campaign (`qr_codes.campaign_id`). No duplicated UI.
- **Threading:** `EntryPointInput.campaignId` (validated via `campaignExists`) flows through `createEntryPoint`/`updateEntryPoint`; `listEntryPointsByCampaign` powers the detail view.
- **Assign-to-crew (2b, done):** each entry point in a campaign has an owner control (`reassignEntryPoint`) — an operator can hand it to any active crew-and-above member (`listAssignableMembers`); the new owner gets it in their "My Entry Points" + future recruiter-board scan credit. Historical signup attribution (`referred_by`, set at scan time) is unchanged.
- **Still pending (2b):** Puck custom landings and operator template curation.

### Phase 1 — what shipped

- **Surface:** `/entry-points` (crew-gated, Focus/Dashboard) + an "Entry points" item in the account menu (crew+). Non-crew see a Crew upsell.
- **Build flow:** `lib/entry-points/templates.ts` (5 goal-typed templates) → pick one → fill name / destination / headline / subhead / CTA → **live flyer preview** → publish.
- **Outputs:** a `/q/<slug>` short link, a branded **QR** (PNG + SVG via `/api/qr`), and a **flyer** in **vector SVG + high-res PNG** (`/api/entry-points/<slug>/flyer[?format=png]`, owner-gated). Flyer composer: `lib/entry-points/flyer.ts` (+ `brand.ts` palette); PNG rasterized via `flyer-raster.ts` with bundled **Liberation Sans** (Arial-metric, OFL; `public/fonts/`).
- **Destinations:** `lib/entry-points/destinations.ts` — persona lead flows (`/start/<flow>`), the member's own circles/events, or curated public pages; validated to a known safe path (no open redirect).
- **Data:** entry points are owner-owned `qr_codes` with `template_id` set (`purpose` NULL ⇒ many per owner) + a `flyer` jsonb; migration `20260606000000_entry_points.sql` (additive; **written, not applied**) also adds the `entry_campaigns` table (Phase 2) and the `entry_point_created` / `referral_activated` zap config.
- **Points:** `entry_point_created` (20 zaps, **capped to the first 5** per member, exactly-once via the engagement ledger) on create; the existing `invite_accepted` (40) credits the owner on a converted signup — **free**, because the `/q` resolver already drops `fq_ref` for any owner-owned code.

---

## Open / deferred

- Dedicated per-persona track destinations (today lead flows point at pillar pages).
- Operator-assignable template editor (DB layer over the code registry).
- A user-editable QR style on entry points (today the template's preset is used; restyle is deferred).
- Flyer caching + more preset layouts (today: `poster` + `card`).
- A/B testing, segment broadcasts (Phase 3b — nurture + recruiter leaderboard shipped, see ADR-131 / ADR-134).
