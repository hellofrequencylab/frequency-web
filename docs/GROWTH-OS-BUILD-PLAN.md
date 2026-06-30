# Growth OS — the launch build plan (funnels, flywheel, splash, admin suites)

> **The cohesive, step-by-step build plan for Frequency's growth + launch layer.** Locked by
> owner decision **2026-06-28**: build the whole growth machine structurally, as config-driven
> engines each with a full admin suite, on a hardened foundation, ahead of the rough launch dates.
> Mobile is the primary surface long-term; this completes the **web foundation** first.
>
> **Sequencing:** this runs **after** the hardening spine in
> [`FOUNDATION-HARDENING-PLAN.md`](FOUNDATION-HARDENING-PLAN.md) (owner: "harden fully first"),
> and **builds money dormant** behind `billing_live = off` (owner: "build dormant now"). It
> re-uses, never re-founds, what already exists.
>
> **Authority order:** running code + `supabase/migrations/` > this doc > Notion. **Decision
> record:** [ADR-440](DECISIONS.md). **Notion sync:** mapped 1:1 to the *Community Launch Plan*
> board (Frequency Projects DB), phases P0–P4, in §11.
>
> **Status legend:** ✅ built · 🟡 partial / extend · 📐 designed only · 🆕 net-new · 🔒 dormant
> (behind `billing_live`).
>
> **Companions:** [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md) · [PLATFORM-VISION.md](PLATFORM-VISION.md)
> · [ENTRY-POINTS.md](ENTRY-POINTS.md) · [EMBEDDED-ADMIN.md](EMBEDDED-ADMIN.md) ·
> [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) · [RESONANCE-FEED-ARCHITECTURE.md](RESONANCE-FEED-ARCHITECTURE.md)
> · [ENTITY-SPACES-SYSTEM.md](ENTITY-SPACES-SYSTEM.md) · [PRICING.md](PRICING.md) ·
> [PUBLIC-SITE-PLAN.md](PUBLIC-SITE-PLAN.md) · [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md).

---

## 1. The core idea

Everything in the launch (every funnel, splash page, onboarding flow, campaign, funding ask) is an
*instance* of a small set of **config-driven engines**. We do not hand-build 15 splash pages and 8
funnels. We build the engines, each backed by data, each with a full admin suite, and then every
funnel/page/sequence/campaign becomes a row an operator creates and tunes in the admin, not a code
change. This is the **Growth OS**: the layer that pulls people in, turns them into hosts, and
(dormant for now) converts a slice into paying operators and supporters.

**The growth logic it serves** (from the *Community Launch Plan*): recruit **builders**, not
members; builders bring local people into Circles; real gatherings produce proof; broadcast that
proof to recruit the next builders; the **hosted global layer** keeps nobody landing in an empty
room, with a **global→local shift** as each city fills. No ad spend.

---

## 2. Reality check — most of this already exists

A current-state audit (code + docs + migrations) shows the platform is far past "building as we
go." The Growth OS is mostly **wiring, extending, and gap-filling**, plus two genuinely new
systems (Funding, Keystone). The table below is the honest baseline so we never rebuild.

