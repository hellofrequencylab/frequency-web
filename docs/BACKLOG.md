# Master backlog

> ⚠️ **Stale — superseded (2026-06-15).** This list trails reality (many §A–§F items are
> already shipped). The current master list is **[`BUILD-LIST.md`](BUILD-LIST.md)**, and the
> reconciled, audited view (docs-vs-code, with grades + valuation) is
> **[`AUDIT-2026-06-15.md`](AUDIT-2026-06-15.md) §9**. Treat those two as canonical; keep this
> file only for historical context until it is retired.

The single flat, actionable list of outstanding work, spanning engineering
hygiene, the audit findings, the AI fabric/webmaster, and the product verticals.

- **Vertical/roadmap detail and sequencing:** [`DEVELOPMENT-MAP.md`](DEVELOPMENT-MAP.md)
  is canonical (ROADMAP.md and BUILD-PHASES.md are superseded; kept for history).
- **Rationale / decisions:** [`DECISIONS.md`](DECISIONS.md).
- **AI work detail:** [`AI-STRATEGY.md`](AI-STRATEGY.md).

Legend: done this session (D) | left, sized S/M/L | decision needed (?) | large
greenfield initiative (G).

## ▶ Now — prioritized queue (2026-06-06)

The current build order for the progress / streak / disclosure arc and the practice-engine
follow-ups it surfaced. Full detail lives in the lettered sections below — this is the ranking.

**P0 — ✅ DONE (2026-06-06, ADR-152): The Quest → Seasonal Quest → Journeys → Practices (all free).**
1. **S1 · Quest/Journey hierarchy — ✅ COMPLETE & LIVE.** A · paywall gone, "Quests" restored.
   B1 · `quests` table + `journey_plans.quest_id`/`official` + seed (migration `20260608010000`
   **applied to prod**, types regenerated; verified: Season 1 Quest + 4 official Pillar Journeys).
   B2 · `/crew/quests` lists the Seasonal Quest → its Journeys (`lib/quests.ts`). B3 · legacy
   action-chain engine retired in code + GLOSSARY/THE-QUEST/DATABASE terminology pass. *Only loose
   end → §S1b:* physically drop the dormant `quest_*` tables once `quest_outcomes()` + its
   analytics surface are retired.

**P1 — finish the shipped arc (ready, high value, low risk)**
2. **Stage-driven disclosure → crew dashboard + surfaces** *(§F, ADR-146)* — the spine is
   built; apply the `stageIndex` gate beyond the home feed. (M)
3. **Wire the login / activity streak** *(§F)* — tiny; completes "showing up = a streak". (S)
4. **Daily-streak achievement badges** *(§F)* — small; completes the streak loop (zaps already pay). (S)

**P2 — depth + integrity (M; the journey items gated on P0)**
5. **`practice.verified` host/peer verification layers** *(§F)*. (M)
6. **Seasonal Journey authoring surface** *(§Q)* — tracks are seeded; no editor yet. (M)
7. **Community library moderation + promote-to-tracked plan** *(§Q Phase 5)*. (M)

**P3 — Content + on-page page settings (2026-06-15, owner ask)**
8. **Content Studio page (G/L)** — one surface to *add and edit all content* (practices,
   Journeys, challenges, seasons, posts, marketing pages…), evolving `/admin/content` from a
   curation dashboard into a full create/edit hub. Base it on the Studio shell
   (`components/studio/*`, ADR-142) so authoring feels identical everywhere.
9. **Activate the three on-page Page-settings functions** — ✅ **all three live (2026-06-15).** Were
   staged "Next" rows in the on-page Page panel (`components/admin/page-settings/page-settings-module.tsx`,
   `lib/page-settings/sections.ts`); each now works on a shared `page_settings` per-route store:
   - **SEO & meta (M)** — ✅ **done (ADR-268).** Store + `proxy.ts` (Next 16 renamed `middleware`→`proxy`)
     injecting `x-pathname` + a `(main)` layout `generateMetadata`. Honest caveat: member routes are
     auth-gated, so the real payoff is per-route browser tab titles, not crawlable SEO (public
     SEO already lives in the Puck editor).
   - **Status & visibility (M)** — ✅ **done (ADR-269).** Per-route draft/published + lowest role to reach
     it; enforced **fail-safe** in `(main)/layout.tsx` (default published, never lock out staff, `/feed`
     never loops). Complements `/admin/menu` (which gates nav items) by gating the page itself.
   - **Layout (L)** — ✅ **done (2026-06-15, ADR-270).** The per-route module-assignment engine:
     `page_settings.layout` jsonb `{order,hidden}` merged over a registry default, a metadata/registry
     split (`lib/widgets/{modules.ts,registry.tsx}`) so the editor + pure resolver never import RSCs,
     `<PageModules route>` rendering each module in its own `<Suspense>`, staff-gated writes, and the
     on-page `LayoutEditor` now driving it (the "Layout" section is `live`). Piloted on `/lead`; build
     out across routes from there. **Extended (ADR-271):** a **scope cascade** (per-page → per-section
     `/seg/*` → global `*`, most-specific wins) and a **per-module role gate** (show a module to a
     community rung and up; view-as-aware, fail-closed), both inside the same `layout` jsonb.
   - **Content page strip-down first (S→M)** — `/admin/content` is currently a mess; strip it to
     its primary functions, then build the "add/edit all content" Studio out from there.
