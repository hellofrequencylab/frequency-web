# Events System: Reconciled Spec & Build Map

> **Status:** Proposal / brainstorm reconciliation (2026-06-09). Not yet ratified. No ADRs
> added here. This document takes the external "Frequency Events System v2" brainstorm and
> **reconciles it against what the codebase actually contains today**, so we build *with* the
> grain instead of rebuilding live infrastructure.
> **Authority:** running code + `supabase/migrations/` > this doc. Where this disagrees with the
> v2 brainstorm, the code wins. When a decision below is ratified, record it as an ADR in
> `DECISIONS.md` and link it back here.

---

## The answer up front

The v2 brainstorm is an **excellent product vision** and its three design laws are strongly
supported by research (§4). But it was written against the **January-2024 "9-table schema."** We
are ~135 migrations and ~100+ tables past that. **An Events system already exists and is
substantially built**: events, RSVPs, recurrence, T-24h/T-2h reminders (email + push), ICS,
gamification hooks, and **paid ticketing via Stripe Connect destination charges (ADR-177, shipped
2026-06-09)**. Roughly **60 to 70% of what the brainstorm calls "new" is already live**, often in a
more mature form.

So this is not a greenfield build. It's three things:
1. **Correct** a handful of brainstorm assumptions that are now wrong (Stripe model, currency
   model, check-in path, rank names, routing/column conventions).
2. **Extend** existing primitives for the genuine gaps (ticket tiers / PWYC, refunds, waitlists,
   ticket-bound check-in, the activity feed/recap, event matching).
3. **Build** the one genuinely net-new subsystem: the **SMS channel** (Twilio + A2P 10DLC + TCPA),
   which is *not* in the locked communication strategy and carries the highest legal risk in the
   whole plan.

---

## 1. The three corrections that change the plan

| # | v2 brainstorm says | Reality in the repo | What to do |
|---|---|---|---|
| **1. Payments** | Run tickets under one Frequency Stripe account for MVP; Stripe Connect is "P2+, not MVP" (§7.4). | **Connect is the foundation.** One Express account per profile (ADR-175), tips shipped as channel #1 (ADR-176), **event tickets shipped as channel #2 (ADR-177)** via destination charge → host's connected account + `application_fee` (`lib/billing/tickets.ts`, `event_tickets` table, `host_payouts_enabled` flag default OFF per ADR-178). | ⚠️ **Reverse this recommendation.** Do not build a single-account flow. Extend the Connect ticketing that already exists. |
| **2. Currency** | Attendance pays **Zaps** (single currency). | **Two currencies, enforced** (`lib/engagement/currency.ts`, ADR-139): *online → Gems, real-life → Zaps*. Twin append-only ledgers (`gem_transactions` / `zap_transactions`); **award = ledger insert only** via `awardGems` / `awardZaps`; the `after_zap_transaction` trigger is the *single* place totals + rank move. Events **already award correctly**: first RSVP → `awardGems('event_rsvp')`; verified check-in → `awardZapsForAction('event_attend')`; hosting → `awardZapsForAction('event_host')` + streak. | ⚠️ **Re-map §6 to both currencies.** RSVP is a Gem event, not a Zap event, and it's already wired. Never mutate `profiles.*_zaps` directly (the gamification audit fixed exactly that leak). |
| **3. Check-in → credits** | New `event_checkins` table + bespoke "enqueue credits" hook + new `qr_token`. | **The engagement backbone already does this.** SOURCE→VERIFY→LEDGER→REWARD with `recordEngagementEvent({ idempotencyKey })` (exactly-once), server-side PostGIS proximity verification, and a live QR/NFC **`nodes`** check-in system (`/admin/qr`, `/n/<id>`). Event check-in already flows through it: `idempotencyKey: 'event_checkin:<eventId>:<profileId>'`. | ⚠️ Make ticket-bound check-in a **source adapter into the existing pipeline** (or an event-bound node), not a parallel path. You inherit idempotency, anti-farm verification, and realtime "you earned X" for free. |

---

## 2. Reuse vs. Build: section-by-section map

Legend: ✅ exists, reuse as-is · 🔧 exists, extend · 🆕 genuinely new · ⚠️ brainstorm assumption to correct

