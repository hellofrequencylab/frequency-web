# Master backlog

The single flat, actionable list of outstanding work, spanning engineering
hygiene, the audit findings, the AI fabric/webmaster, and the product verticals.

- **Vertical/roadmap detail and sequencing:** [`DEVELOPMENT-MAP.md`](DEVELOPMENT-MAP.md)
  is canonical (ROADMAP.md and BUILD-PHASES.md are superseded; kept for history).
- **Rationale / decisions:** [`DECISIONS.md`](DECISIONS.md).
- **AI work detail:** [`AI-STRATEGY.md`](AI-STRATEGY.md).

Legend: done this session (D) | left, sized S/M/L | decision needed (?) | large
greenfield initiative (G).

## A. Security and hardening
- D economy-column lock trigger, map XSS escape, open-redirect fix, gem-farm fix,
  private-reply authz, shared input sanitizer, baseline security headers.
- D email-pipeline durability (email integrity — ADR-043): Resend webhook error
  path (independent suppress vs. log, 503-to-retry/200-ack, instrumented) + outbox
  dead-letter logging/recovery (`requeueDeadLettered`/`countDeadLettered`) + handlers
  throw on malformed payloads instead of silently dropping. Schema-free.
- [ ] Run the two pending migrations (`supabase db push`): `20240304…_lock_economy_columns`
  (critical) and `20240305…_perf_indexes`. (S)
- [ ] Strict CSP with nonces on the theme/JSON-LD inline scripts. (M)
- [ ] Rate-limit `check-handle` / `search-handles` / beta; webhook replay protection. (S)
- [ ] `admin_audit_log` for role changes / suspensions / content removals (ROADMAP P7.27). (S)
- [ ] (G) RLS convergence (Phase 2, tiered — ADR-042): ~115 files bypass RLS via the
  admin client. D Tier 1 own-row/public reads migrated to the session client (the
  `lib/auth.ts` caller-identity anchor used by every authed request, plus
  `viewer-stats.ts` and `site-header.tsx`). Tier 2 cross-user aggregates (capacity
  counts, feed scope fan-out, capability resolver) need `SECURITY DEFINER` RPCs +
  policy tests — blocked on the harness (section D). Tier 3 (cron/webhooks/admin)
  stays service-role. (L)

## B. Performance and scale
- D hot-path indexes (events/rsvps/memberships), per-request auth `cache()`,
  admin-emails batched (was 200 sequential calls).
- [ ] Paginate People and Circles (unbounded scans). (M)
- [ ] `force-dynamic` -> ISR on partner/CMS pages. (S)
- [ ] Profile zap-sum via SQL aggregate. (S)
- [ ] `<img>` -> `next/image` on high-volume surfaces (51 sites). (M)
- [ ] (G) Scale ladder (Phase 4, metric-gated): Supavisor, read replicas,
  denormalized feed read-model + hybrid fan-out, table partitioning, Supabase
  Broadcast realtime, Redis/search/vector on signal. (L)

## C. Correctness / economy integrity (mostly product decisions)
- [ ] `awardZaps` auto-promotes to `luminary` past the earned gate. (?)
- [ ] Store redeem TOCTOU race. (?)
- [ ] `lifetime_gems` doubles as the spendable wallet (semantics). (?)
- [ ] Collapse the four zap-award paths into one atomic helper. (M)
- [ ] `welcome_member` achievement is unobtainable. (S)

## D. Quality / CI / test harness (AI-webmaster Layer 1 and shared prerequisite)
- [ ] Gate `tsc` + `eslint` in CI (nothing blocks merges today). (S)
- [ ] Clear lint debt: 73 `no-explicit-any`, 12 unescaped entities, 6
  set-state-in-effect, 27 unused vars; ignore build artifacts in eslint config. (S)
- [ ] Add Dependabot + CodeQL + secret scanning. (S)
- [ ] Build the vitest verification + consent (`shouldSend`) harness; this gates
  ALL agent autonomy (ADR-028). Vitest is installed with ~20 tests today. (M)