| Growth system | State today | What's left |
|---|---|---|
| Entry-point / funnel engine + attribution + A/B + nurture | ✅ phases 1–3 (`lib/entry-points/*`, `entry_point_variants`, `nurture_*`) | Funnel-as-object + unified per-funnel analytics |
| Landing/splash + Puck editor + page CMS | ✅ (`pages` table, 24-block kit, `lib/page-editor/*`) | Splash-as-funnel config; SEO pillar + comparison authoring |
| Waitlist + beta + intake | ✅ beta funnel (`sequence_overrides`, induction) | 🆕 dual-track waitlist + apply-to-host + operator applications + review queues |
| Onboarding sequences + activation instrumentation | ✅ (Vera concierge, `engagement_events` funnel, chores, Founder's First Week, coachmarks) | Per-persona operator onboarding; sequence-builder admin |
| CRM + referral + card/QR capture | ✅ P1–P3 (`network_contacts`, `crm_*`, QR capture) | Reciprocal QR handshake; referral analytics depth |
| Campaigns / nurture / segments / broadcast / email | 🟡 backbone (`notification_queue` outbox, `campaigns`) | Email fully on outbox; automations engine; segment broadcasts; Vera agent autonomy |
| Pricing / entitlements / billing | ✅ P1–P3 **OFF by default** (`pricing_*`, Stripe wired) | Per-seat; dunning/proration; flip-on runbook |
| Spaces operator suites + gating | ✅ P0–P3 (`spaces`, `space_*`, per-type blueprints) | Deep per-role features (coaching academy, venue ticketing, etc.) |
| Discover / city / programmatic / SEO / AI-citation | 🟡 discover browse layer + RPCs | 🆕 programmatic city + comparison pages; SEO pillar copy; HowTo/Article schema |
| Resonance feed / proof surfacing | ✅ graph (`resonance_embeddings/edges/matches`); 📐 feed rank | Density rollup, adaptive radius, founder prompt, proof-capture UI |
| **Keystone: hosted global layer + global→local** | 📐 density model in flight; concept only | 🆕 hosted-Journey scheduling, density read-model finish, localization engine, founder bootstrap |
| **Funding: Founders Circle / pre-sale / donations / affiliate** | 📐 (pricing rails exist) | 🆕 🔒 campaign + contribution + backer CRM + ledger, dormant |
| Validated creation (members publish) | ✅ (`engagement_events`, auto-valuation ADR-305/438) | Creator ratings; Vera creation assist |

**Implication:** the launch is achievable mostly by composition. The build effort concentrates in:
(a) the **two new systems** (Keystone, Funding), (b) the **dual-track waitlist/application**
engine, (c) **programmatic/SEO pages**, (d) finishing **email/automations**, and (e) wrapping
everything in **cohesive admin suites three layers deep**.

---

## 3. Architectural principles (decisions, not options)

1. **Compose, never re-found.** Splash extends Puck + `pages` CMS + the template kit. Funnels
   extend Entry Points + attribution + A/B + nurture. No parallel frameworks.
2. **Every engine ships its admin suite, three layers deep** (see §4). A system isn't "done" until
   an operator can create, edit, gate, A/B, and measure its instances with no deploy.
3. **One config-driven engine per concern**, each a typed system: tables + services + member
   surface + admin. Instances are data.
4. **Money built dormant.** Every funding/paid surface ships behind `billing_live = off`,
   flip-on-when-legal. `featureAllowed()` already short-circuits safe when off.
5. **Hardening is the gate.** G0 (the hardening spine) precedes the growth build; Notion dates are
   directional, the gate is real.
6. **Contract-layer clean for mobile.** Every engine exposes presentation-neutral view-models
   (`lib/contract/`) so the mobile app reuses them. No funnel logic trapped in React.
7. **Canon-compliant by construction.** The splash/copy engines enforce NAMING.md + CONTENT-VOICE.md
   (no em dashes, locked nouns, skeptic test); pages compose the kit per PAGE-FRAMEWORK.md.
8. **Registry pattern everywhere.** New funnels/templates/blueprints/modules *declare into a
   registry* (`lib/entry-points/templates.ts`, `lib/spaces/blueprints.ts`, `lib/admin/modules/registry.ts`),
   never edit the core.

---

## 4. The admin model: how "three layers deep" works

Frequency already has a mature 3-layer embedded admin (ADR-153/133/137/138/149). The Growth OS
**extends it**; it does not invent a new admin. Every Growth OS admin system below is specified
across these exact three layers:

| Layer | What it is | Where it lives | The "depth" |
|---|---|---|---|
| **L1 — Catalog spine** | One declaration per surface: the `AdminGroup` + its `AdminLink[]` (key, label, href, role floor, staff domain, section) | `app/(main)/admin/sections.ts` (+ `lib/admin/nav.ts`) | Drives left-rail visibility, sub-nav tabs, launchpad cards, admin search. Declare once, never orphaned. |
| **L2 — Full-page suite** | A domain workspace at `/admin/<key>`: top-bar sub-nav tabs + launchpad sections + the actual management pages (Dashboard/Index/Settings templates) | `app/(main)/admin/<key>/*`, composing `AdminTemplate` | The operator's cockpit for the whole domain. Role-telescoped. |
| **L3 — Per-page console + inline** | Page-scoped "page-globals" in the `PageAdminDock` (Basics, Layout, Stats, QR, Adjustments) + inline edit handles on the member surface; `AdminModule` registry entries (`surface: 'inline' | 'sidebar'`) | `lib/admin/modules/registry.ts`, `components/admin/sidebar/*` | Tune *this* page; links back to the parent suite. |

**Existing suites (extend these):** Programs · Community · **Growth** (Acquisition + Marketing
roll-up) · CRM · Vera AI · Operations · (Home). **Role gating:** community ladder
(`member<crew<host<guide<mentor<janitor`) × staff axis (`web_role` + `team_members` domains:
community/structure/marketing/insights/members/profiles/qr/platform). Suites telescope by role
(host sees Programs/Community/Growth; janitor+staff sees CRM/Vera/Operations).

**New suites the Growth OS adds (full spec in §5):**
- 🆕 **Keystone** suite (`/admin/keystone`, janitor + staff:insights) — the cold-start engine:
  hosted global Journeys, density read-model, localization thresholds, founder bootstrap.
- 🆕 🔒 **Funding** suite (`/admin/funding`, janitor + staff:platform, entity-aware) — Founders
  Circle, pre-sale, donations, affiliate; dormant behind `billing_live`.
- 🟡 **Growth** suite extended with **Funnels-as-object**, **Waitlist & Applications**,
  **Programmatic Pages**, **Splash** management as first-class sub-workspaces.

---

## 5. The engines (each: purpose · state · data · services · member surface · admin L1/L2/L3 · tasks)

Task IDs are stable handles (`GE#-n`). State tags per §1 legend.

### Engine 1 — Landing/Splash System  ·  🟡 extend
**Purpose:** any funnel's landing page as config: headline, named wedge, social proof (bound to
live data), primary action, optional founder video; versioned, A/B-able, SEO-controlled.
**Rides on:** `pages` table (draft/`published_data` split), Puck 24-block kit, `lib/page-editor/*`,
`site-media` bucket, illustration kit.
**Member surface:** `app/(marketing)/<slug>` (RSC `<Render>`, ISR + revalidate-on-publish).
**Admin (3 layers):**
- **L1:** `Growth › Splash` link already exists (`/pages/splash`, `/pages/sequences`); add a
  `Pages` catalog entry under Growth for funnel landings.