| v2 § | Capability | Status | What's there / what to do | Key files |
|---|---|---|---|---|
| 2.1 | `events` table | 🔧 | Exists: `host_id`, polymorphic `scope_type`/`scope_id` (always `'circle'` today), `slug` (unique), `starts_at`/`ends_at`, `is_cancelled`, Mux livestream, `recurrence_type`/`recurrence_until`, `price_cents`/`currency`. Add only what's missing (capacity, visibility tiers, category/energy_tag, TBD timing). | `…initial_schema.sql`, `…event_recurrence.sql`, `…event_tickets.sql` |
| 2.1 | `event_embeddings` (pgvector) | 🆕 | New, but embeddings infra exists (gte-small **384-d**, not 1536; match `EMBED_DIM`). | `lib/ai/embed.ts`, `supabase/functions/embed/` |
| 2.2 | Ticket **tiers** / PWYC / sliding / donation | 🆕 | Real gap. Today ticketing is a single flat `events.price_cents`. Add a tiers table + PWYC floor logic. | `lib/billing/tickets.ts` (extend) |
| 2.3 | Orders + tickets (Stripe) | 🔧 | `event_tickets` already records purchases via Connect destination charge, idempotent two ways (webhook + success-redirect). A separate `event_orders` table is likely **over-modeling**; extend `event_tickets`. QR/`holder_id`/gifting are the additions. | `lib/billing/tickets.ts`, `app/api/webhooks/stripe/route.ts` |
| 2.4 | `event_rsvps` | 🔧 | Exists (`profile_id`, status `going`/`not_going`, `reminder_*_sent_at`). Extend status set (`maybe`/`waitlist`/`approved_pending`), add `plus_ones`. | `…initial_schema.sql`, `events/actions.ts` |
| 2.5 | `event_checkins` | ⚠️🔧 | Don't add a parallel table: ride `engagement_events` (already keyed per event+profile). Add ticket-binding to it. | `lib/engagement/{events,verify,capture}.ts` |
| 2.5 | `event_blasts` (host→guests) | 🔧 | Reuse the **Dispatch** ladder + notification queue rather than a fresh broadcast system; a thin event-scoped wrapper is fine. **Must** add real per-event mute (Partiful's #1 complaint is mute that doesn't mute). | `lib/queue/outbox.ts`, dispatch infra, `notification_preferences` |
| 2.5 | `event_posts` (activity feed) | 🆕 | New. Mirror the posts/Stream pattern. | `app/(main)/feed/*` as precedent |
| 2.5 | `event_media` (recap album) | 🆕 | New. |  |
| 2.5 | `event_cohosts` | 🆕 | New (small). Gate on `get_my_role() >= 'host'`. |  |
| 2.6 | `notification_prefs` | ⚠️🔧 | **Exists as `notification_preferences`** (per channel×category; "events" is already a category; push defaults OFF). Extend with `sms_*` columns + quiet hours; don't create a parallel table. | `…notification_preferences.sql`, `lib/notification-preferences.ts` |
| 2.6 | `sms_consent` | 🆕 | New, but link it to the append-only `consent_records` ledger (add an `sms` scope) rather than reinventing the audit trail. A dedicated table is justified for the phone-verification lifecycle. | `lib/consent/*`, `…consent_records.sql` |
| 2.6 | `notification_log` | 🔧 | `notification_queue` + `email_events` + Resend webhook already log delivery/suppression. Extend for SMS. | `lib/queue/*`, `app/api/webhooks/resend/route.ts` |
| 2.7 | RLS | ⚠️ | Brainstorm's `auth.uid()` ownership is **not** our convention. Use SECURITY-DEFINER helpers `get_my_profile_id()` / `get_my_role()` (enum-ordinal: `member<crew<host<guide<mentor`), and **service-role-write-only** (RLS ON, no INSERT/UPDATE policy) for all money/ledger tables. | `…rls_policies.sql`, `…_rls_convergence.sql` |
| 3 | Matching engine (hybrid score) | 🆕 | New for events, but signals exist: profile `embedding` (384-d), `feed_for_viewer` ranking, `lib/distance.ts`/`geocode`, circle membership graph. **Don't ship an empty "For You" at launch** (cold-start): seed with content + proximity + social. | `lib/feed-rank.ts`, `lib/ai/embed.ts` |
| 3.2 | AI "why you'd vibe" blurbs | 🆕 | No event AI exists. Build on the kernel: `completeText` (Haiku default) + the `connections-ai` forced-tool-call pattern for parseable output; cache per (user,event)/day; read-only; degrade to deterministic fallback when `aiEnabled()` is false. | `lib/ai/{complete,models,connections-ai}.ts` |
| 3.3 | Faceted library + ICS subscribe | 🔧 | `/events` Index exists; ICS exists at `app/events/[slug]/event.ics/route.ts`. Add facets (category/energy/price/distance/"has spots") and **filtered ICS subscription feeds** (high-retention, low-pressure). | `app/(main)/events/page.tsx` |
| 5 | Notification dispatcher (inapp/push/email) | ✅🔧 | Already built: queue-everything outbox (ADR-026), Resend email, web-push (VAPID), prefs + `send-gate` (prefs+consent+suppression), `process-queue` cron. Reuse; add SMS as a channel behind the gate. | `lib/comms/send-gate.ts`, `lib/{email,push}.ts` |
| 5.4 | 3-touch reminder cadence | ✅🔧 | `event-reminders` cron already fires **T-24h / T-2h** (idempotent, prefs-gated, email+push). Add the **confirmation** (on RSVP) + **~1-week** touch to complete the research-backed 3-touch sequence. | `app/api/cron/event-reminders/route.ts` |
| 5 (SMS) | Twilio + A2P 10DLC + TCPA | 🆕 | **The one truly new subsystem.** Not in COMMS-STRATEGY (locked channels are email/inapp/push). Highest legal risk: see §5. | none yet |
| 6 | Zaps / Gems for events | ✅⚠️ | Mostly built and correct (RSVP→gems, attend→zaps, host→zaps+streak). Correct the brainstorm's single-currency framing and **rank names** (see §3). | `events/actions.ts`, `lib/{zaps,gems}.ts` |
| 6.2 | Circle Current (collective) | 🆕 | New (was "Circle Field", renamed to canon, NAMING.md/ADR-208). Roll up members' event Zaps to a circle standing; `resonance_public` flag default false. Reuse existing circle-momentum metrics; **make the shared goal explicit** (research: collective works only when the goal + teammates are visible). | `circle_momentum` metrics, `memberships` |
| 6.3 | Gentle streaks | ✅ | Streak infra exists (`streaks`, `lib/streak.ts`, attendance/hosting streaks). Keep "breaking costs nothing." | `lib/streak.ts` |
| 7 | Refunds / cancellation / waitlist | 🆕 | Real gaps on top of existing ticketing. Cancellation→bulk-refund→free capacity→promote waitlist. | `lib/billing/*`, Stripe MCP |
| 8 | UX (Partiful feel) | 🔧 | Events already built on the **Page Framework** (see §6). Compose the kit; don't hand-roll. | `components/templates/*` |
| 8 | Routing | ⚠️ | It's **`/events/[slug]`**, not `/events/[id]`. Create form is **Focus** (`/events/new`, already in `FOCUS_PATTERNS`). |  |