## E. AI fabric and webmaster (Sentinel) (planned; see AI-STRATEGY.md)
- [ ] AI core (`lib/ai/`): model router, prompt cache, pgvector RAG, usage ledger
  + caps + kill switch, governance kernel. (M)
- [ ] Member surfaces in order: support bot, encouragement, host copilot,
  calendar, mentor, program management. (M-L)
- [ ] **Vera — the resident AI guide (ADR-049 / AI-VERA.md).** Persistent persona
  debuting as the onboarding concierge (ADR-047 Phase 2), with per-member memory
  (summary + facts off `engagement_events`), bounded tools, and a pluggable persona
  registry. Rides on the AI core + consent harness (ADR-028); deterministic tour is
  the fallback. (L)
- [ ] Sentinel Layer 2: scheduled sweeps via Agent SDK + scoped GitHub App,
  findings ledger, autonomy tiers (gated on D). (M)

## F. Engagement / gamification / practices / programs
- [ ] **Progressive onboarding (ADR-047 / ONBOARDING.md).** Phase 0: decouple the blocking
  `/onboarding` gate (lazy profile capture). Phase 1: interaction-paced coachmark tour
  driven by a declarative tip registry + `profiles.meta.tour` (no migration); folds in the
  "welcome new members in the feed" moment; emits `engagement_events` for the activation
  funnel. Phase 2 (later): AI concierge on the AI core (ADR-028/041). (M; Phase 2 = L)
- [ ] Reward amount-edit UI + member-facing season banner/countdown. (S)
- [ ] `practice.verified` host/peer verification layers. (M)
- [ ] Device attestation + mutual-confirm (P2P) verifiers for captures. (M)
- [ ] Repeatable-node idempotency keying for captures. (S)
- [ ] Realtime reward feedback via Supabase Broadcast (cross-device). (M)
- [ ] Programs content depth (only 4 seed frameworks). (M)
- [ ] Program-as-template "Add to Circle" instantiation (sets adopter as host). (M)
- [ ] Cohort / acquisition-source analytics. (M)

## G. Circles / hierarchy / discovery / IA
- [ ] Circle-discovery visual map layer (proximity list shipped). (M)
- [ ] Member directory filters (`/people` is a flat list). (M)
- [ ] Hub/Nexus-scoped events (confirm `events.scope_type`). (M)
- [ ] Multi-topic circles (one `topical_channel_id` today). (M)
- [ ] Growth-loop UX ("nearly full -> seed a new circle") + circle lineage. (M)
- [ ] Milestone "wake-up" gating map (declarative role+milestone unlocks). (M/L)
- [ ] (G) Density / demand read-model (PostGIS) for expansion + grant story. (L)
- [ ] Soften the newcomer Region->Outpost->Nexus->Hub breadcrumb. (S)

## H. Messaging / social graph
- [ ] Friend suggestions ("people in your circle you haven't met"). (M)
- [ ] (G) Two-way Inbox / member message replies. (L)
- [ ] (G) Postgres-backed sync engine pilot (PowerSync/Electric/Zero) on messaging
  or feed for instant/offline UI. (L)

## I. CRM / comms / lifecycle / live agent
- [ ] (G) Live Claude operator replacing the deterministic stub (`lib/studio/agent.ts`)
  + bounded tools/caps/audit (ADR-028; this is the CRM half of the AI fabric). (L)
- [ ] Notification router/registry (event -> category -> channels -> template),
  make `engagement_events` truly multi-subscriber. (M)
- [ ] **First-party analytics + admin dashboard (ADR-050 / ANALYTICS.md).** Canonical
  event taxonomy via a single dual-emit `track()` helper (writes `engagement_events`
  + fires GA4 custom events); Studio admin dashboard (activation funnel, WAM/retention,
  community health, GA acquisition via the GA Data API). First-party is the source of
  truth; GA4 owns acquisition. (M)
- [ ] Migrate inline email/push send-sites onto the outbox queue with
  `SELECT … FOR UPDATE SKIP LOCKED`. (M)