- **L2:** Pages library workspace (list, status, last-published, A/B variants, SEO fields,
  founder-video embed, live-data block binding). Composes Dashboard + Index templates.
- **L3:** inline Puck edit on the page itself (`?edit=1`); per-page console shows Basics + Layout +
  Stats + SEO.
**Tasks:** GE1-1 add a "funnel landing" page type + template; GE1-2 social-proof blocks bound to
`public_*` RPCs; GE1-3 founder-video block; GE1-4 A/B at the page level (reuse variant infra);
GE1-5 SEO/meta + OG per landing. **Canon:** builder rejects em dashes, enforces sentence case.

### Engine 2 — Funnel Engine  ·  🟡 extend  ·  **core ✅ shipped (ADR-455)**
**Purpose:** a funnel as a first-class object — entry point(s) → wedge → capture → conversion goal
— with attribution + variants + per-stage analytics, so every persona funnel is one configured row.
**Rides on:** `entry_points`/`qr_codes`, `entry_campaigns`, `entry_point_variants`,
`lib/attribution/first-touch.ts`, `nurture_*`.
**New:** a `funnels` object that names the four stages and links the existing pieces
(entry code(s) → landing/wedge → capture form/lead-flow → conversion event), plus a funnel-level
analytics rollup (entry→wedge→capture→convert with drop-off).
**Member surface:** the assembled entry → `/start/<flow>` → wedge → capture.
**Admin (3 layers):**
- **L1:** `Growth › Marketing › Funnels` now points at the funnel-object builder
  (`/admin/growth/funnels`); the old campaign grouper is renamed `Campaign builder`
  (`/admin/marketing/funnels`) and kept beside it.
- **L2:** Funnel builder + per-funnel dashboard (stage conversion, variant rates, attribution by
  channel/code), funnel list, clone/template.
- **L3:** per-entity "Reach" inline module already generates QR; link it to a funnel.
**Tasks:**
- ✅ GE2-1 `funnels` schema (stages + links + goal event) — `supabase/migrations/20260913000000_funnels.sql`
  (three tables: `funnels` / `funnel_stages` / `funnel_stage_links`, RLS staff-read, server-mediated
  writes). **NOT applied; ships for hand-review.** ADR-455.
- ✅ GE2-2 funnel analytics rollup RPC — `funnel_rollup(funnel_id, days)` reads `engagement_events`
  (per stage: distinct actors + drop-off; convert matches the funnel `goal_event`). SECURITY DEFINER,
  staff-only. Read via `lib/funnels/store.ts` `getFunnelRollup`.
- ✅ GE2-3 funnel builder UI — `app/(main)/admin/growth/funnels/*` (index + template gallery, per-funnel
  dashboard with the rollup behind Suspense, the stage/link builder). Composed from the kit.
- ✅ GE2-4 funnel templates per persona (seed) — `lib/funnels/templates.ts` (code-first, cloned by the
  builder into a real row).
- ⏳ GE2-5 wire existing entry points/campaigns/variants/nurture as funnel components — the stage-link
  model + builder accept all six families today; the remaining follow-on is auto-stamping
  `context.funnel_id` / `context.funnel_stage` onto the engagement events those components emit so the
  rollup populates without manual context.

### Engine 3 — Waitlist + Application/Intake System  ·  🟡 core ✅ (GE3-1..4, ADR-456); GE3-5/6 deferred
**Purpose:** the dual-track top of funnel: **builders apply** (review queue → accept → host
onboarding), **seekers join** manifesto-first with a **referral position**; plus **operator
applications** (coach/practitioner/business/nonprofit/etc.).
**Rides on:** beta funnel + `sequence_overrides` + induction, `contacts`, `member_tags`,
`engagement_events`.
**New:** `applications` (type, applicant, answers jsonb, status, reviewed_by, decided_at),
`waitlist_entries` (track, referral_position, referred_by, cohort, status), apply-to-host flow,
acceptance → onboarding handoff.
**Member surface:** `/apply/<track>` (builder/operator), `/waitlist` (seeker, referral position +
share), acceptance email → induction.
**Admin (3 layers):**
- **L1:** `Growth › Acquisition › Waitlist & Applications` (new links).
- **L2:** Application **review queue** (filter by track/status, one-tap accept/decline + reason,
  notes), waitlist manager (referral-position view, cohort gating, bulk invite), conversion stats.
- **L3:** per-application detail console (answers, applicant trail from CRM, decision history).
**Tasks:**
- ✅ GE3-1 `applications` + `waitlist_entries` schema + RLS — `supabase/migrations/20260914000000_applications.sql`
  (two tables, RLS staff-read + member-own-read, server-mediated writes; partial unique indexes guard
  one-open-application-per-track + waitlist dedupe). **NOT applied; ships for hand-review.** ADR-456.
- ✅ GE3-2 apply-to-host flow + acceptance → host role + Starter Circle handoff —
  `app/(main)/apply/*` (member surface) + `lib/applications/handoff.ts` `decideApplication`, which on a
  host accept REUSES `remixTemplate` (lib/circles/remix.ts): grants host (`ensureHostOnOwnership`) and
  hands off a Starter Circle draft. The handoff is recorded on the row so re-running accept is a no-op.
