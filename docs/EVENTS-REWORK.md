# Events Re-Architecture: Plan of Record

> **Status:** Ratified plan (2026-06-14). Decisions locked as ADR-254/255/256.
> **Authority:** running code + `supabase/migrations/` > this doc > Notion.
> **Relationship to [`EVENTS-SYSTEM.md`](EVENTS-SYSTEM.md):** that doc reconciled an
> external "v2 brainstorm" against the schema and is still a good capability map, but its
> build log **overclaims** (host messaging, a host Manage screen, and a waitlist roster are
> logged as shipped yet have no table, migration, or code on this branch or in prod). This
> document is the corrected plan of record. Where they disagree, this wins; the schema wins
> over both.

---

## The answer up front

The Events system is **not greenfield**: roughly 70% of a capable system is already live (at
seed scale: 3 events, 1 RSVP in prod). The work is a **re-architecture around two clearly
separated product surfaces**, plus closing **three foundational gaps**, plus an honest
reconciliation of what is actually built. We **extend and wire**; we do not rebuild.

| Surface | Reference | What it is | State today |
|---|---|---|---|
| **The Invite** | Partiful / Luma | One event, host↔guest: intimate, expressive, interactive, RSVP-centric, host updates | Functional but plain; missing the expressive + interactive + messaging layer |
| **The Catalog** | Eventbrite / Meetup | Many events, geolocated discovery: search / sort / filter / map / "near me" | Exists but **circle-anchored, not venue-geolocated**: cannot truly do "near me" |

## Locked decisions

| ADR | Decision | Consequence |
|---|---|---|
| **ADR-254** | **Hybrid event scope.** Keep Circle events; add **standalone public events** as first-class. | Build public/unlisted visibility RLS for non-Circle events + a moderation surface. The catalog can finally hold events that do not live inside a Circle. |
| **ADR-255** | **Host updates are Event Dispatches.** Base action = post an update to the event page; optional toggles to **send as a Dispatch** (event-scoped, renders in the feed as a Dispatch with an **event badge**) and/or **text the group** (SMS). Supersedes the never-built `event_blasts`. | Reuse the `dispatches` rail + notification queue. No separate broadcast system. NAMING.md updated. |
| **ADR-256** | **Channel sequencing.** Event page post + Event Dispatch ship now over in-app / push / email. "Text the group" (SMS) is built behind the A2P 10DLC / EIN legal gate. | SMS is the long pole; its legal track can start in parallel any time. No feature blocks on it except the SMS send itself. |

## What already exists (extend, do not rebuild)

✅ `events` + `event_rsvps` (with unused `maybe` / `waitlist` / `plus_ones` columns) · recurrence ·
ICS feeds + per-member calendar-follow tokens · Stripe Connect ticketing with tiers
(fixed/free/PWYC/sliding/donation) + refunds · check-in via the append-only engagement ledger
(idempotent, awards Zaps) · QR/NFC `nodes` pipeline · 3-touch reminder cron (7d/24h/2h) over a
durable queue + send-gate (email + web-push) · event embeddings (384-d) + hybrid matching + AI
"why you'd vibe" blurbs · poster-capture (photo → Vera → draft → publish → claim) · activity
feed / recap album / cohosts · public `/discover/events` SEO surface with organizer profiles,
JSON-LD, sitemap, city-level redaction · visibility RLS (`public`/`unlisted`/`circle_only`/`private`).

## Docs-vs-reality corrections (verified against code + prod DB)

| Logged as shipped | Reality | Where it lands in this plan |
|---|---|---|
| Host→guest `event_blasts` + per-event mute | 🔴 No table / migration / code | Rebuilt as **Event Dispatches** (A2) |
| Host "Manage" screen + waitlist roster + host-marked check-in | 🔴 Not present | Host Manage Dashboard (A2) |
| `maybe` / `plus_ones` / approval RSVP UI | ⚠️ Columns exist, no UI | RSVP depth (A1) |
| Event migrations "pending ops" | ✅ Already applied to prod | Phase 0: regen types only |

## The three foundational gaps

1. **Events have no location of their own.** `events.location` is free text; all map/distance
   logic rides on the hosting *Circle's* `geog` point. A real geolocated catalog needs
   first-class `events.geog geography(Point,4326)` + structured address + attendance mode.
   *(Biggest structural change; spine of Track B.)*
2. **Events are Circle-scoped by design.** `scope_type='circle'` is effectively hardcoded.
   ADR-254 opens this to standalone public events with its own visibility RLS + moderation.
3. **The Invite is plain and one-directional.** No cover/theme for member-created events, no
   host updates, no questionnaire, no approval flow, no reactions, no host roster. The Partiful
   magic is exactly this expressive + interactive + messaging layer.

---

## Best practices distilled (sources catalogued at the foot)