- [ ] **Verify `frequencylocal.com` in Resend (blocking for volume — ADR-046).** Transactional
  mail sends via Resend, a separate path from Workspace mail; with DMARC now at `p=quarantine`,
  Resend mail is quarantined until the domain is verified in Resend (its own DKIM + SPF).
  Use a dedicated `send.` subdomain to isolate bulk reputation from the human-mail apex, then
  set `EMAIL_FROM` to that sender. (S)
- [ ] Deliverability hardening (subdomain reputation isolation, open/click analytics). (M)
- [ ] Richer Studio engine: segment builder, pipelines (Kanban), drip sequences,
  React Email templates, non-member unsubscribe. (L)
- [ ] `engagement_score` projection off the backbone + `email_events`. (S)
- [ ] Funnel conversion + acquisition source + cohort retention analytics. (M)
- [ ] Semantic search across dispatches/posts + AI digest summarizer. (M)

## J. CMS / page framework / marketing / SEO
- [ ] Submit sitemap to Google/Bing + set `NEXT_PUBLIC_SITE_URL` (supersedes the
  custom-domain half of ROADMAP P3.31; the domain is already live). (S)
- [ ] Domain setup: point `frequencylocal.com` (GoDaddy -> Vercel) at the apex,
  301 the retired `go.findafreq.com`, update auth/OAuth redirect URLs. (S)
- [ ] Page-editor polish: visual focal-point/crop picker; `page_revisions` rollback. (S)
- [ ] Per-Nexus subdomains (`encinitas.frequencylocal.com`). (M)
- [ ] Formal module/widget slot registry + fully scope-aware right rail. (M)
- [ ] Reconcile "Interests" (member) vs "Topics" (public) wording + the "tune in" verb. (S)

## K. Monetization / money foundation / Vault / verticals
- [ ] (G) Money foundation: entity partition + entity-tagged `financial_transactions`
  ledger (ADR-029/032). Gates every revenue vertical. (L)
- [ ] (G) Stripe Connect dual rails (`create_checkout`/`process_payout`/`record_commission`). (L)
- [ ] (G) Freemium / Vault / membership cash-in (ADR-037) + `/upgrade` + `/settings/billing`. (L)
- [ ] Persona axis `profile_personas` (verification + Connect binding, ADR-030). (M)
- [ ] Module registry formalized so verticals self-declare (ADR-033). (M)
- [ ] Subscription-as-bridge entitlement (ADR-035) + store seams (digital/physical,
  reviews/disputes). (M)
- [ ] (G) Verticals: The Collective (first commerce, D1), Local Marketplace (free,
  Stage B), Lab Spaces (D5). (L each)
- [ ] Affiliate referral -> commission -> payout ledger. (M)
- [ ] Donations and Grants rail (Foundation, one-time + recurring; "Support Us"). (M)
- [ ] Inter-entity Lab bridge (ADR-038; mostly legal). (M)
- [ ] Physical merch fulfillment (`store_items` physical flag + shipping flow). (M)

## L. Mobile / capabilities / API
- [ ] (G) Mobile app (Expo/RN) on the shared contract; native QR/NFC/geofence/push.
  The intended primary doorway; nothing built yet. (L)
- [ ] Expose view-model RPCs over a typed endpoint both web and mobile call. (M)
- [ ] Decide mobile stack details / contract transport. (?)

## M. Moderation / safety / trust
- [ ] Content-type-agnostic moderation (generalize `reports.target_type`, ADR-036). (M)
- [ ] Ratings / reviews / disputes for paid offerings. (M)
- [ ] Crew task-volunteering UI inline on circle pages (`crew_tasks` is a catalog today). (M)

## N. Teaser gate / access tiers
- [ ] Extend the teaser gate to event/interest/best-practice pages; flip
  `TEASER_GATE_ENABLED` on at paid launch. (S)