- ✅ GE3-3 operator application flows (per persona) — `lib/applications/tracks.ts` (code-first tracks:
  host + practitioner/partner/coach/business/nonprofit/collective; only host grants host, operator tracks
  record the accept and defer Space provisioning to GE10). Reachable at `/apply/<track>`.
- ✅ GE3-4 review-queue admin — `app/(main)/admin/growth/applications/*` (the queue with track/status
  filters + KPIs, the per-application detail console with answers + decision trail + accept/decline,
  the seeker waitlist count at a glance). Composed from the kit; gated on the `members` capability.
- ⏳ GE3-5 referral-position + share mechanics (DEFERRED): the schema carries `position`,
  `referred_by_profile_id`, and `cohort`; position is a plain append today (`nextWaitlistPosition`).
- ⏳ GE3-6 cohort gating + bulk invite (DEFERRED): `cohort` + `status` land it without a migration.

**Notion:** "Waitlist page live" (P0), "Recruit founding builders" (P0).

### Engine 4 — Onboarding Sequence Engine  ·  🟡 extend
**Purpose:** per-persona stepped flows to first real action, fully instrumented; the activation
machine.
**Rides on:** Vera concierge (`/onboarding/vera`), `engagement_events` activation funnel, profile
chores, Founder's First Week, coachmark tour, `lib/onboarding/*`.
**New/extend:** per-persona operator onboarding (each Space type → first value in its tool);
a **sequence builder** so steps per persona are config; GA progressive tour (post-beta).
**Member surface:** induction → Vera → coach card → Founder's First Week; per-operator onboarding
inside each Space.
**Admin (3 layers):**
- **L1:** `Growth › Acquisition › Onboarding` (`/admin/onboarding-controls`, walkthroughs) exists.
- **L2:** sequence builder (steps per persona, triggers, rewards), activation funnel dashboards
  (drop-off per step, per persona), walkthrough manager.
- **L3:** per-surface inline coachmark config; per-page "Adjustments" (Vera tone, next-step).
**Tasks:** GE4-1 sequence-builder schema + admin; GE4-2 per-persona operator onboarding flows;
GE4-3 GA progressive tour (retire beta chores at launch); GE4-4 activation dashboards per persona.
**Notion:** "Tune onboarding" (P1), "Activation tracking" (P0), "Monitor activation" (P1).

### Engine 5 — Capture/CRM + Referral System  ·  ✅ wire/extend
**Purpose:** capture any contact (QR/NFC/card-scan/manual/import) → pipeline → referral credit; the
contact engine behind every funnel.
**Rides on:** `network_contacts`, `contacts`, `crm_deals/stages/activities`, QR capture
(`lib/connections/qr-capture.ts`), referral (`profiles.referred_by_profile_id`, `fq_ref`).
**Member surface:** My Contacts, per-Space CRM board, personal connect/referral codes (`/codes`).
**Admin (3 layers):**
- **L1:** `CRM` suite exists (Cockpit, Today, Member Intelligence, Playbooks, Resonance Graph,
  Contacts, Deals, Segments) + `Growth › Referrals` (`/admin/referrals`).
- **L2:** the Resonance CRM cockpit (built); add a referral-analytics workspace (top referrers,
  signup→activation by code, viral coefficient).
- **L3:** per-contact detail console; per-entity "People" module.
**Tasks:** GE5-1 reciprocal QR handshake (two-way connection consent); GE5-2 referral analytics
depth + viral-K; GE5-3 ensure capture → funnel attribution closed-loop. **Notion:** "CRM and host
codes" (P0).

### Engine 6 — Campaign/Broadcast System  ·  🟡 finish
**Purpose:** nurture drips, segment broadcasts, dispatches, email/push; reach the right people
through the consent-gated spine.
**Rides on:** `notification_queue` outbox + `/api/cron/process-queue`, `lib/comms/send-gate.ts`,
`campaigns`, nurture, segments, `member_tags`, Resend.
**Finish:** migrate all email onto the outbox; build the automations rules engine
(trigger→condition→action); segment-targeted broadcasts; Vera marketing agent autonomy
(propose→confirm→graduate, consent harness ADR-028).
**Admin (3 layers):**
- **L1:** `Growth › Marketing` (Campaigns, Funnels, Automations, Nurture, Analytics, Market Read,
  Agent) + `CRM › Segments` exist.
- **L2:** campaign builder, automations builder, nurture editor, segment manager, deliverability +
  analytics, the AI Operator (Market Read → drafts → action queue → approve).
- **L3:** per-entity "Comms" module (announcements, notification rules).
**Tasks:** GE6-1 finish email-on-outbox + DLQ; GE6-2 automations rules engine; GE6-3 segment
broadcasts; GE6-4 Vera agent autonomy graduation + circuit breaker; GE6-5 React-Email templates +
sending-subdomain split. **Notion:** "Broadcast first rooms" (P1), "Refine messaging" (P2).