---

## 3. Other corrections (smaller, but they'll bite)

- **Rank ladder names are wrong.** The brainstorm's martial-arts ladder is **retired**. Do not
  reintroduce it (NAMING.md §Retired). The live, canon ladder (`season_rank_enum`,
  `lib/season-ranks.ts`) is **ghost → echo → signal → beacon → conduit → luminary** (renamed
  2026, see docs/NAMING.md; migration `20260613000030`), thresholds owned by
  the `after_zap_transaction` trigger, 13-week seasonal reset via `reset_season()`. Use the canon names.
- **`user_id` → `profile_id`.** Everything keys on `profiles(id)`; `auth.uid()` maps via
  `profiles.auth_user_id`. The brainstorm's column names and RLS predicates assume the wrong shape.
- **"Standalone events" is a real scope change.** Today events are **circle-scoped only**
  (`scope_type:'circle'` hardcoded in `createEvent`; the Index shows only the viewer's circles'
  events; empty state literally says *"Events live inside circles"*). A member-created standalone
  event needs a deliberate scope decision, not just a nullable `circle_id`.
- **Two Stripe webhook endpoints exist** (`/api/stripe/webhook` for memberships,
  `/api/webhooks/stripe` for Connect/tickets). Decide whether to consolidate before adding more
  ticket logic.