**The Invite.** Three RSVP states with host-only decline reasons; +1s with optional required
names; capacity + auto-promoting waitlist; approval flow where *invited* guests skip the queue
(Luma); guest list visible by default as social proof, declines private; expressive
cover/theme/effects as the real moat; **compose-once, target-by-RSVP-status, fan-out by channel**
for updates; host send caps (Partiful: 10/event; block cold sends > 100 un-RSVP'd); reminder
cadence keyed to RSVP state (Going → 2h, Maybe → 1-week nudge).

**The Catalog.** Two orthogonal axes (**Topic × Format**) with ~15-20 browsable top-level
topics and free-form tags beneath for matching (Meetup Topics), kept out of indexable URLs;
`geography(Point,4326)` + GiST + `ST_DWithin` (index-using) + `<->` KNN for "near me," exposed as
a hardened, RLS-respecting Supabase RPC; **keyset/cursor pagination** (offset collapses at depth);
server-side marker clustering / viewport-bounded queries / vector tiles at scale; Postgres FTS +
`pg_trgm` + existing embeddings is enough at launch (graduate to Typesense only when typo-tolerant
instant search drives growth); PPR/Suspense to stream personalized "near you" holes over a cached
shell *(verify Next APIs against `node_modules/next/dist/docs/`: this is not stock Next)*.

**SEO.** schema.org `Event` with `eventAttendanceMode`, `eventStatus`, `offers.priceCurrency`,
multi-aspect `image`; indexable `/discover/events/[city]/[category]` hubs whose value is unique
*data*, not boilerplate; expired events → `noindex,follow` then `404`, isolated in a separate
sitemap; block low-value facet URLs in robots.txt (faceted nav is ~50% of crawl issues).

**Day-of.** Signed-token QR (verify offline) + DB redeem flag (prevent reuse); host-scan and
self-check-in modes; manual name-search fallback; scoped check-in-only staff role; rotating TOTP
codes only for resale-sensitive paid tiers.

**Compliance.** Quiet hours 8am-9pm local; one-click email unsubscribe + SPF/DKIM/DMARC; SMS is a
hard legal gate (A2P 10DLC mandatory since Feb 2025; express written consent; opt-out ≤10 business
days; statutory damages $500-1500/message). Aligns with the locked trauma-informed overlay:
maximum member control, privacy by default, blameless re-engagement copy.

---

## The phased plan

### Phase 0: Reconcile & set the runway *(short)*

| Deliverable | Why |
|---|---|
| Reconcile build logs to reality; this doc + ADR-254/255/256 | Docs overclaim what shipped |
| Regenerate `lib/database.types.ts`; drop `as unknown as SupabaseClient` casts | Real type errors are currently hidden |
| Run Supabase security + perf advisors; fix lints | Never run against the applied migrations |
| Confirmation-on-RSVP reminder touch | Smallest high-value delta on existing infra |

### Track A: The Invite *(parallel after Phase 0)*

| Phase | Deliverable |
|---|---|
| **A1: RSVP depth + expressive invite** | Surface `maybe` / `plus_ones` (+ require names) / waitlist UI; **approval-required RSVPs** (invited guests auto-approve); host-only decline reasons; **guest questionnaire** (dietary, song requests) as `event_questions` / `event_question_answers`; **cover image + theme/effect** for all events (compose on Detail template); reminder cadence keyed to RSVP state |
| **A2: Event Dispatches + interactive layer + day-of** | **Event Dispatch** (ADR-255): post update to event page → optional "send as Dispatch" (rides `dispatches`, feed event badge, fan-out in-app/push/email via queue + send-gate, per-event mute, host caps, 60-day post-event window) + optional "text the group" (SMS, built behind the gate); reactions ("Boops") / GIF comments / contributable album / lightweight polls; **QR check-in** (signed token + redeem flag, host + self modes, name-search fallback, scoped staff role); **Host Manage Dashboard** (roster, waitlist, questionnaire CSV, check-in, dispatches, basic analytics) on the Dashboard template |

### Track B: The Catalog *(B2 depends on B1)*

| Phase | Deliverable |
|---|---|
| **B1: Event geolocation foundation** *(the spine)* | `events.geog` + structured address + `attendance_mode` (in_person/online/hybrid) + online URL; geocode-on-save; GiST index; hardened `nearby_events` RPC (`ST_DWithin` + `<->` KNN, RLS-respecting, city-level public / exact for entitled); member home + radius default; migrate map/distance from Circle-anchored to event-anchored |
| **B2: Discovery surface** | Topic × Format taxonomy + tags; hybrid search (FTS + `pg_trgm` + embeddings); sort (date/distance/popularity/relevance); filters (category/date/price/format/has-spots/distance); keyset pagination; PPR/Suspense; map-first browse + server-side clustering; full schema.org `Event`; indexable city×category hubs; expired-event + faceted-nav crawl hygiene; per-event OG images; seeded recommendations |

### Phase C: Scale, depth, SMS, partners *(later; SMS legal track can start early)*

SMS behind a `sendSms()` guard once EIN + A2P 10DLC complete (24h / day-of touches only); paid
waitlist holds (Luma authorize-then-capture); Apple/Google Wallet passes + rotating QR for
resale-sensitive tiers; recurrence → RRULE if real demand; host analytics depth; optional
Eventbrite/Meetup import.

**Dependencies:** Phase 0 first. Tracks A and B run in parallel. B2 needs B1. The SMS legal track
(EIN + 10DLC, multi-week carrier lead) is the long pole.

## Schema deltas (additive, backward-compatible)

| Area | Change |
|---|---|
| `events` | `+ geog geography(Point,4326)` (GiST), `+ attendance_mode`, `+ online_url`, structured address cols, `+ cover_image_path`, `+ theme`; relax `scope_type` to allow standalone public (ADR-254) |
| `event_rsvps` | wire `maybe` / `waitlist` / `plus_ones`; `+ plus_one_names`, `+ decline_reason`, approval state |
| new | `event_questions` / `event_question_answers` (host-only answers) |
| new | `event_dispatches` (event-scoped Dispatch link + channel flags) reusing `dispatches` + `notification_queue` |
| Track C | `sms_consent` scope + `notification_preferences.sms_*` (behind the gate) |

## Guardrails (every phase)

- **Naming canon:** "Event" stays. Host updates are **Event Dispatches** (ADR-255, NAMING.md).
  All copy runs the CONTENT-VOICE §10 checklist; no em dashes in member copy; never narrate feelings.
- **Page framework:** compose the kit: Index (`/events`), Detail (`/events/[slug]`), Focus
  (create/scan), **Dashboard** (host Manage). No hand-rolled layouts; semantic DAWN tokens only.
- **DB-level invariants** for money/capacity (atomic inventory, capacity triggers): already convention.
- **Trauma-informed overlay:** privacy by default, member-set notification/visibility/pacing,
  blameless copy. Standalone public events (ADR-254) raise the moderation bar: surface it in B1.

## Founder / ops items

1. **EIN + legal entity** → gates A2P 10DLC (SMS) and Stripe Connect payouts. Start early if SMS matters.
2. **Moderation policy** for standalone public events (ADR-254).
3. Flip `host_payouts_enabled` when ticketing should go live.
4. Re-run Supabase advisors after each migration wave.

## Sources (best-practices research, 2026-06-14)

Partiful & Luma help centers (RSVP/approval/waitlist/themes/visibility/blasts); Meetup &
Eventbrite (announcements, taxonomy, reminder defaults); Mailchimp/OneSignal/Attentive (cadence,
frequency caps, orchestration); Salesmessage/Telnyx/Mailgun (TCPA/10DLC, CAN-SPAM, Gmail/Yahoo
bulk rules); PostGIS + Supabase docs + Crunchy Data (geography vs geometry, `ST_DWithin`, KNN,
hardened RPC); Sequin/Stacksync/GitLab (keyset pagination); Google Search Central + schema.org
(Event structured data, faceted-nav crawl management); Next.js PPR/streaming. Full URL list held
in the research record for this plan.

## Implementation log

### 2026-06-14: Waves 1-3 (built by parallel agents, synthesized centrally)

> All new columns/tables are read via the cast convention; **migrations are written but NOT
> applied to prod**, and `lib/database.types.ts` is not yet regenerated. The typed cutover
> (preview branch → regen types → drop casts) is gated on the Supabase **Pro** plan.

- **Wave 1, design + foundation** (merged, #753/#754): `docs/EVENTS-DESIGN.md` (listing + detail
  interior); 6 additive migrations: `event_geolocation` (+ `nearby_events` RPC, SECURITY INVOKER),
  `standalone_public_events` (ADR-254 RLS), `event_rsvp_depth`, `event_questions`, `event_dispatches`
  (ADR-255), `event_cover_theme`, plus the `lib/events/` data layer.
- **Wave 2, build** (merged, #754): event detail two-column interior (rail `'none'` on `[slug]`),
  catalog facets/sort/near-me/hybrid scope, and the **Event Dispatch feed bleed**: push to guests +
  Circle, with the surrounding-area reach as a passive, **resonance-gated** feed surface
  (`viewerInEventDispatchArea` + `getMyOrbit`; "the feed of people close by who have resonance").
- **Wave 3, depth**: host **Manage Dashboard** + questionnaire; `/discover/events` schema.org `Event`
  enrichment (attendance mode / status / offers / location) + city×category hubs + per-event OG image;
  a keyless **geocoder** (Nominatim, graceful fallback) wired into create/edit so events get a real
  `geog`; persisted **Boops** (`event_post_reactions`); and **SMS groundwork** (`sms_groundwork`
  migration + `sendSms()` guard, all gated OFF until A2P 10DLC).

**Pending (founder-gated):** apply the migrations + regenerate types (Supabase Pro) and drop the casts;
EIN/legal entity for SMS go-live + Stripe payouts; the standalone-events moderation policy (ADR-254).