### Engine 7 — Funding System  ·  🆕 🔒 dormant
**Purpose:** the three funding streams from the launch plan: **Founders Circle** (mission-support
campaign, recognition tiers), **Founding-membership pre-sale** (commercial, later), **Donations &
grants** (nonprofit rail), plus **Affiliate** (referral commission). All entity-tagged, money
hard-partitioned, dormant until entities are legally live.
**Rides on:** pricing/entitlements (`pricing_*`, OFF), Stripe wiring (`lib/billing/*`), the (F1)
money foundation (entity ledger, Connect, persona axis from the hardening plan).
**New:** `funding_campaigns` (type: founders_circle/presale/donation, entity, goal, tiers jsonb,
scarcity, status), `contributions` (backer, amount, tier, entity, revenue_type, stripe ids),
`affiliate_accounts` + `affiliate_commissions` (entity-tagged ledger).
**Member surface:** Founders Circle campaign page (founder video + tiers + live progress + scarcity),
pre-sale page, donation surface, affiliate dashboard.
**Admin (3 layers):**
- **L1:** 🆕 `Funding` suite (`/admin/funding`, janitor + staff:platform, entity-aware).
- **L2:** campaign config (tiers, goal, scarcity, video), **backer CRM** (commit-before-launch
  tracking, advocate flagging), contribution ledger + reconciliation by entity, affiliate ledger +
  payouts, donations + grant tracking.
- **L3:** per-campaign console (tier editor, progress, gate toggles).
**Tasks:** GE7-1 funding schema (entity-tagged) + RLS; GE7-2 Founders Circle campaign page +
admin; GE7-3 contribution checkout (dormant) + ledger; GE7-4 pre-sale; GE7-5 donations + grant
rail; GE7-6 affiliate engine (codes exist → commission ledger → payout); GE7-7 the **flip-on
runbook** (entities legal → `billing_live` → go-live).
**Dependency:** F1 money foundation + **legally-live entities** for go-live. **Notion:** "Seat
Founders Circle" (P0), "Campaign page and video" (P0), "Open/Close Founders Circle" (P1),
"Donations and grants rail" (P4), "Founding-membership pre-sale" (P4).
**Canon note:** the recruiter *reward leaderboard* (Catalyst) is retired (ADR-305); affiliate is a
commission ledger, not a points board.

### Engine 8 — Keystone: Hosted Global Layer + Localization  ·  🆕 (the cold-start solver)
**Purpose:** the single most important launch mechanic. An **always-on global Journey layer** with a
live global cohort so the first person in a new city is never alone, plus the **global→local shift**:
as a city densifies, the experience quietly moves from global to local.
**Rides on:** Quest official Journeys (free), `resonance_density_cells` (in flight),
proximity RPCs (`members_near`, `nearby_events`, `my_orbit`), adaptive radius
(`profiles.feed_radius_m`), founder prompt (designed), network federation (`network_connected`).
**New:** hosted-Journey scheduling (always-on global cohorts), density read-model completion
(rollup job + thresholds), the **localization engine** (ripple: local → neighborhood → city →
region → world, weight-shifting by density), founder-bootstrap prompt for sparse areas.
**Member surface:** the hosted global Journey anyone can join day one; a feed/discovery that's never
empty; the founder prompt where density is low.
**Admin (3 layers):**
- **L1:** 🆕 `Keystone` suite (`/admin/keystone`, janitor + staff:insights).
- **L2:** hosted-Journey scheduler (which Journeys run globally, cohort cadence), **density
  dashboard** (per-city density score, supply/demand, ripple thresholds editor), localization
  threshold config (when a city flips global→local), founder-bootstrap controls, federation
  registry.
- **L3:** per-city console (density detail, manual seed, threshold override).
**Tasks:** GE8-1 finish `resonance_density_cells` rollup + `density_by_city` integration; GE8-2
hosted-Journey scheduling + global cohort; GE8-3 localization/ripple engine in `lib/feed-rank.ts`;
GE8-4 founder-bootstrap prompt; GE8-5 Keystone admin suite; GE8-6 global→local verification
instrumentation. **Notion:** "Hosted Journey live" (P0), "Localizing algorithm v1" (P1), "Verify
global to local" (P2), "New city density faster" (P3).

### Engine 9 — Proof + Broadcast System  ·  🟡 extend
**Purpose:** capture real-gathering proof (attendance, verified practice, photos, counts) and
surface it back as broadcast-ready "real rooms" that recruit the next builders.
**Rides on:** events + check-in (QR scanner), `practice.verified`, dispatches/feed, resonance feed
(`getMyOrbit`), `engagement_events`.
**Extend:** proof-capture UI (attendance + photo + count at an event), a proof feed + broadcast
composer that turns a real room into a shareable asset (with consent), the resonance-gated "nearby
rooms" surface.
**Admin (3 layers):**
- **L1:** `Community › Activity` (Events, Broadcasts) + `Engage` modules exist.
- **L2:** broadcast composer + proof library (moderated photos/counts), "real rooms" surfacing
  controls.
- **L3:** per-event "Proof" inline module (attendance, gallery, counts).
**Tasks:** GE9-1 proof-capture UI (attendance/photo/count); GE9-2 proof feed + consent; GE9-3
broadcast composer for real rooms; GE9-4 resonance-gated nearby-rooms surface. **Notion:**
"Broadcast first rooms" (P1), "First Circles open" (P1).