10. **Leadership section (rename `/lead` → "Leadership") (M→L, owner ask 2026-06-15)** — the
    community-leader surface for volunteer **Crew · Hosts · Guides · Mentors** to manage *their*
    community (distinct from the staff `/admin` workspace; `requireLeadFloor`, host+). Build a
    dashboard: the **Circles they host**, the **networks under them** (hubs/nexuses they steward),
    and **Crew tasks** (internal volunteer tasks that support their circles). **Move** Leader
    Training (`/training`) and Crew Tasks under Leadership. Rename the nav label Lead → Leadership.

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
- [ ] **Online actions (comment/react) award zaps instead of gems (live bug).** Reported from prod:
  a comment + like paid **3 zaps**. The app pays this correctly as gems (`feed/actions.ts` →
  `awardGems('comment_reply' / 'reaction')`); the stray zaps come from the **achievement-unlock DB
  trigger** firing when the action unlocks an *online* achievement — the "long-standing double-award
  (gems in code + zaps in the trigger)" called out in `20260607040000_zap_ledger_and_recategorize.sql`.
  **Fix already authored, just unapplied:** that migration makes `after_achievement_unlocked()` stop
  paying zaps (online achievements pay gems via the app layer, ADR-139). **Action: apply
  `20260607040000` to prod** + spot-check no other trigger pays zaps on `post_reactions`/replies. (S)
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
- [ ] **Quest pipeline + sponsor-backed rewards (ADR-156a / ADR-155).** A member's contacts are
  their personal CRM **and** their Quest *sales pipeline*: invites → signups → conversions earn
  escalating rewards, ultimately **sponsor-backed real-life** ones ("the more you give the
  community, the more you're rewarded"). Reward the real outcome (a confirmed signup), idempotent +
  consent-gated (ADR-099/154); never reward a row. Surfaces a pipeline view over `network_contacts`
  status + the referral plumbing. Build after Capture's mobile centre-nav lands. (L)
- [ ] **Doomscroll mode — the named release valve (ADR-155).** A member-toggled mode that strips
  the entire activation prompt layer (chores pill, Vera coach full-stops, task nudges) and shows
  **only content**. One preference flag (`profiles.meta`) the app shell reads to suppress the prompt
  layer; the feed itself is unchanged. The point is the brand statement — making "just scroll" an
  honest, named choice proves we don't optimize for dwell-time. Not launch-blocking. (S)
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
- [ ] **Stage-driven disclosure → crew dashboard + other surfaces** (ADR-146). The home feed
  now reveals by member stage; extend the same `stageIndex` gate (from `getMemberProgress`)
  to the crew dashboard, profile, and rails so the whole product opens up as a member climbs.
  The spine is built — this is applying it. (M)
- [x] **Wire the login / activity streak — ✅ done.** A daily check-in (`app/(main)/checkin-actions.ts`
  + `components/daily-check-in.tsx`, mounted in the shell) fires on the first authenticated visit each
  day: pays the `daily_login` gems + ticks the `login` streak, idempotent via
  `profiles.meta.daily_checkin_date`, with a "welcome back" toast. *Tweaks:* local-timezone day
  boundary (UTC today); a prominent streak counter in the shell; reuse the shared toast system.
- [ ] **Daily-streak achievement badges.** The catalog's streak badges are still the weekly
  `attendance` ones; add badges for the daily practice streak (3/7/30/100/365) so those
  milestone moments also live in the Vault. Milestone *zaps* already pay (ADR-145). (S)

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
- [ ] **Site Navigation — a full menu-management admin suite (under Platform).** Today the nav is
  code-driven (`lib/nav-areas.ts` `NAV_AREAS` + `lib/layout/page-chrome.ts`). Add a **Site Navigation**
  item under the **Platform** admin section (janitor) that makes the menu + site structure
  **data-driven and editable**: a tree/drag editor for nav areas, sections, items, ordering, labels,
  icons, and per-item access. **Moving a page reassigns its links and the surrounding site structure**
  (the nav entry, breadcrumbs, the page-chrome rail registration, and any internal links/redirects
  follow the move — no dead links). Needs a `nav_structure` schema (DB-backed, seeded from the current
  `NAV_AREAS` so nothing regresses), a resolver that reads DB-or-code, and the editor surface composed
  from the page framework. Tie-ins: roles/permissions (per-item access), the page-editor/CMS,
  `page-chrome` (rail), and redirects on move. (L)
- [ ] Submit sitemap to Google/Bing + set `NEXT_PUBLIC_SITE_URL` (supersedes the
  custom-domain half of ROADMAP P3.31; the domain is already live). (S)
- [ ] Domain setup: point `frequencylocal.com` (GoDaddy -> Vercel) at the apex,
  301 the retired `go.findafreq.com`, update auth/OAuth redirect URLs. (S)
- [ ] Page-editor polish: visual focal-point/crop picker; `page_revisions` rollback. (S)
- [ ] Per-Nexus subdomains (`encinitas.frequencylocal.com`). (M)
- [ ] Formal module/widget slot registry + fully scope-aware right rail. (M) *(Mostly landed:
  the per-route module-assignment engine — metadata/registry split + resolver + on-page editor —
  shipped 2026-06-15, ADR-270; the **scope cascade** (route → `/seg/*` → global) and **per-module
  role gate** shipped 2026-06-15, ADR-271; the interior **slot** model — assignable areas within
  the container, via 4 interior templates — shipped 2026-06-15, ADR-272. **Still open: the
  shell-rail half** (the app right rail stays operator-managed in `page_chrome_overrides`).)*
- [x] **Interior container templates + slot-assignable widget blocks (owner ask 2026-06-15) — ✅
  done (2026-06-15, ADR-272).** Four interior-container templates (Single · Main + side · 2
  columns · 3 columns); widget blocks (the ADR-270 modules) assignable to different **areas/slots**
  within the chosen template — the layout engine's `{order, hidden, roles}` extended to a per-slot
  `{template, slots}` model behind a back-compat reader (no migration). Built on ADR-270/271.
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
`pillars` table — Mind/Body/Spirit/Expression, with per-pillar `accent` colors), and
the graduated feed **Journey board** showcases them. Add an ADR per cluster on build.