- [ ] Capability resolver gains tier/entitlement input (free vs entitled sets, ADR-037). (M)
- [ ] Website Membership tiers horizontal (resolver input + `/upgrade`). (M)

## O. Docs / config / decisions
- [ ] Production env config: `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`.
- [ ] Doc fixes: em-dash sweep (23 files, the rule is violated in AGENTS.md too);
  ADR range "029->036" -> "029->040" in 5 docs; ARCHITECTURE route-group map adds
  `(studio)`/`(help)`/`(marketing)`. Add `NEXT_PUBLIC_APP_URL` and
  `NEXT_PUBLIC_SITE_URL` to `.env.example`.
- [ ] Doc-vs-code discrepancies to reconcile: partner redemption-on-capture IS
  built (`lib/engagement/capture.ts`) yet DEVELOPMENT-MAP / BUILD-PHASES list it
  outstanding (only the discount application may remain); the PAGE-EDITOR-SPEC
  "spec only" banner contradicts its "all phases shipped" section.
- [ ] (?) Open legal decisions blocking the money verticals: which entity sells the
  paid tier; dues vs donation / deductibility / UBIT; inter-entity bridge
  mechanism; marketplace in-app payment; web's role post-mobile.

## P. Session follow-ups (2026-06-04 build sprint) — onboarding, economy, Journeys

Loose ends + next steps from the onboarding/economy/Journeys sprint. Audit verified
tsc + eslint + 153/170 tests green and no broken refs after the rollbacks/renames.