### Engine 10 — Operator/Creator Suites (Spaces)  ·  🟡 extend
**Purpose:** each persona's free toolset + (dormant) paid conversion: coach, practitioner, event
host, fitness, nonprofit, business, collective.
**Rides on:** `spaces` (P0–P3), `space_members`, `space_booking`, `space_donations`, CRM, email,
per-type blueprints (`lib/spaces/blueprints.ts`), entitlement gating (`featureAllowed`).
**Extend:** deep per-role features (coaching cohorts/curriculum, venue ticketing/capacity/check-in,
fitness class scheduling/memberships, nonprofit programs/recurring giving, collective course
slots), each free-wedge live + paid dormant.
**Member surface:** `/spaces/<slug>/*` (Members, QR, CRM, Email, Bookings, Settings, Profile,
Billing) + per-type surfaces.
**Admin (3 layers):**
- **L1:** `Operations › Spaces` (`/admin/spaces`) + per-Space owner settings.
- **L2:** platform Spaces oversight (provisioning, plans, entitlements, verification) + each Space's
  own admin (dashboard per type).
- **L3:** per-Space settings console (brand, domain, team, compliance, plan gates).
**Tasks:** GE10-1 deep features per persona (phased per ENTITY-SPACES-PLAN); GE10-2 operator
onboarding (ties to GE4); GE10-3 entitlement gates per feature (dormant). **Notion:** "Members to
hosts" (P2), "Enable Collective" (P4).

### Engine 11 — Programmatic Pages System  ·  🆕 (discover ✅ as base)
**Purpose:** generated **comparison** ("alternative-to" Partiful/Linktree/Calendly/Eventbrite/
Mighty), **city/Circle**, and **AI-citation pillar** pages from templates + live data, published
only where real activity exists (honest thinness).
**Rides on:** discover layer + anon-safe RPCs (`public_*`), `topical_channels`, JSON-LD
(`lib/jsonld.ts`), sitemap/robots/`llms.txt`, density read-model (for city gating).
**New:** comparison-page template + generator; city-page generator gated on density; SEO pillar
authoring (loneliness, adult friendship, build-community, life-after-feed); Article/HowTo schema.
**Member surface:** `/discover/<city>`, `/vs/<competitor>`, the pillar pages.
**Admin (3 layers):**
- **L1:** `Growth › Acquisition › Programmatic Pages` (new) + `Operations › Pages`.
- **L2:** programmatic generator (template + data source + publish gate), pillar authoring queue,
  schema coverage report.
- **L3:** per-page SEO/meta console.
**Tasks:** GE11-1 comparison template + generator; GE11-2 city-page generator (density-gated);
GE11-3 SEO pillar copy authoring; GE11-4 Article/HowTo JSON-LD; GE11-5 AI-crawler allowlist +
`llms.txt` refresh. **Notion:** "Programmatic pages" (P3), "Cornerstone content pages" (P0),
"Leader-track content" (P3).