### ✅ Shipped — Feed hero (onboarding guide → Journey board)
- [x] One hero slot in `feed/page.tsx`, one truth source (`lib/onboarding/status.ts`):
  a persistent **teal (`signal`)** onboarding guide that no longer vanishes at first
  circle-join — it advances through the steps and only graduates once activation is
  complete, then becomes the `JourneyBoard` (streak + today's move + resource center).
  Retired `FeedWelcome` + the redundant sidebar Getting-started checklist.
- [x] **JourneyBoard pillar-balance** — a calm 4-pillar coverage read from the
  member's adopted practices.
- [x] **Active Journey on the board + Dashboard tab (2026-06-06, ADR-144)** — the adopted
  Journey's current step shows on the home `JourneyBoard`; full cadence-based progress
  (derived from the practice log) + a gamification panel + circle companions live on
  `/crew/journey`. (`lib/journey-plans.ts:getActiveJourneyProgress`; see
  ECONOMY-AND-JOURNEYS.) Suggested-plan still rides with Q1 P1.

### ✅ Naming decided (ADR-087) — Journeys = open library; engine → Quests
The member-facing **"Journeys"** is the open, free, user-built library. The gamified
tracked engine was renamed **"Quests"** (the legacy action-chain engine, since dropped — ADR-152;
`/crew/quests`, nav key `quests`). The `journey_*` table namespace is now free for the open library.

### Q1. Open vitality library — user-built Journey plans (FREE; rides the practice loop)
Reconciliation (ADR needed): the open library is **curation over the always-free
practice substrate**; the Crew gate stays only on the tracked/gamified engine
(`journey_chains`). Corrects ECONOMY-AND-JOURNEYS §5 ("members can't build one" → can't
build a *tracked* Journey; DIY practice-combo plans are open). Separate
`journey_plans` tables — do **not** overload the gated engine.
- [x] **Phase 0** — `practices.domain_id` → the 4 Pillars (migration + backfill);
  `lib/pillars.ts`; URL-driven pillar **filter** + **badges** on `/practices`; the
  board's pillar-balance read. ✅ shipped.
- [x] **Phase 1** — `journey_plans` + `journey_plan_items` + RLS; `lib/journey-plans.ts`;
  builder at `/journeys/[slug]` (pick practices grouped by pillar, pillar coverage,
  add/remove, publish). Nav: Journeys in Community. ✅ shipped.
- [x] **Phase 2** — publish + open library browse at `/journeys` (your plans + community
  library; visibility badges). ✅ shipped.
- [x] **Phase 3** — adopt a plan = bulk-adopt its practices into `member_practices`
  (reuse `adoptPractice`; no new run engine; honors "streaks stay free"). ✅ shipped.
- [x] **Phase 4** — fork/remix + attribution (`fork_of`, `forked_count`, `adopt_count`).
  ✅ shipped.
- [ ] **Phase 5** — host moderation + optional "promote a community plan to a tracked
  Journey/Quest"; pillar filter + adopt-count chips on the library; reorder-by-drag;
  cover images; the JourneyBoard "active plan" block. (M)

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
- [x] **Header (cover) photo** — ✅ shipped 2026-06-05 (§T): `profiles.header_image_url`,
  an uploader in Settings → Profile (cover-crop 3:1 to the avatars bucket), rendered on
  the profile cover band. *(Wave 2 (§U): drag-to-reposition + zoom crop, taller banner.)*
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

## S. Site changes batch (2026-06-05, live screenshot review)

> **Shipped 2026-06-05:** S1 (unified — nav/route/dock; marketing+admin labels still
> to sweep), S2 ✅, S5 ✅, S3 ✅ token + dispatch card (other broadcast surfaces to
> sweep). **Onboarding box** (owner follow-up): azure re-skin, minimize-no-dismiss,
> progress ring + stepper, obscured force-complete, graduates to the tracker — ✅.
> **Still open:** S4 (demo box), S6 (tiered post options), broadcast-surface + label sweeps.

- [~] **S1 · Quest/Journey hierarchy** — ✅ *decided + Phase A shipped (ADR-152, 2026-06-06):*
  **The Quest → Seasonal Quest → Journeys → Practices**, all **free**. (ADR-152 supersedes
  ADR-150's brief "one concept" detour — Quests and Journeys are *distinct nested levels*.) Phase A
  removed the paywall everywhere and restored **"Quests"** as the seasonal container surface
  (`/crew/quests`). **B1 ✅ shipped** — `quests` table + `journey_plans.quest_id`/`official` + a
  seed (active season's Quest + one official Journey per Pillar, ≤3 practices each); migration
  `20260608010000` **applied to prod + types regenerated** (verified live). **B2 ✅ shipped** — `/crew/quests` lists the
  Seasonal Quest → its official Journeys (each → the Journey detail's practices + free Adopt);
  `lib/quests.ts` reads defensively. **B3 ✅ shipped** — legacy action-chain engine retired in
  code: `advanceQuests` + `isArcStepRelevant` + `chainCurrency` removed from `lib/achievements.ts`,
  the old `getQuestsData`/`startQuest`/`start-quest-button` deleted, the `Arc*` types dropped, and
  the sidebar "current track" repointed to the active Journey. Terminology pass: GLOSSARY /
  THE-QUEST / DATABASE updated to the hierarchy. *(Naming stable — no more renames.)*
- [ ] **S1b · Drop the dormant `quest_*` tables** — the legacy action-chain engine's tables (dropped, ADR-152)
  are now unused by app code (engine retired in B3) but still exist. Drop them once the
  `quest_outcomes()` analytics RPC + its `/admin` outcomes surface (`lib/analytics/outcomes.ts`)
  are retired and `lib/database.types.ts` is regenerated. (S)
- [ ] **S2 · Streak box: half-height when collapsed** — tighten `PracticePrompt` collapsed state. (S)
- [ ] **S3 · Broadcast color → light blue** — introduce a `broadcast` blue token (complements the
  site orange) and apply to dispatch/broadcast surfaces (currently the teal `signal`). No hardcoded
  hex (PRESENTATION.md). (S–M)
- [ ] **S4 · Evolve the "Beta Demo Content" box** — small links *directly to actions* with the
  **point attribution shown** (e.g. "Make a friend +X⚡ · Join a circle +Y⚡ · Log a practice +Z⚡").
  Turns the notice into an activation nudge. (M)
- [ ] **S5 · Composer "Announce" → "Dispatch"** — relabel + subtitle "Send an announcement to your
  group." (S)
- [ ] **S6 · Tiered post options in the composer** — expand the create options by role tier:
  - **Everyone:** Post (text+media) · Poll · Ask (a question that invites answers, optionally
    tagged to a Channel) · Practice/Journey share ("showed up") · *(later)* Offer/Request (local
    marketplace).
  - **Host (Circle):** Dispatch→Circle · Set Circle Practice · Event→Circle · Pin.
  - **Guide:** Dispatch→Hub. **Mentor:** Dispatch→Nexus. **Staff:** Dispatch→Global · Feature a post.
  - The composer shows base options for all + a **Dispatch with a scope picker limited to the tiers
    you lead** + leader extras. Ties into comms Phase D (dispatch UI) + the Create Wizard (§Q2). (M–L)
- [ ] **S7 · Uniform right rail on every interior page** 🔴 *site-wide structural rule (owner, screenshot
  review).* Any Circle, Event, or interior/detail page MUST carry a right-hand menu/rail — the same
  two-column shell everywhere (main content + right rail of contextual modules). The Circle page is the
  reference (Circle events + Members). Audit every interior route (Circles ✅, Events, Channels, Practices,
  Journeys, Programs, Profile, Hub/Nexus, Messages detail, etc.) and give each a right rail with the
  relevant context (related items, members/attendees, actions, "see all"). Build a shared
  `InteriorLayout`/`RightRail` primitive so the structure is uniform and can't drift page-to-page, then
  migrate routes onto it. (M–L)
- [ ] **S8 · No orange highlight on input focus, site-wide** *(owner, screenshot review).* Inputs
  currently focus with the orange `primary` ring/border (`focus:border-primary` across many fields, plus
  the composer's orange outline). Replace with a neutral, calmer focus treatment everywhere (soft
  `border-strong` / subtle ring — no brand-orange on text inputs). Define ONE canonical focus style and
  apply via the shared field classes so it can't drift; sweep existing `focus:border-primary` /
  `focus:ring-primary` on inputs/textareas/selects. (S–M)
- [ ] **S9 · Warm up the beta demo content — it feels sterile** *(owner, screenshot review).* The seeded
  demo posts/circles/people read flat and "seeded," not lived-in. Warm the generated copy + curation
  (Seed Studio / `lib/demo/*` palette + templates): more human, specific, emotionally textured posts;
  real-feeling names + bios + circle blurbs; varied cadence and warmth. Goal — a newcomer's first scroll
  feels like a real, warm community, not a demo. (M)
- [ ] **S10 · Vercel preview deploys hang in "Initializing"** *(owner, observed).* A preview deployment
  sat in **Initializing** for 8m+ and never started building (no build logs). Investigate stuck/never-
  starting Vercel previews — check the Git integration + build queue, deployment-settings recommendations,
  and whether concurrent force-pushes orphan in-flight builds. Make preview deploys reliably start (or
  fail fast with a clear error) so PR previews are trustworthy. (S–M)

### IA refresh follow-ons (ADR-097 — nav restructure shipped; these are the deeper builds)
- [x] **Broadcast = a real local-happenings dashboard.** ✅ `/broadcast` is now the Community Dashboard
  (counterpart to the Quest Dashboard): highlight hero (latest broadcast / next event), stat cards
  (broadcasts · upcoming events · circles · members), a broadcasts feed, and right-rail modules
  (Happening soon · New circles) + quick links. *Next:* fold in geo "near you" ranking once the Phase A
  feed lens lands; surface milestones.
- [ ] **Frequency Shop (real-money merch e-commerce).** Distinct from the Quest **Store** (play economy +
  Vault). New surface for physical/merch sales — payments, catalog, fulfillment. Greenfield. (G)
- [ ] **Fold Outreach *content* into the admin Overview.** ADR-097 moved the nav entry into the Overview
  launchpad; next, surface the actual outreach tools/queue inside the Overview page so it's not a bare
  link. (S–M)

## T. Session 2026-06-05 (build sprint) — all ✅ merged to main

Everything below shipped this session (tsc + eslint + 241 tests green; migrations
applied to prod). Listed so the build list reflects reality.

### ✅ Shipped
- [x] **Marketing pages → editor = live.** Ported **The Quest** + **Pricing** into the
  Puck block editor; added a standardized **Tiers** block (ADR-100). The Lab + Community
  + Quest + Pricing are now all editor-editable; Home + About stay code-locked.
- [x] **Header polish.** Beta→**Demo** toggle moved left of Search (height-matched);
  mobile: contact-capture as a filled box pinned far-right, Friends+Messages folded into
  one silhouette icon → Messages; top-of-page stats card → compact ¼-size pill on mobile.
- [x] **Demo posts reach every viewer's feed** (ADR-101) — demo `group` posts were only
  shown to members of demo circles; now surface for all when `demo_mode` is on.
- [x] **Vault Store** — renamed the Quest nav item; the Vault (gems + zaps + streak +
  items-won + equipped) is pinned top-right of the store page.
- [x] **Demo Studio dashboard re-layout** — overview stats + global switch on top, Create
  + Grow in the middle, a single **Danger zone** at the bottom behind one typed-`DELETE`.
- [x] **CRM pipeline suite** (ADR-102) — `/crm` is now tabbed: a stage **board** (deals,
  move, KPIs, analytics) + Contacts + deal detail with activities/tasks. → delivers the
  "pipelines (Kanban)" half of §I's "Richer Studio engine".
- [x] **Seed Studio: naturally-grown neighborhood** (ADR-103) — a Hub run by a Guide over
  circles with Hosts (sets `circles.host_id`), members write on each other's walls + the
  feed, a friendship graph, and Dispatches from Hosts/Guide. `hubs.is_demo` for teardown.
  → big step on **§S9** (warm, lived-in demo content).
- [x] **Economy re-strategy** (ADR-104) — Gems = web/on-platform (daily-capped, spendable);
  Zaps = in-person/outreach (the rank ladder). Rebalanced every `gem_config`/`zap_config`
  amount to a coherent season; added `circle_start`/`circle_activate`/`program_run` rows.
- [x] **Fix "Ask Vera"** — the `help_chunks` RAG corpus was empty (no ingestion pipeline
  existed). Built `reindexHelpChunks()` + an admin **Build index** button (`/admin/ai`) +
  nightly `embed-help` cron. *(Owner one-time: click Build index in prod to populate.)*
- [x] **Editable profile header images** — see §R.
- [x] **Beta sequences admin** — per-sequence **incoming-point** picker (splash vs straight-
  to-induction) + shareable link + **QR (PNG/SVG)** for each entry point. *(Moved to
  `/pages/sequences` in wave 2 — see §U.)*
- [x] **Community Library** (ADR-109) — unify Practices/Programs/Journeys: Programs become a
  DB type (member-creatable, earns zaps), one **approval lifecycle** (submit → Host/Guide+
  approve), one **ratings** signal, and a unified ranked **/library** catalog
  (`3·adoptions + 2·completions + 4·ratings + recency + endorser-rank`) + a **/library/review**
  queue. → advances **Q1 Phase 5**, **Q2 Phase 4**, and §F programs.

### ⏳ Follow-ups opened this session
- [ ] **Community Library Phase 2** — wire a "Submit to Library" button onto practice/journey
  detail pages (the `submitToLibrary` action exists); a program **detail route**; hierarchical
  per-author approval; tune the ranking weights from real data. (M)
- [ ] **Member-facing economy surfacing** — a season banner/countdown + show per-action point
  values in-product (amounts now live in config; §F "Reward amount-edit UI" is the admin side). (S)

## U. Session 2026-06-05 (wave 2) — profile, QR Studio, onboarding tour, Pages — ✅ merged

Second wave shipped this session (tsc + eslint + **253** tests green throughout; PRs
#237–#243, merged to main). Listed so the build list reflects reality.

### ✅ Shipped
- [x] **Profile header crop/zoom + autocomplete city** (#237) — the Settings → Profile
  cover uploader gained drag-to-reposition + zoom crop (WYSIWYG canvas export) on a
  slightly taller banner; the City field is now a `LocationAutocomplete` that also sets
  the member's home geo (powers "near you"). Extends §R cover photo.
- [x] **Onboarding won't overwrite on re-run** (#237) — `completeOnboarding` gates on
  `meta.onboarding_completed`; a second pass only fills blanks + merges meta (the beta
  induction already merged safely).
- [x] **QR Studio: design editor up top** (#238) — the generator is now a two-column studio
  (sticky editor rail + settings); curated the preset list to six; the design persists
  across code-type switches. Cleanly merged with the parallel signed-code / scannability /
  max-claims work (ADR-115).
- [x] **Vera-guided spotlight tour** (ADR-117, #240) — a guided, pausable overlay launched
  from the feed onboarding box that dims the page and lights one real surface at a time
  (feed → composer → circles → practices → events → profile), narrated, resumes where it
  was paused. → advances §F progressive onboarding (the guided deterministic tour) and the
  Vera concierge fallback.
- [x] **Onboarding accessibility pass** (#240) — both flows (beta induction + steady-state
  form): focus moves to each step on advance, `progressbar`/`combobox` semantics, every
  label associated with its input, announced handle-availability live region.
- [x] **Profile editor keeps the community rail + View profile** (ADR-117, #240) —
  `/settings/profile` now carries the standard rail and links to the public profile. → a
  first concrete step on **S7** (uniform interior right rail).
- [x] **Season Challenges → dashboard** (#240) — rebuilt on `DashboardTemplate`: a KPI band
  (a shade darker than the canvas) with season progress + four `StatCard`s, then difficulty
  sections as bordered two-up cards. Replaces the washed-out flat list.
- [x] **Taller feed composer** (#240).
- [x] **Narrated, illustrated Vera welcome deck** (#242) — the post-induction lightbox is now
  a guided walkthrough (one site element per slide, each with a vector illustration),
  reframed for Founders who just completed the **Beta agreement** (dropped the "made it
  through the oath" line). New `components/onboarding/welcome-art.tsx`. → advances §F
  onboarding + Vera voice.
- [x] **Onboarding sequences moved into Pages** (#243) — the audience splash sequences moved
  from Admin → Vera to **`/pages/sequences`**, surfaced on the `/pages` directory. Supersedes
  the §T "Beta sequences admin" location below.

### Still open (unchanged by this wave)
- **S7** uniform right rail (only `/settings/profile` done so far) · **S8** neutral input
  focus · **§R** richer profile header stats · **§F / §T** member-facing economy surfacing
  (season banner + per-action point values).

## V. Theme & template system (adaptive theming — completeness audit, 2026-06-14)

The four-axis theming chain (mode · skin · occasion · generation) + the data-driven theme
manager + the page-chrome map. **Engine, registries, resolver, `(main)` shell, admin,
and DB are wired end-to-end** (per-request theme injection lives in the `(main)` shell, not
the root layout, moved for SEO) — the chain renders DAWN today and a Space's skin/brand + a
DB skin/occasion theme + the time-scheduled occasion all flow to the page. What remains is
**exposing the latent axes** (generation/structure), **regenerating types**, **seeding +
member-facing UX**, and **multi-Space / test / export depth**. Canonical spec:
[`THEME.md`](THEME.md) (owned elsewhere — keep its status table in sync). Legend D/S/M/L/?/G.

**Verified WIRED (✅, shipped — D):**
- [x] **Engine** — `app/globals.css`: the `:root`/`.dark` base, `[data-skin]`, `[data-occasion]`,
  `[data-generation]` blocks, the feel tokens (radius/motion/density/type-scale/ornament/tap),
  the unlayered four-axis precedence (base < skin < occasion < generation), and the
  `@theme inline` var() bridge + `text-scaled-*`/`tap-target`/`text-2xs|3xs` utilities. ✅
- [x] **Registries + guardrails** — `lib/theme/{skins,occasions,generations}.ts` typed mirrors;
  the CSS⇄registry guardrail tests **all exist** (`skins.test.ts`, `occasions.test.ts`,
  `generations.test.ts`) plus `css.test.ts` + `validate.test.ts`. `validate.ts` (allowlist +
  injection-safe value validators + `isSafeSlug`), `css.ts` (scoped `<style>` renderer), and
  `cookie.ts` (parse/serialize `fxtheme`) are present + tested. ✅
  *(THEME.md §2 now marks the generation/occasion guardrails ✅ exist, reconciled this pass.)*
- [x] **Resolver** — `server/resolve.ts` (cookie → Space → system precedence), `server/themes.ts`
  (active DB skin/occasion → scoped `<style>`; `resolveActiveOccasionSlug` auto-schedules by
  MM-DD window; fail-safe `''`/`'none'`), `server/admin-themes.ts` (Studio list/get). ✅
- [x] **(main) shell — per-request theme injection** — the in-app shell
  (`app/(main)/layout.tsx`) stamps `data-skin`/`data-generation`/`data-occasion` on the shell
  root, injects `<style id="fx-theme">`, and resolves the effective occasion (cookie-pin → DB
  window). This moved out of the root layout for SEO (the root layout now does no per-request
  reads, so the public marketing/discover pages stay static). `ThemeProvider` has no consumers
  after the move, so it is **not currently mounted**. ✅
- [x] **(main) layout + shell** — `(main)/layout.tsx` resolves the Space and passes
  `skin`/`brandName`/`brandLogoUrl`/`chromeOverrides`; `app-shell.tsx` sets `data-skin` on the
  shell root, renders the brand via `BrandMark`, and resolves the rail via
  `mergeChrome(railFor(pathname), chromeOverrides)`. **The per-Space header brand IS rendered**
  (BrandMark shows logo/name) and **the page-chrome override IS read live** in the shell. ✅
  *(Doc copy reconciled this pass: the `20260626100000` migration, `/admin/page-layout`, the
  `space_brand` migration, `spaces/types.ts`, and THEME.md now read the shipped reality.
  `page-chrome.ts` is owned by another agent and left for them, but `app-shell.tsx` already calls
  `mergeChrome`, so its own "follow-up" comment is the last stale spot.)*
- [x] **Admin** — `/admin/appearance` (Theme Studio: skins + occasions, create/edit/activate/
  default), `/admin/spaces` (+`[id]` editor: assign skin theme + brand name/accent/logo),
  `/admin/page-layout` (per-route rail override) + their actions; nav links registered in
  `admin/sections.ts` (Platform section). ✅
- [x] **DB** — `20260625000000_themes`, `20260626000000_space_brand`, `20260626100000_page_chrome_overrides`
  applied to prod (per the migration headers). ✅

**Shipped this pass (✅ — closed since the audit):**
- [x] **Regenerated `lib/database.types.ts`** — `page_chrome_overrides`, `themes`, and
  `spaces.brand_*` are now folded in canonically, so `loadChromeOverrides` no longer needs the
  `as unknown as SupabaseClient` cast and the `spaces` brand write / `store.ts` row reads drop
  their `as never` / `as unknown as SpaceRow` casts. ✅
- [x] **Seeded the built-in theme rows** — the built-in `default`/`midnight` skins + the
  `solstice` occasion now ship as editable `themes` rows (the follow-up the themes migration
  flagged), so Theme Studio isn't empty and the DB occasion path is exercised. ✅
- [x] **`structure.test.ts` guardrail** — added; it asserts the generation→structure mapping and
  that it stays exhaustive over `GenerationId` (the structure axis now has the same guardrail the
  other three carry). ✅ *(Wiring `structureFor` into the templates is still open below.)*
- [x] **Doc reconciliation of the stale "not wired yet" copy** — `page-chrome.ts` (owned
  elsewhere), `20260626100000_page_chrome_overrides.sql`, `/admin/page-layout/page.tsx`,
  `space_brand` migration, `spaces/types.ts`, and THEME.md now read the shipped reality (the shell
  merges chrome overrides live, `BrandMark` renders the Space brand, and the
  generation/occasion guardrail tests exist). ✅

**Generation / demographic axis exposure (latent — CSS + registry + resolver present, nothing sets it live):**
- [ ] **Member generation switch + cookie writer.** `serializeThemeCookie` + the whole `fxtheme`
  cookie path exist and the resolver honours `cookie.gen`, but **no UI writes the cookie** —
  there is no member-facing skin/generation/occasion switcher anywhere in `app/`/`components/`.
  Build the client switch (settings or account menu) that writes `fxtheme` (+ optional
  `freq-skin` localStorage for the pre-paint preview path) so a member can actually pick a
  generation/skin. Pairs with adopting `text-scaled-*`/`tap-target` on real primitives so the
  feel tokens visibly bite. (M)
- [ ] **`spaces.generation` column + per-Space default.** The resolver already takes
  `spaceGeneration`, but the `spaces` table has **no `generation` column** and `(main)/layout.tsx`
  never passes one (only `space.skin`). Add the column (migration), thread it through
  `lib/spaces/{types,store}.ts` + `resolveSpaceForHost`, pass it into `resolveTheme`, and add a
  generation picker to the `/admin/spaces/[id]` editor. (M)
- [ ] **`data-generation` is set but unexposed today.** The `(main)` shell always stamps
  `data-generation` (resolves to `balanced` for everyone since nothing overrides it), so the axis
  renders but is inert. The two items above are what make it reachable; until then it's a no-op
  baseline. (tracked above — no separate work)
- [ ] **Generation as editable data in Theme Studio.** Theme Studio manages skin/occasion themes
  only; the generation feel-token presets live in code (globals.css). Optionally let an operator
  retune generation feel tokens as data (same allowlist already covers `--type-scale`/`--ornament`/
  `--tap-min`/radius/motion/density). 🅿️ deferred per THEME.md §6. (M)
- [ ] **Per-preset contrast/saturation tuning** with proper `.dark` variants per generation
  (deliberately deferred in globals.css to avoid light-only dark-invisible text). (M)

**Structural template variants (latent — `structureFor` written, ZERO consumers):**
- [ ] **Wire `lib/theme/structure.ts` into the templates.** `structureFor(generation)` →
  `'simple' | 'standard' | 'dense'` is pure + exhaustive but **nothing imports it** (no template
  reads it). Make Stream/Index/Detail/Dashboard/Focus resolve the generation server-side and swap
  LAYOUT (column count / rhythm / header scale) by structure, so `bold` → denser and
  `spacious`/kids → single-column simple. (M)
- [ ] **Template-per-page (a theme scoped to a page template).** 🔴 not built (THEME.md §13). (M)

*(The `structure.test.ts` guardrail shipped this pass — see "Shipped this pass" above.)*

**Types regeneration:** *(✅ done this pass — `lib/database.types.ts` regenerated, the casts
dropped; see "Shipped this pass" above.)*

**Occasion seeding + UX:**
- [ ] **Occasion authoring/preview polish in Theme Studio.** Confirm the new/edit theme form
  exposes the MM-DD window for `kind='occasion'` and previews the overlay; add a "what's active
  now" indicator driven by `resolveActiveOccasionSlug`. (S)

**Per-Space membership / multi-Space:**
- [ ] **Per-Space membership + multi-Space identity.** Today resolution is host→Space (custom
  domain → that Space, else root) and the skin/brand/vertical-gating flow from it, but there is no
  notion of a member *belonging to* a Space or switching between Spaces. Define per-Space
  membership + a space-switcher so a white-label tenant has its own roster (ties into Spaces
  tenancy, ADR-249/250). (L)
- [ ] **Per-Nexus subdomains** (`encinitas.frequencylocal.com`) resolve to a Space — overlaps §J's
  subdomain item; the Space resolver already keys off host/domain, so this is the routing half. (M)

**Visual-regression tests across axes:**
- [ ] **Cross-axis visual-regression suite.** The guardrail tests assert CSS⇄registry *pairing*,
  not rendered output. Add screenshot/visual-regression coverage across the matrix (mode × skin ×
  occasion × generation, plus the structure variants once wired) so a token change that breaks
  contrast or layout is caught. Gated on a browser-capable test harness (§D). (M)

**W3C-token native export (mobile seam):**
- [ ] **W3C Design Tokens export + native generation.** THEME.md §10/§15: extract the DAWN base
  into vendor-neutral W3C Design Tokens JSON and generate both the web CSS and the native
  (Expo/RN) token set from it, so the axes (skin/occasion/generation overlays) port to mobile.
  ⏳ Phase 5 (mobile) task; the doc records the seam. (L)

**Doc reconciliation:** *(✅ done this pass — the stale "not wired yet" copy across `page-chrome.ts`
(owned elsewhere), the `page_chrome_overrides` + `space_brand` migrations, `/admin/page-layout/page.tsx`,
`spaces/types.ts`, and THEME.md now reads the shipped reality; see "Shipped this pass" above.)*

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

## Entry-point flyer designer (deferred — flyers OFF for now)

Entry-point **flyer** downloads (the print-ready branded poster: `/api/entry-points/<slug>/flyer`
SVG/PNG) are **turned off in the UI** for now (the QR PNG/SVG + short link stay). The flyer API
route + `buildEntryFlyerSvg` remain in the code, just unlinked. Bring it back as a proper **flyer
designer** (layout/template picker, editable poster, brand presets) rather than the fixed
template, and re-expose the download buttons in `entry-points-client.tsx` (EntryRow).