### Cleanup — ✅ done 2026-06-04
- [x] **Consolidated the two crew-gating components** into one `UpgradeLightbox`
  module (`CrewGate` overlay + `CrewGateButton` inline, one shared "Unlock the full
  game" lightbox). Deleted `components/crew-gate-button.tsx`.
- [x] **Deleted orphaned `app/onboarding/beta/welcome.tsx`.**
- [x] **Resolved `/onboarding/vera`:** kept as a no-JS / deep-link fallback to the
  concierge (the feed lightbox stays primary). Documented in ADR-086.
- [x] **Codified the "always reachable" doctrine** in AI-VERA.md (§1 + §3 rule).

### Vera — dialed (ADR-086); ⏳ launcher pending
- [x] **Voice + depth dial-in.** Rewrote `buildSystemPrompt` to attune-first / guided
  multi-turn / always-nudge-to-action; warmed the default greeting + lightbox framing;
  rebalanced the §3 doctrine rules.
- [ ] ⏳ **Persistent companion launcher** (AI-VERA §4.0) — one docked Vera on every
  member page that opens her conversational chat, **unifying the floating help launcher**
  (search → grounded answer → human) into her panel so there's one bubble, not two.
  Reuse the concierge chat via a shared `<VeraChat>` extracted from the lightbox;
  decouple from the feed-specific close/redirect. (M)
- [ ] **Live-loop suggestion chips.** The live Claude loop returns empty `suggestions[]`;
  have Vera surface 1–3 quick-reply chips per turn to keep guided depth flowing. (S)

### Specced, awaiting build (Launch-gated; dormant while Beta = Crew)
- [ ] **Beta Activation** (BETA-ACTIVATION.md): profile-completion card; "Founder's
  First Week" event-derived tasks + badge; Vera coach next-best-action. (M)
- [ ] **Economy gating** (ECONOMY-AND-JOURNEYS.md / ADR-084): member Zaps at a lower
  multiplier; Journey "Start" gated to Crew; endorsement suppression on free profiles;
  gem-spend lock for unpaid (needs the entitlement input on the capability resolver,
  ADR-037) + the `BETA_MEMBERS_GET_CREW` flip. (M-L)
- [ ] **Seasonal Journeys**: link `journey_chains` to a season + a Pillar (Mind/Body/
  Spirit/Expression); ship 4 primary tracks + bonus micro-journeys per season; an
  authoring surface. Open decisions: member rank display (inert Ghost vs none),
  endorsement set, who authors. (M)

### Known limitations (note, not urgent)
- Deferred beta sign-in via a magic link opened on a *different device* loses the
  browser-local stash (cookie + localStorage) → that visitor restarts induction.
  Same-browser + Google OAuth are seamless. Server-side stash keyed to email would
  fix it if it matters. (S)
- CRM resolves member emails via `auth.admin.listUsers` (one call; fine at Beta scale).
  Switch to a keyed lookup if the roster grows large. (S)

### Docs hygiene
- [ ] Update CHANGELOG.md + DEVELOPMENT-MAP.md to reflect the sprint's directions
  (Beta = Crew, the member economy/Journeys model, member contact card, the nav
  restructure). (S)

## Q. Smart creation + open vitality library (feature sprint, 2026-06-04)

Three interlocking features, assessed via parallel design agents. They chain: the
**Wizard** builds **Journey plans**, plans are organized by the **4 Pillars** (= the
`domains` table — Mind/Body/Spirit/Expression, with per-pillar `accent` colors), and
the graduated feed **Journey board** showcases them. Add an ADR per cluster on build.

### ✅ Shipped — Feed hero (onboarding guide → Journey board)
- [x] One hero slot in `feed/page.tsx`, one truth source (`lib/onboarding/status.ts`):
  a persistent **teal (`signal`)** onboarding guide that no longer vanishes at first
  circle-join — it advances through the steps and only graduates once activation is
  complete, then becomes the `JourneyBoard` (streak + today's move + resource center).
  Retired `FeedWelcome` + the redundant sidebar Getting-started checklist.
- [x] **JourneyBoard pillar-balance** — a calm 4-pillar coverage read from the
  member's adopted practices. (Active Journey plan + suggested plan land with Q1 P1.)

### ✅ Naming decided (ADR-087) — Journeys = open library; engine → Quests
The member-facing **"Journeys"** is the open, free, user-built library. The gamified
tracked engine was renamed **"Quests"** (`journey_chains → quest_chains`, `/crew/quests`,
nav key `quests`). The `journey_*` table namespace is now free for the open library.

### Q1. Open vitality library — user-built Journey plans (FREE; rides the practice loop)
Reconciliation (ADR needed): the open library is **curation over the always-free
practice substrate**; the Crew gate stays only on the tracked/gamified engine
(`journey_chains`). Corrects ECONOMY-AND-JOURNEYS §5 ("members can't build one" → can't
build a *tracked* Journey; DIY practice-combo plans are open). Separate
`journey_plans` tables — do **not** overload the gated engine.
- [x] **Phase 0** — `practices.domain_id` → the 4 Pillars (migration + backfill);
  `lib/pillars.ts`; URL-driven pillar **filter** + **badges** on `/practices`; the
  board's pillar-balance read. ✅ shipped.
- [ ] **Phase 1** — `journey_plans` + `journey_plan_items` + RLS; `lib/journey-plans.ts`;
  private plan builder (pick practices → grouped by pillar → reorder → notes). (M)
- [ ] **Phase 2** — publish + open library browse (`/library`, pillar filter, coverage +
  adopt-count chips). (M)
- [ ] **Phase 3** — adopt a plan = bulk-adopt its practices into `member_practices`
  (reuse `adoptPractice`; NO new run engine; honors "streaks stay free"). (S)
- [ ] **Phase 4** — fork/remix + attribution (`fork_of`, `forked_count`). (S)
- [ ] **Phase 5** — host moderation + optional "promote a community plan to a tracked
  Journey/Quest". (M)

### Q2. Create Wizard — section-aware, Vera-light, network suggestions
**Wrap, don't replace** the existing `CreateModal` + per-section server actions via a
typed registry. Vera stays **read-only** (suggests structure/prompts, never authors —
reuse the propose-and-confirm invariant). Suggestions aggregate existing reads (my
circles, practices, nearby, friends, Vera facts) — no new queries.
- [ ] **Phase 0** — `lib/create/{types,registry}.ts` + `CreateWizard` wrapper for two
  kinds (event, circle), behind a flag; old composers untouched. (M)
- [ ] **Phase 1** — suggestion rail (zero AI) for event + circle. (S)
- [ ] **Phase 2** — light Vera lane (`/api/create/vera` wrapping `runVeraClaudeTurn` +
  read tools `suggest_template` / `related_practices`). (M)
- [ ] **Phase 3** — roll across post/broadcast/channel/practice; revive the global
  Create button in the app shell. (M)
- [ ] **Phase 4** — NEW create paths for `program` + `journey` (new actions + RLS); the
  Q1 plan builder plugs in here as a wizard kind. (M)

**Risks tracked:** two event-create paths to reconcile; role gating stays the
server-side action's job (wizard gating is UX only); the feed composer stays the fast
inline path (wizard is an optional guided alt); RLS isolation between `journey_plans`
(open) and `journey_chains` (gated) — run Supabase advisors after the migration.

## R. UI polish + profile depth (2026-06-04)

### ✅ Vera cue — fixed + redesigned
- [x] **Bug:** cues for already-done tasks suppressed (the "add a photo" prompt to a
  member who has one). Tips carry a `satisfiedKey`; `selectTip` filters on the
  member's completed steps (from `getOnboardingStatus`).
- [x] **Redesign** (`tour-provider.tsx`): skinnier chat-window width, pop-in animation,
  **content-anchored** (`data-tour-anchor` on the avatar + main region, viewport-
  clamped), and **self-receding** — fades to neutral after 5s idle, restored on mouse
  move/hover. One primary action + always-there dismiss.

### Profile page
- [ ] **Header (cover) photo** — make the profile banner an uploadable/editable cover
  image (mirror the avatar upload path + storage bucket). (M)
- [ ] **Richer profile header** — more personal info (location · joined · bio line) +
  **subtle** community-engagement stats (circles · practices logged · streak) woven
  into the header, understated, not a gamified wall. (M)

### Design system
- [ ] **Unify pill/button radius site-wide.** No shared `Button`/`Badge` primitive
  today; radii are inline and inconsistent (`rounded-lg` ×346 · `-full` ×223 · `-2xl`
  ×215 · `-xl` ×151 · `-md` ×88). Decide canonical radii (e.g. interactive buttons =
  `rounded-lg`; status pills = `rounded-full`), introduce shared `<Button>`/`<Badge>`
  primitives, then migrate incrementally. Needs the primitive first — bigger than a
  find-replace. (M)

## Accepted (no action)
- `npm audit`: 4 moderate transitive advisories (postcss in Next's toolchain,
  uuid in `@measured/puck`). The only fix downgrades Next to 9.x; not worth it.

---

## Rollout summary

About 70 line items remain. They cluster into three greenfield mega-initiatives
(Money foundation + Vault in K, Mobile in L, RLS convergence in A) plus the AI
fabric/webmaster (D/E/I), which all share one critical path:

> CI gates + test/consent harness (D) -> RLS convergence (A) -> money foundation
> (K) -> then verticals, mobile, and the live agent/webmaster graduate to autonomy.

**Top strategic initiatives (G):** money foundation, freemium/Vault, mobile, The
Collective, RLS convergence, live agent, persona axis, marketplace, density
read-model, scale ladder.

**Near-term unblockers (small, launch-gating):** run the two migrations; apex
cutover + prod env config; submit the sitemap; the `shouldSend` consent test.

## Production deploy checklist (env vars)
- `CRON_SECRET` (required in production; cron endpoints reject without it).
- `UNSUBSCRIBE_SECRET` (required; HMAC signing for unsubscribe links).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (web push).
- `NEXT_PUBLIC_SITE_URL` (drives metadata, sitemap, robots, JSON-LD; the
  `lib/site.ts` fallback is a Vercel preview URL, so this must be set in prod).
- `NEXT_PUBLIC_APP_URL` (canonical app URL used by email/digest/ICS/auth redirects;
  falls back to `frequencylocal.com` in several server paths today).
- `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`.
- Supabase URL / anon key / service-role key.