### Engine 12 — Attribution + Growth Analytics  ·  ✅ extend
**Purpose:** the measurement spine: first-touch, per-funnel conversion, WAM, activation, retention
cohorts, density, campaign ROI, AI-citation share. The numbers the launch gates read.
**Rides on:** GA4 (client + server mirror), activation funnel (`/admin/engagement`), insights
(`/admin/insights`), density, attribution.
**Extend:** unify a **Growth dashboard** (one operator view: funnels, WAM/retention, density,
campaign ROI, AI-citation); add per-funnel conversion + AI-citation tracking.
**Admin (3 layers):**
- **L1:** `Vera AI › Intelligence › Insights` + `Growth` dashboard cards.
- **L2:** the unified Growth dashboard (the launch cockpit's numbers) + Insights drilldowns.
- **L3:** per-entity Stats module.
**Tasks:** GE12-1 unified Growth dashboard; GE12-2 per-funnel conversion analytics; GE12-3
AI-citation share tracking (prompt audits + AI-referral traffic); GE12-4 launch-gate metric
surfaces (return frequency, self-sustaining circles, global→local). **Notion:** "Activation
tracking" (P0), "Revenue checkpoint" (P4).

---

## 6. The phased build (scaled, gated, mapped to Notion)

Each phase ends with a **structural capability**, not a date. Notion P0–P4 dates are directional;
the gate is the real trigger. We aim to finish ahead of the dates.

### Phase G0 — Hardened foundation + money substrate  ·  *gate: foundation green*
The full hardening spine (H0–H5 in FOUNDATION-HARDENING-PLAN) + the **dormant money foundation**
(F1: entity ledger, Stripe Connect, persona axis, module registry). *Capability: a foundation that
won't break under launch traffic and can switch money on instantly.* **Precedes Notion P0.**

### Phase G1 — Funnel core + Growth admin shell  ·  *→ Notion P0*
Engines **1, 2, 5, 12** + the extended Growth admin suite shell. *Capability: build, publish, A/B,
and measure any landing page and funnel from the admin.* Covers Notion: Waitlist page (start), CRM
and host codes, Activation tracking, Cornerstone content pages.

### Phase G2 — Acquisition, activation & the keystone  ·  *→ Notion P0/P1*
Engines **3, 4, 8, 9**. Dual-track waitlist + apply-to-host, per-persona onboarding, the
hosted-global-layer + localization engine, proof + broadcast. *Capability: nobody lands in an empty
room; every newcomer hits first value; proof flows back out.* Covers Notion: Hosted Journey live,
Recruit founding builders, Flagship cohort meets, Tune onboarding, Localizing algorithm v1, First
Circles open, Broadcast first rooms.

### Phase G3 — Operator & creator suites  ·  *→ Notion P1/P2*
Engine **10** across all personas (free wedge live + paid dormant) + operator oversight admin.
*Capability: every operator persona has a working free toolset and a built (dormant) path to paid.*
Covers Notion: Members to hosts, Second builder wave.
> **Depends on:** the [Entity Management Overhaul](ENTITY-MANAGEMENT-OVERHAUL.md) ([ADR-441](DECISIONS.md))
> — the unified per-entity owner console + platform oversight that this phase's operator/creator
> suites compose. Build that track (gated by G0) before/with G3.

### Phase G4 — Funding & monetization (dormant → flip)  ·  *→ Notion P0–P2 build, P1/P4 go-live*
Engines **7** + **6** (finish) + the season-reset upgrade + Collective + validated-creation
publishing. Built dormant in G1–G3 timeframe; **go-live gated on legal entities + `billing_live`**.
*Capability: flip one switch and funding + revenue work end to end.* Covers Notion: Seat/Open/Close
Founders Circle, Campaign page and video, Enable Crew tier, First Crew conversions, Enable
Collective, Donations and grants rail, Founding-membership pre-sale, Member-made Journeys, Revenue
checkpoint.

### Phase G5 — Programmatic & replication scale  ·  *→ Notion P3/P4*
Engine **11** + replication tooling (guide/mentor tooling, volunteer support layer, productized
recruitment, ambassador layer). *Capability: open new cities cheaply; SEO/AI-citation pages
generate from real data.* Covers Notion: Programmatic pages, Productize recruitment, Leader-track
content, Ambassador layer, Open cities two and three, New city density faster, City Ignition
Playbook.

```
 G0 Hardened foundation + money substrate (gate)
        │
        ▼
 G1 Funnel core + Growth admin shell ──▶ G2 Acquisition + activation + Keystone
                                              │
                                              ├─▶ G3 Operator/creator suites
                                              ├─▶ G4 Funding & monetization (dormant → flip on legal)
                                              └─▶ G5 Programmatic & replication
```

---

## 7. Admin suite buildout summary (every system, three layers)

| Suite (L1 home) | New/extend | L2 workspaces | L3 console/modules |
|---|---|---|---|
| **Growth** (extend) | 🟡 | Funnels-as-object, Splash/Pages, Waitlist & Applications, Programmatic Pages, Onboarding, Referrals, Campaigns, Automations, Nurture, Market Read, Agent | page Basics/Layout/Stats/SEO; Reach (QR) inline |
| **CRM** (extend) | 🟡 | Cockpit, Today, Member Intelligence, Playbooks, Resonance Graph, Contacts, Deals, Segments, Referral analytics | per-contact detail; People module |
| **Keystone** (new) | 🆕 | Hosted-Journey scheduler, Density dashboard, Localization thresholds, Founder bootstrap, Federation registry | per-city console |
| **Funding** (new, gated) | 🆕🔒 | Campaign config, Backer CRM, Contribution ledger (entity), Affiliate ledger, Donations/grants | per-campaign tier/gate console |
| **Programs** (extend) | 🟡 | Hosted-Journey content, Seasons, Journeys, Practices, Challenges, Training, Tips, Gamification, Crew Tasks, Store | per-entity Basics/Engage |
| **Community** (extend) | 🟡 | Structure, People & access, Activity (Events/Broadcasts/Proof), Trust & Safety | per-entity console |
| **Operations** (extend) | 🟡 | Spaces, Pages, Pricing, Payments, Theme, Menu, Page Layout, Commerce, System | per-Space settings console |
| **Vera AI / Insights** (extend) | 🟡 | Unified Growth dashboard, Insights drilldowns, AI-citation, Vera config, AI controls, Agent | per-page Stats/Adjustments |

---

## 8. Cross-cutting requirements

- **Measurement:** every engine emits to `engagement_events` (idempotent) and rolls into the
  unified Growth dashboard. North Star stays WAM; launch gates read return frequency,
  self-sustaining circles, global→local, and (campaign) commit-before-launch + first-48h.
- **Naming + voice:** every member-facing string and every Vera/AI generation passes the CONTENT-VOICE
  §10 checklist and uses NAMING.md nouns; the splash/copy engines enforce no em dashes + sentence
  case by construction.
- **Page framework:** every page composes a kit template + `<PageModules>`; rail registered in
  `lib/layout/page-chrome.ts`; no hand-rolled layouts; semantic tokens only.
- **Contract layer:** every engine's reads/writes go through `lib/contract/` view-models so mobile
  reuses them unchanged. This is the gate for the eventual mobile app.
- **Authz + dormant money:** every admin action re-checks capability server-side; every funding/paid
  surface is `billing_live`-gated and entity-tagged; `featureAllowed` short-circuits safe when off.
- **Testing:** money, funding, rewards, and authz paths get e2e coverage (per the hardening plan)
  before go-live.

---

## 9. Definition of done (the Growth OS is launch-ready when)

1. ✅ Any funnel, splash page, onboarding sequence, campaign, and programmatic page is created and
   managed from the admin with no deploy.
2. ✅ The dual-track waitlist + apply-to-host + operator applications run end to end with a review
   queue.
3. ✅ The keystone is live: a hosted global Journey anyone can join, a feed that's never empty, and
   a working global→local shift with a density dashboard.
4. ✅ Proof flows from real rooms back out as broadcast assets.
5. ✅ Every operator persona has a free toolset and a built, dormant paid path.
6. ✅ The funding system is built and dormant, with a one-switch flip-on runbook.
7. ✅ Programmatic + SEO + AI-citation pages generate from live data, gated on real activity.
8. ✅ One unified Growth dashboard shows every launch gate metric.
9. ✅ Every admin system is specified and built three layers deep, integrated into the existing
   suites.

---

## 10. Open decisions (carried, for owner/counsel)

1. **Legal entities live date** — gates Funding go-live (Founders Circle public open is Notion P1 /
   Aug). Architecture is dormant-ready; the flip waits on entities + `billing_live`.
2. **Which entity sells the paid membership tier** (charitable-purpose line; ADR-031). Before G4
   go-live.
3. **Inter-entity bridge mechanism** (for-profit→Foundation vs services agreement; ADR-038). Ledger
   built regardless.
4. **Comparison-page competitive set** — confirm the named alternatives to target.
5. **Hosted-Journey content** — which official Journeys run as the always-on global cohort at launch.

---

## 11. Notion 1:1 map (Community Launch Plan board → Growth OS)

Every launch task mapped to its engine, Growth phase, and current state. Notion dates are
directional; the Growth phase gate is the trigger.

| Notion task | Phase | Milestone | Engine | Growth phase | State |
|---|---|---|---|---|---|
| Hosted Journey live | P0 | | E8 Keystone | G2 | 📐→🆕 |
| Starter Circle playbook | P0 | | E3/E10 | G2/G3 | 🟡 |
| Waitlist page live | P0 | | E3 | G1/G2 | 🆕 |
| Cornerstone content pages | P0 | | E1/E11 | G1 | 🟡 |
| Build-in-public cadence | P0 | | E9 (broadcast) | G2 | 🟡 |
| Recruit founding builders | P0 | | E3 | G2 | 🆕 |
| CRM and host codes | P0 | | E5 | G1 | ✅ wire |
| Activation tracking | P0 | | E4/E12 | G1 | ✅ |
| Seat Founders Circle | P0 | | E7 Funding | G4 build | 🆕🔒 |
| Campaign page and video | P0 | | E7/E1 | G4 build | 🆕🔒 |
| Day-one launch squad | P0 | | E9/E6 | G2 | 🟡 |
| **Flagship cohort meets** | P0 | ★ | E8/E9 | G2 | 📐 |
| Tune onboarding | P1 | | E4 | G2 | 🟡 |
| Localizing algorithm v1 | P1 | | E8 Keystone | G2 | 📐→🆕 |
| Monitor activation | P1 | | E12 | G1 | ✅ |
| **First Circles open** | P1 | ★ | E9/E10 | G2/G3 | 🟡 |
| **Public launch** | P1 | ★ | all | G2 | — |
| **Open Founders Circle** | P1 | ★ | E7 Funding | G4 go-live | 🔒→legal |
| Broadcast first rooms | P1 | | E9 | G2 | 🟡 |
| **Close Founders Circle** | P1 | ★ | E7 Funding | G4 | 🔒 |
| Second builder wave | P1 | | E3/E9 | G2/G3 | 🆕 |
| Stretch season reset | P1 | | E4/Quest | G3 | ✅ |
| Shed season programming | P2 | | Programs/Quest | G3 | ✅ |
| Refine messaging | P2 | | E6 | G4 | 🟡 |
| Verify global to local | P2 | | E8/E12 | G2 | 📐 |
| Members to hosts | P2 | | E10/E3 | G3 | 🟡 |
| **Enable Crew tier** | P2 | ★ | E7/Pricing | G4 go-live | ✅🔒→legal |
| **First Crew conversions** | P2 | ★ | E7 | G4 | 🔒 |
| **City Ignition Playbook** | P2 | ★ | E11/E8 | G5 | 📐 |
| **Lead city self-sustaining** | P2 | ★ | E8/E10 | G3 | — |
| Sit season programming | P3 | | Programs/Quest | G3 | ✅ |
| Programmatic pages | P3 | | E11 | G5 | 🆕 |
| Productize recruitment | P3 | | E3/E10 | G5 | 🆕 |
| Leader-track content | P3 | | E11/Programs | G5 | 🟡 |
| **Ambassador layer** | P3 | ★ | E10 (guide/mentor) | G5 | 🟡 |
| **Open cities two and three** | P3 | ★ | E8/E11 | G5 | 📐 |
| **New city density faster** | P3 | ★ | E8 Keystone | G5 | 📐 |
| Sprout season programming | P4 | | Programs/Quest | G3 | ✅ |
| **Enable Collective** | P4 | ★ | E10/E7 | G4 go-live | 📐🔒 |
| Member-made Journeys | P4 | | E12 (validated creation) | G4 | ✅ |
| Donations and grants rail | P4 | | E7 Funding | G4 go-live | 🆕🔒 |
| **Founding-membership pre-sale** | P4 | ★ | E7 Funding | G4 go-live | 🆕🔒 |
| **Physical home R&D** | P4 | ★ | (Labs / out of web scope) | — | 📐 |
| **Revenue checkpoint** | P4 | ★ | E12/E7 | G4 | — |

---

*Owner: Daniel (Vision Steward). Created 2026-06-28. This plan re-sequences the launch build onto
config-driven engines + admin suites; it does not replace DEVELOPMENT-MAP.md or PLATFORM-VISION.md.
Build order is gated by FOUNDATION-HARDENING-PLAN.md (harden first).*