- **Embedding dim is 384, not 1536** (`EMBED_DIM`, gte-small via the `embed` edge function).
- **No `frontend-design` skill** exists in this repo (AGENTS.md references one). UI rules live in
  `PAGE-FRAMEWORK.md` + `PRESENTATION.md` + `DESIGN-LANGUAGE.md` (DAWN tokens).

---

## 4. Engagement design: laws, evidence, and where we already comply

The brainstorm's three laws are the right spine. Research backs them, and tells us exactly where to
push and where to stop. (Citations are illustrative of the evidence class; verify SMS law with
counsel; rules shifted through 2024 to 2025.)

### Law 1: Warm proof, not FOMO ✅ strongly supported
- **Highest-ROI attendance lever is implementation intentions**: committing the *when/where/how*.
  Operationally: **auto add-to-calendar on RSVP**. This is the single most-praised Luma feature and
  the thing users say makes them *miss* events on Partiful. We already emit ICS at
  `/events/[slug]/event.ics`: **make it one-tap/auto at RSVP and prominent.**
- **Never surface low/negative counts.** Negative descriptive norms boomerang (the classic
  Petrified Forest field experiment *doubled* the unwanted behavior). For a 4-person circle event,
  "only 4 going" is the trigger to avoid. Prefer *growing* ("filling up", "3 from your circles").
- **Dark patterns cost trust** (≈56% of users report losing trust over manipulative design; fake
  countdowns/scarcity are now actively policed). The brainstorm's "scarcity only when real" rule is
  correct, so enforce it: capacity framed as *care* ("small group, 12 seats"), never manufactured.

### Law 2: Presence over performance ✅ strongly supported
- **SDT (autonomy/competence/relatedness)** predicts which gamification sustains; meta-analyses
  show the durable wins are in *relatedness + autonomy*, not points alone.
- **Overjustification**: bolting extrinsic rewards onto things people already enjoy erodes intrinsic
  motivation → reward **attendance/contribution**, not logins (we already do: RSVP pays a token
  Gem, *attendance* pays the Zaps).
- **Avoid competitive public leaderboards** (negative feedback to the lower-ranked → harmful for
  vulnerable users) and **loss-aversion streaks** (consensus harm to neurodivergent/trauma
  populations; never monetize streak-saves). Our streaks already "cost nothing to break," so keep it.
- **Collective > competitive** *only when the shared goal + teammates are explicit*. So Circle Current
  must show "**our** circle logged N this week," not an inter-circle ranking. The `resonance_public`
  default-false design is right.

### Law 3: Consent is sacred ✅ strongly supported, and the legal long-pole
- **Tier notifications** (transactional always · behavioral-trigger · promotional opt-in-only);
  **behavioral triggers vastly outperform blasts** (automated push ~58.7% vs ~34.3% open).
- **Quiet hours 8am to 9pm local**; per-channel, per-purpose consent; **real per-event mute + frequency
  caps** (the #1 reason people permanently disable notifications is frequency without
  personalization).
- **SMS reality check:** the "98% open" stat is a myth; the honest metric is CTR (~19%). SMS's value
  is **immediacy**: reserve it for the **24h/day-of** touch, which is the load-bearing reminder
  (moving reminders *earlier* than 24h has been shown to *increase* no-shows).

### Trauma-informed overlay (the audience)
Anchor in SAMHSA's six principles: Safety; Trust/Transparency; Peer Support;
Collaboration/Mutuality; Empowerment/Voice/Choice; Cultural awareness. In product terms: **maximum
user control by default** (notification, visibility, pacing all member-set), **default to privacy**
(attendance visible to host, optionally to invitees, member chooses), peer support as a first-class
surface, affirming/inclusive language, and **blameless re-engagement copy** (never "you broke your
streak / you've been away").

### Hard "do not build" list (ethics + law + trust)
Countdown timers · fake or low scarcity counts · public competitive leaderboards · loss-aversion
streaks (esp. paid streak-saves) · shame-based re-engagement · cross-brand SMS consent · any
unregistered SMS.

---

## 5. The one genuinely new subsystem: SMS (start the clock, don't block on it)

SMS is the highest-value *and* highest-risk addition. It is **not** in the locked communication
strategy and has a multi-week regulatory lead time.

- **Provider:** Twilio (as CSP) bundles A2P 10DLC onboarding, Messaging Services (number pooling +
  failover), built-in STOP/HELP/START, and status webhooks. The premium buys down compliance/ops
  risk for a small team. Build a thin **in-house dispatcher** on our existing queue (keeps member
  contact data in our privacy-first environment); do not adopt a 3rd-party orchestration SaaS.
- **Single guard, no bypass:** one `sendSms()` (sibling of `lib/comms/send-gate.ts`) that refuses
  unless `sms_consent='opted_in'` **AND** `notification_preferences.sms_enabled` **AND** inside the
  recipient's quiet-hours window **AND** brand/campaign env flags are set.
- **Compliance gates (launch-blocking, confirm with counsel):**
  - **A2P 10DLC** brand + campaign registration before *any* send. Carriers block ~100% of
    unregistered traffic. Register the real use cases (event reminders/notifications;
    account/transactional). Message content must match the registered campaign.
  - **Double opt-in** (phone added → verify code → `opted_in`); store exact opt-in language + source
    (audit trail in `sms_consent` + a `consent_records` scope).
  - **Opt-out** honored across STOP/UNSUBSCRIBE/CANCEL/END/QUIT (and any reasonable channel) within
    10 business days; mirror Twilio keyword events inbound.
  - **One-to-one consent:** never share/sell consent across brands/affiliates.
  - **Quiet hours** before 8am / after 9pm local (TX stricter: 9am to 9pm). Hold-and-send at window
    open.
  - **Exposure:** $500 to $1,500 per message statutory damages; recent class settlements in the
    millions. This is the single biggest legal risk in the plan.

---

## 6. Frontend: compose the framework that already hosts Events

Events is already built strictly on the Page Framework; new surfaces extend it, never re-author
layout.

- **Templates** (`components/templates/`): **Index** (`/events` browse) · **Detail**
  (`/events/[slug]`) · **Focus** (`/events/new`, already in `FOCUS_PATTERNS`). A host workspace =
  **Dashboard** (compose `StatCard`s). Activity feed = **Stream**.
- **Kit** (compose, don't hand-roll): `PageHeading`, `EntityCard` (the `EventCard` wraps it),
  `PersonCard`, `StatCard`/`StatStrip`, `SectionHeader`, `EmptyState`, `Dialog`, and `field.tsx`
  inputs. **No shadcn**: `components/ui/` is bespoke; icons are `lucide-react`.
- **Tokens (DAWN):** semantic CSS vars in `app/globals.css` (Tailwind v4, `@theme inline`). Use
  `bg-canvas`/`bg-surface`/`text-text`/`text-muted`/`bg-primary`, `text-2xs`/`text-3xs`. **Never**
  hardcode hex or `text-[Npx]`.
- **Rail:** presence in `lib/layout/page-chrome.ts` (`railFor`), content in
  `lib/layout/rail-panels.ts` (`/events` → `['events','online','circles']`).
- **Perf:** Server Components by default; push slow/independent queries behind per-section
  `<Suspense>` (the Events Index currently awaits inline; fix when touched).
- **Cleanup debt to fold in:** `app/(main)/events/new/event-form.tsx` violates the token rule (raw
  `text-gray-*`/`border-gray-*`); migrate to `field.tsx` + DAWN when extending the create flow.

---

## 7. Reconciled build plan (grounded in what exists)

### P0: Close the core-loop gaps (free + already-paid events)
- 🔧 Extend `events` (capacity, visibility tiers, category, `energy_tag`, TBD timing) + `event_rsvps`
  (status set, `plus_ones`, waitlist).
- 🔧 Ticket-bound check-in **through `engagement_events`** (not a new table); QR via the existing
  `nodes`/`/n` system bound to an event.
- 🔧 Complete the reminder cadence: add **confirmation (on RSVP)** + **~1-week** touch to the live
  T-24h/T-2h cron; keep 24h sacred.
- 🆕 **Auto add-to-calendar on RSVP** (one-tap ICS): highest-ROI attendance lever.
- 🆕 Circle Current roll-up + `resonance_public` (default false), shared-goal framing.
- **Accept:** member RSVPs and lands a calendar commitment; warm-proof block shows real, never-low
  counts; verified check-in awards Zaps once; circle events accrue Circle Current visible only to the circle.

### P0.5: SMS compliance (start day one, parallel, long lead)
- 🆕 Begin A2P 10DLC brand + campaign registration (1 to 3 wk). Confirm legal entity + EIN (also gates
  Connect payouts). Don't block P0 on it.

### P1: Ticketing depth + engagement surfaces
- 🆕 Ticket **tiers** + PWYC/sliding/donation (extend `event_tickets`); capacity/inventory.
- 🆕 Refunds + cancellation→bulk-refund→waitlist auto-promote.
- 🆕 `event_posts` activity feed + `event_media` recap album + recap blast (with real per-event mute).
- 🔧 Faceted library + filtered **ICS subscription feeds**; organizer profiles.

### P2: SMS live + the unseen AI layer
- 🆕 SMS behind the `sendSms()` guard (double opt-in, STOP/HELP, quiet hours, two-way confirm) once
  10DLC approved.
- 🆕 `event_embeddings` (**384-d**) + hybrid matching (interest + social + proximity/time) powering a
  **seeded** "For You" (no empty cold-start launch).
- 🆕 AI "why you'd vibe" blurbs (Haiku, cached, read-only, deterministic fallback); resonance
  matching (regulation vs activation); connector suggestions.

### P3+: Scale & partners
- Already on Connect, so independent-host payouts are mostly a flag/onboarding story, not a
  re-platform. WhatsApp channel deferred.

---

## 8. Open decisions (need a human call)

1. **Standalone vs circle-scoped events.** Today: circle-scoped only. Allowing any member to create a
   standalone event is a deliberate scope + moderation decision.
2. **Legal entity + EIN** for the 10DLC Brand and the Connect/Stripe account (gates SMS *and*
   payouts).
3. **`event_orders` table, yes/no?** Recommendation: **no** for MVP; extend `event_tickets`
   (per-purchase row) rather than add an orders layer.
4. **Consolidate the two Stripe webhook routes** before layering more ticket logic?
5. **Default refund policy** wording per event type (suggest: full refund up to 48h prior for
   workshops/retreats; donations non-refundable).
6. **Geofence check-in for P0/P1, or QR + host-marked only** until there's a fixed venue worth
   geofencing? (PostGIS proximity already exists via the node pipeline.)

---

## Bottom line

Keep the v2 vision and its three laws: they're sound and research-backed. Throw out the
greenfield framing and the single-account / single-currency / new-check-in-table assumptions. The
real work is **extend + wire**, with one net-new high-stakes subsystem (SMS). The highest-leverage,
lowest-risk wins are **auto-calendar-on-RSVP**, **completing the 3-touch cadence**, and
**ticket tiers/PWYC on the Connect pipe**, all small deltas on top of live infrastructure.

---

## Implementation log

### 2026-06-10: Poster Events capture UI (branch `poster-event-ui`, on top of the engine)
- ✅ **Capture flow** (`app/(main)/events/scan/`: page + `creator.tsx` + `actions.ts`):
  upload/camera → on-device downscale (~1024 longest side, jpeg) → private-bucket upload
  (`{authUserId}/{uuid}.jpg`, same as the card scanner) → ONE vision call (`scanPoster`, gated by
  `aiAvailable()` + `featureOverBudget('event-poster-scan')`, paths owner-asserted, temp shots
  deleted, first shot kept as `poster_path`) → quality gate (the model's retake note + Retake /
  "Use it anyway") → client-side perspective deskew from `corners[4]` (pure canvas inverse-mapped
  homography, `lib/events/homography.ts`, + light auto-contrast; before/after toggle) → cover +
  lineup + gallery crops cut client-side from the squared image and uploaded → draft editor.
- ✅ **Crop-path convention** (`lib/events/details-media.ts`, ADR-215): crop paths ride in a
  parallel `details.media` object (`coverPath`, `lineup[i]`, `gallery[i]` keyed by row index);
  re-derived from row order on every save so indices never drift; re-validated server-side
  (owner-folder paths only).
- ✅ **Draft editor** (`app/(main)/events/drafts/[id]/`): primary fields (stacked datetime inputs
  on phones), flexible per-section rows (Lineup/Schedule/Features/Tickets/Links/Sponsors/Other,
  render-when-present, add-row + add-section, amber "Check this" chip on `confidence:'low'` rows),
  cover + lineup thumbnails via signed URLs, explicit Save, then the ownership question on publish
  ("This is my event" → host; "I found this event" → posted + claim token) with the outreach
  prompt (claim link + prewritten copy-button message) after a posted publish.
- ✅ **Drafts list** (`app/(main)/events/drafts/page.tsx`): the member's captured events as cards
  (cover thumb, date, status: Draft / Awaiting claim / Live / Claimed / Removed) with edit +
  two-tap delete (draft rows only; storage crops cleaned up). Linked from the events header
  ("My drafts") and the capture flow.
- ✅ **Claim landing** (`app/events/claim/[token]/`, PUBLIC, outside the (main) shell like
  `/join/[token]` so a signed-out organizer can see it): resolves the published unclaimed event by
  token (404 otherwise), event preview + poster credit, sign-in CTA preserving the return path,
  one-tap `claimEventAction` → event page with a success note (`?claimed=1`).
- ✅ **Event page** (`events/[slug]/page.tsx` + `components/events/poster-details.tsx`): "Posted
  by" credit (lucide `Zap`, `text-primary`) whenever `posted_by_profile_id` differs from the host,
  "Organizer not on Frequency yet" where the host normally appears on unclaimed posted events, and
  the flexible details sections below the description (Lineup grid with crop thumbs → Schedule →
  Features chips → printed-pricing block → Links (`rel=noreferrer`) → Sponsors credit line →
  Gallery strip → Other definition list), fully content-driven.
- ✅ **Capture overlay** (`components/feed/capture-launcher.tsx`): poster row's "Soon" chip
  removed; a compact "Capture an event poster" row (CalendarPlus) under the hero links to
  `/events/scan`. Rail chrome registered in `lib/layout/page-chrome.ts` (scan/drafts = Focus).
- ⏳ **Next:** Vera observer for capture nudges (separate PR); `assistEventFromText` manual-entry
  assist surface; admin remove/clawback UI for posted events.

### 2026-06-09: P0 core-loop (shipped on this branch)
- ✅ **Schema** (`20260609230000_events_p0_capacity_visibility.sql`): `events.capacity` /
  `visibility` / `category` / `energy_tag`; `event_rsvps.plus_ones` / `waitlist` status /
  `reminder_7d_sent_at`; `circles.resonance_public`. Additive, backward-compatible; RLS unchanged.
- ✅ **Capacity + waitlist** (`lib/events/capacity.ts`, `events/actions.ts`): real capacity is the
  only scarcity signal; full events route to a waitlist; freeing a seat auto-promotes the oldest
  waitlister.
- ✅ **Warm proof + one-tap calendar** (`components/events/warm-proof.tsx`, `add-to-calendar.tsx`,
  `[slug]/page.tsx`, `rsvp-button.tsx`): who's-going block with real counts (never low-as-scarcity),
  add-to-calendar promoted at the moment of RSVP (the implementation-intentions lever).
- ✅ **3-touch reminder cadence** (`api/cron/event-reminders`): added the ~1-week touch
  (7d → 24h → 2h), gentle/blameless copy, same idempotency + preference gating.
- ✅ **Library facets** (`events/page.tsx`): category · energy · has-spots; warm "filling up" /
  "waitlist" badges only when genuine.
- ✅ **Create flow** (`new/event-form.tsx`): capacity/visibility/category/energy fields on the kit +
  DAWN token cleanup.
- ⏳ **Next:** Circle Current roll-up + public-opt-in; ticket tiers/PWYC + refunds/cancellation;
  event embeddings + "For You" matching + AI blurbs; SMS channel (A2P 10DLC/TCPA).

> **Carried-over cleanup debt:** the events Index still awaits its queries inline (PAGE-FRAMEWORK §5
> wants per-section `<Suspense>`); the detail page issues one redundant going-count read (kept so
> capacity logic stays centralized in `lib/events/capacity.ts`).

### 2026-06-09: Wave 2 (shipped on this branch)
- ✅ **Circle Current** (collective gamification; shipped as "Circle Field," renamed to canon by
  migration `20260613000040`, NAMING.md/ADR-208): `circle_current_transactions` ledger + a trigger
  that owns `circles.season_current` (mirrors the zaps ledger), `reset_season()` extended to zero
  it, awarded on verified check-in for circle-scoped events, surfaced as a collaborative
  ("our circle") standing gated by `circles.resonance_public`. Never ranks circles against each
  other. (Original migration `20260610000000_circle_field.sql`; `lib/events/circle-field.ts`.)
- ✅ **Ticket tiers + PWYC** (`20260610010000_event_ticket_types.sql`, `lib/billing/tickets.ts`):
  tiers with `pricing_mode` (fixed/free/pwyc/sliding_scale/donation), server-side floor enforcement,
  per-tier inventory (`sold`/`quantity`, never oversells), `member_only`. **Backward-compatible:**
  events with a flat `price_cents` and no tiers behave exactly as before (implicit single fixed tier).
  Reuses the ADR-177 destination-charge pipe + `application_fee`; gated by `payoutsLive()`.
- ✅ **Refunds**: host `refundTicket` + `charge.refunded` webhook → status `refunded`, decrement
  `sold`, free capacity. Refund uses `reverse_transfer: true` + `refund_application_fee: true`
  (verified against Stripe Connect docs). *Known follow-up:* a `free` tier doesn't yet persist a
  claim (free events still use the normal RSVP flow).
- ✅ **Matching + AI blurbs** (`20260610020000_event_embeddings.sql`, `lib/events/embeddings.ts`,
  `matching.ts`, `lib/ai/event-blurb.ts`, `api/cron/embed-events`): 384-d event embeddings + an
  embed cron; hybrid score `0.45·interest + 0.35·social + 0.20·context`; a "For You" lane that only
  renders with real signal (cold-start safe); Haiku "why you'd vibe" blurbs built from real overlap
  only (per-day cache, read-only, degrade to null when AI is off).
- ⏳ **Still parked:** SMS channel, blocked on the legal-entity + EIN decision (gates A2P 10DLC
  registration *and* payouts). Free-tier claim persistence. Per-section `<Suspense>` on the Index.

### 2026-06-10: Post-event social · host tooling · discovery (B-2/B-3/B-4, merged)
- ✅ **Post-event social loop** (PR #498): `event_posts` activity feed, `event_media` recap album,
  `event_cohosts` (+ an `event-media` storage bucket), rendered on the event detail page.
- ✅ **Host tooling** (PR #499): `cancelEvent` now bulk-refunds every succeeded ticket and notifies
  all guests; `event_blasts` consent-gated host broadcast (in-app/push/email) with a real per-event
  mute (`event_rsvps.muted`); a Manage screen (CSV export, waitlist controls, host-marked check-in
  sharing the self check-in idempotency key). Cohosts can manage (`isEventCohost` in the editor gate).
- ✅ **Discovery polish** (PR #500): per-member ICS subscription feeds (`event_calendar_follows`),
  public crawlable organizer profiles (JSON-LD), maplibre map view, connector suggestions.
- 🔧 **Ops to make live (not yet done):** apply migrations `20260613100000` / `110000` / `120000`
  (and confirm the earlier event migrations are applied), then regenerate `database.types.ts` (after
  which the `as unknown as SupabaseClient` casts can be removed); run Supabase advisors.
- 🟢 **CI note:** the file-picker blob preview is rendered via `next/image` to avoid a CodeQL
  `js/xss-through-dom` false positive on the raw `<img>` sink.

### 2026-06-09: Audit + hardening
Full verification sweep. See [`EVENTS-AUDIT.md`](EVENTS-AUDIT.md) for the complete status checklist,
security/SEO findings, founder action items, and process suggestions.
- ✅ **Security hardening** (`20260610030000_events_security_hardening.sql`): atomic ticket inventory
  (`adjust_ticket_sold`), DB-level RSVP capacity guard (closes the client-side waitlist bypass), 2 FK
  indexes.
- ✅ **SEO/AIO** (public `/discover/events/*` only): Twitter cards, `Event` schema `image`, breadcrumb
  path fix, meta-description truncation. (In-app `/events/*` stays robots-disallowed by design.)
- ◑ **Honest gaps remain:** confirmation-on-RSVP email, cancel→bulk-refund, `event_posts`/`event_media`/
  `event_cohosts`, discovery polish, and SMS, tracked in EVENTS-AUDIT §3 with founder items in §5.
