# BRIEF-06 — Full system overview (every feature on the site)

> **For Claude Design and Claude Code both.** This is the complete map of what
> Frequency *is* as a working system: every member-facing feature domain, every
> operator surface, every platform engine, and what is built but dormant. Read it
> after BRIEF-01..05 for feature awareness during design rounds, and treat it as
> the orientation handoff when starting a Claude Code session on this repo.
> Compiled 2026-08-03 from a full-repo sweep (routes, registries, migrations,
> crons) plus the live database. Where a number is approximate it says so.

Legend: ✅ live · ⏳ built, gated/dormant · 🔴 on hold / not wired

---

## 1. The system at a glance

| Measure | Value |
|---|---|
| Pages / API routes / layouts | 389 page.tsx · 68 route.ts · 20 layouts (~477 route files) |
| Member-reachable page routes | ~250, plus 22 public `/discover` pages and 37 marketing routes |
| Components / lib modules | ~1,026 / ~1,625 files (~630k lines of TypeScript) |
| Database | ~275 live tables, 579 migrations, Postgres 17 (Supabase), RLS enabled on every table |
| Registries | 62 admin studio leaves · 35 admin modules · 29 Space modules · 157 page blocks · 82 Puck blocks → composed into one 327-app catalog |
| Scheduled jobs | 26 crons (all UTC, listed in §7) |
| Tests / CI | 7,598 vitest cases · 14 bespoke contract checkers in CI · pgTAP DB tests |
| Help center | 55 articles in 10 categories (`content/help/`), embedded nightly for RAG |
| Stack | Next.js 16 App Router · React 19 · Tailwind v4 (CSS-config) · Supabase · Stripe · Resend · Twilio · Anthropic · Recraft · Vercel |

**The five altitudes.** Everything on the site lives at one of five levels:

1. **Public web** — marketing site, discover pages, spotlight pages, help center, feeds (SEO/AIO surface).
2. **Member app** — the signed-in product: 32 feature domains (§2).
3. **Operator consoles** — per-Space and per-entity management: the 12-box Space console, 8 entity `/manage` consoles (§3).
4. **Admin studios** — platform staff tooling: 62 destinations in 10 domains (§4).
5. **Engines** — the machinery under all of it: AI, comms, commerce, gamification, resonance, events, trust, growth, search, geo, media, realtime, observability (§5).

---

## 2. Member-facing feature domains (32)

One line each; the deep inventory lives in the route tree and `docs/`.

| # | Domain | What it is | Key routes |
|---|---|---|---|
| 1 | Feed & posts | Resonance-ranked home stream; composer, reactions, mentions, nested replies, pinning | `/feed` |
| 2 | Dispatches & ticker | Short host/leader broadcasts with likes, comments, polls; site-wide ticker | `/nearby` |
| 3 | Capture & Journal | The center-button action: catch a post / note / photo / contact / scan from anywhere; private day-grouped Journal | global modal, `/journal`, `/scan` |
| 4 | Events | The deepest domain: RSVP (open or approval), tiered tickets, QR check-in (+25 zaps), recurring series (materialized occurrences + series fold), guest invites, co-hosts, host transfer, placement on Circles/Spaces, event wall + Q&A + recap, .ics feeds, Vera Event Spark (poster OCR → draft) | `/events`, `/events/[slug]`, `/discover/events` |
| 5 | Circles | Small local groups: one-tap join, wall, weekly practice, invite links, Starter Circle blueprints (⏳ flag-gated), transfer/handoff | `/circles`, `/circles/[slug]` |
| 6 | Hubs · Nexuses · Outposts | The geographic tree above Circles (Hub ≤5 Circles, Nexus ≤2,500 members, Outpost = physical HQ); mostly read/context for members | `/hubs/[slug]`, `/nexuses/[slug]` |
| 7 | Channels | Global topical forums under the four Pillars (Mind · Body · Spirit · Expression); tune in, start a local Chapter from a blueprint | `/channels`, `/discover/topics` |
| 8 | Messages & rooms | Friends-gated 1:1 DMs, named group conversations, multi-member rooms with roles, realtime + typing, AI semantic room search | `/messages`, `/messages/r/[roomId]` |
| 9 | Practices | The atomic daily act: adopt, log, streak, earn Zaps; member authoring + forking; Vera builder; Pillar taxonomy; timer binding | `/practices`, `/discover/practices` |
| 10 | Journeys | Multi-phase practice paths (phases → modules → lessons); drip delivery, cohort runs, Co-op (3+ circle members), member authoring + review queue, portable export | `/journeys`, `/journeys/[slug]` |
| 11 | The Quest | 13-week seasons; ranks Ghost → Initiate → Adept → Master (completion-based), community challenges, trophies, season reset (Zaps→Gems 5:1) | `/crew`, `/the-quest` |
| 12 | Crew tasks · streaks · achievements | Daily check-in streak (freeze tokens, milestone payouts), permanent badges bronze→platinum, claimable circle tasks | `/crew` |
| 13 | Zaps · Gems · Store · leaderboard | Dual currency (Zaps = real-world status, unspendable; Gems = online, spendable), vault store, peer zap-gifting via QR, physical node capture (PostGIS-verified), leaderboard with opt-out | `/crew/store`, `/crew/leaderboard` |
| 14 | On-Air ("Mindless") | Full-screen practice timer: Be Still and Get Moving modes, breath visualizer, crash-safe resume, payout reveal, Vera dispatch after | `/on-air`, shell-mounted |
| 15 | Airwaves & podcasts | Space-published audio/video, background player, shows with public RSS, recording reviews | `/spaces/[slug]/podcasts` |
| 16 | Library | Community-approved practices/journeys/programs; browse, rate, submit → leadership review | `/library` |
| 17 | Spaces (member side) | Follow, join paid tiers, book services, buy tickets, enroll in programs, donate, review, collaborate, venue holds; 7 Space types | `/spaces/[slug]`, `/spaces/directory` |
| 18 | Classifieds | Peer-to-peer local goods, connect-only (no in-app payment) | `/classifieds` |
| 19 | Market (Maker) | Etsy-like member storefronts with Stripe Connect checkout | `/market` |
| 20 | Frequency Store | First-party retail (merch, retreats); platform is the seller | `/store` |
| 21 | Housing & roommates | Rentals + roommate matching, geo-matched, connect-only | `/housing` |
| 22 | Orders & disputes | Purchase history across all commerce, reviews, dispute path, billing portal, payout onboarding | `/orders`, `/settings/billing` |
| 23 | Partners & personas | Local partner directory, offers/plaque redemptions; four member personas (Collaborator · Practitioner · Business · Organization) with a claim → verify → activate ladder (⏳ Stripe binding stubbed) | `/partners` |
| 24 | Connections (personal CRM) | Private rolodex: card-scan OCR, QR capture, Google import, notes/tags/reminders, consent ladder, merge-to-member | `/network/contacts`, `/connections/*` |
| 25 | Friends & people | Friend requests, proximity-banded directory, presence, suggestions, vCard, meetup safety note, block/unblock | `/network`, `/people/[handle]` |
| 26 | Resonance matching | Opt-in (default off) double-opt-in matching with a plain "why"; romance lane (strictly mutual, verified-only, no swiping); nightly persisted edges | `/network/friends`, `/settings/connections` |
| 27 | Spotlight & profiles | Public link-tree page (Puck blocks, themes, Top Friends, OG images), styled personal QR, Google Wallet pass, vCard | `/spotlight/[handle]` |
| 28 | Vera & member AI | Chat pill, help RAG with citations, creation copilots (events, practices, journeys, circles, spaces, listings), contact-scan assist, per-member erasable memory | global launcher, `/help/ask` |
| 29 | Notifications & digests | In-app · email · push · SMS channels; per-category and per-subject mutes; weekly digest that skips empty; RFC-8058 one-click unsubscribe; token-authorized `/manage-emails` | bell, `/settings/notifications` |
| 30 | Onboarding & beta | Magic-link sign-in, cinematic beta induction (⏳ marked temporary), waitlist, admission waves, Founder's First Week, application tracks (host · practitioner · partner), role-promotion training | `/onboarding`, `/waitlist`, `/apply` |
| 31 | Referrals · QR · nodes | Universal `/q/[slug]` resolver (join, check-in, splash, attribution, A/B, capture), in-app scanner, physical node capture, +40 zaps on accepted invite, print sheets | `/codes`, `/q/[slug]`, `/referral` |
| 32 | Cross-cutting | Search (⌘K, 5 result types), Discover (22 ISR pages), maps, help center, changelog, support tickets + live chat + bug reporter, trust/safety reporting, settings suite, PWYW Crew membership, data export + account deletion, presence | `/search`, `/discover`, `/help`, `/support`, `/settings` |

---

## 3. Operator surfaces (per-Space and per-entity)

**The Space console** (`/spaces/[slug]/manage`) renders 29 modules in 12 boxes from
`SPACE_MODULES` — the operator's whole world: Profile & Settings, Page (layout +
Puck multi-page editor), People (seats), CRM (contacts, conversations, leads,
capture doors, automation), Calendar, Offerings & money (booking, memberships,
donations, enrollment, tickets, check-in), Shop, Content (practices, journeys,
circles, program, Airwaves, Loom), Email (design studio + style + sends),
QR & insights, Plan & billing, Danger zone. A Module Manager lets each Space
hide/reorder/activate advanced tools. Freemium meters (200 contacts, 300
sends/mo, 3 QR codes, 1 published journey, 1 free seat) are defined and
⏳ enforcement-ready behind the pricing switch.

**Entity consoles** (`resolveEntityConsole = appsForScope`) give Circles (7
modules), Events (3), Hubs (6), Nexuses (6), Channels (5), Practices (2), and
Journeys (4) the same rail-identical manage surfaces, locked by drift tests.

**Member self-serve authoring:** Spotlight editor, profile layout, studio windows
(create circle/event/practice/journey/listing), journey builder v2.

---

## 4. Platform admin studios (62 destinations, 10 domains)

| Domain | Studios |
|---|---|
| Appearance & pages | Theme Studio (DB-backed themes + live preview) · Page editor (Puck, 8 marketing docs) · Page content/SEO panel (per-route) · Page layout console (rail per route) · Menu Manager (5 surfaces, role matrix, mega-menu) · Elements console |
| Content | Loom Studio (platform DAM: assets, collections, versions, AI generation, sequence flows) · Seasons · Journeys · Practices (+health/merge) · Challenges · Training · Tips |
| Community | Circles · Circle templates · Hubs · Nexuses · Channels · Members · Roles grid · Personas · Events admin · Dispatches · Moderation · Support · Import |
| CRM | Resonance CRM: contacts, conversations, deals/pipeline, tasks, playbooks, segments, intelligence, marketing sends, Today |
| Growth | QR Studio (design, dynamic links, campaigns, NFC, scan map) · Entry points (A/B, flyers) · Referrals · Applications · Funnels (⏳ menu-retired) · Automations/Nurture (⏳ menu-retired) |
| Marketing | Beta Command (waves, approval queue) · Analytics · Deliverability/DLQ · AI marketing agent (propose-only Action Queue) · Email Studio |
| Commerce | Marketplace console (orders, refunds, disputes, reviews) · Pricing admin (plans, gates, meters) · Payments · Store |
| Gamification | Economy config (Zaps/Gems) · Achievements · Vault store catalog · Crew tasks |
| AI | Vera config · AI controls (master switch + autonomy) · Studio recommendations (reversible site actions) · Help gaps |
| Platform | Spaces admin ("white-label tenants": brand, functions, lifecycle, manual agreements) · Demo Studio · Business/Listing seeders (AI import) · Walkthroughs · Audit · Insights · Density · Operations |

All wired through `STUDIO_LEAVES` → `ADMIN_NAV`/`ADMIN_GROUPS`; the admin menu
contract (ADR-553, `pnpm check:menu`) makes every menu change a catalog-row edit.

---

## 5. The engines (15 families)

| Engine | Essentials |
|---|---|
| AI kernel | One gateway (`lib/ai/client.ts`, Anthropic; tiers haiku/sonnet/opus), master kill flag fails closed, per-feature daily budgets ($25 global cap), voice primer injected into every member-facing prompt. Embeddings: Supabase edge fn, 384-d, keyless |
| Vera | Concierge fallback + Claude tool loop; writes are propose-and-confirm; autonomous sends pass a 4-guard circuit breaker (kill switch → rate caps → anomaly trip → audit), default OFF; per-member erasable memory |
| RAG indexes | Help (cited, confidence-gated), events (per-series), rooms, library, practices, resonance embeddings — each with its own cron |
| Comms | Resend email + Svix-verified webhooks, auto-suppression, per-Space suppression scope; unforgeable HMAC reply addresses route inbound to conversations; Twilio SMS behind a five-condition refuse-first gate (⏳ A2P pending); web push (VAPID); ONE unified send-gate (prefs × consent × suppression) + declarative notification registry (⏳ 2 of many events migrated) + durable outbox with retries/DLQ |
| Commerce | One consolidated Stripe webhook (idempotent via `stripe_webhook_events`); Connect Express per profile; tips always 0%; network take-rate ONLY on network-sourced sales, own-audience always 0%; append-only `financial_transactions` ledger split Foundation/Labs; ⏳ payouts flag default OFF |
| Pricing | Code-map gates + DB override; gates→meters shift (every feature everywhere, allowances by tier) with one go-live switch; `network_connected` toggles collective vs standalone (white-label) worlds |
| Gamification | Currency router (real-life → Zaps, online → Gems), DB-trigger-only totals, idempotent reward grants (claim-then-pay), season reset RPC, anti-tamper column locks |
| Resonance | `harmonicMean(want(A→B), want(B→A))` over shared circles/journeys/practices/pillars + optional cosine; two-stage candidate funnel; 14-day persisted edges (surfaces never recompute); double-opt-in consent spine; density cells drive the adaptive feed radius |
| Events | Materialized recurrence (60-day horizon cron), pure series fold, 3-touch reminders, RFC-5545 .ics with correct DST handling, placement + host-transfer handshakes, geocoding seam (Nominatim/Google) |
| Trust & safety | Signal ledger with weights in code (recompute = replay), reports queue, Vera as system moderation account, Upstash rate limiting (fails closed in prod when unconfigured), consent scopes + 90-day interaction retention + GDPR export, centralized claim tokens, append-only admin audit |
| Growth | Immutable first-touch attribution (edge cookies), channel taxonomy, activation-gated referral payouts, QR resolver pipeline, A/B entry points, drips/nurture (3 engines), two-authority beta admission |
| Search | Guarded `/api/search` (5 result types; nav registry is automatically searchable), semantic search via pgvector, pg_trgm indexes |
| Geo | Provider seam (Google Maps or keyless MapLibre), Photon autocomplete, PostGIS points (nodes, homes, listings), region tree, density cells |
| Media | Six storage buckets, sharp server ops (OG cards, QR raster), HEIC conversion, focal-point + contrast tooling, Loom renditions/versions, Recraft + Claude-drawn SVG generation, resvg rasterization |
| Observability | Sentry (4 configs), cron dead-man heartbeats, SLOs as code, first-party event taxonomy → `engagement_events`, consent-gated interaction firehose (90d), GA4 server mirror (prod-only), dotted-namespace logging |

**Realtime:** Supabase Realtime — `postgres_changes` for rooms/DMs (durable),
`broadcast` for typing and anonymous support chat (HMAC token IS the channel gate).

---

## 6. Design system state (what design rounds work against)

- **Tokens:** fully semantic color system (25,756 token uses, 0 raw palette
  classes, CI-enforced by `check:tokens`). Fonts centralized in `app/layout.tsx`
  with per-theme treatment rules. Radius/motion/density/type-scale/spacing-rhythm
  tokens exist; adoption is the current gap (radius ~0.5%, `text-scaled` 0) —
  closing it is planned work, see §9.
- **Axes:** mode (`.dark`) × skin (`data-skin`: default DAWN, `midnight`) ×
  occasion × generation (8 presets) × structure × per-Space theme (6) — all
  server-resolved, FOUC-free, drift-tested against `globals.css`.
- **Current canon:** `design_handoff/HANDOFF-TO-DAWN-2026-08-03.md` holds every
  live token value (DAWN + Midnight, light + dark), effects, motion inventory,
  and the four ⏳ open questions for Daniel (vault icon, light body ink #3D352A,
  post surface #F7F5EF, Midnight secondary accents).
- **Sync routine:** `design_handoff/SYNC.md` — rounds come back as `CHANGES.md` +
  a `design-sync/*` PR; raw hex only ever lands in `globals.css`.
- **Authoring UI:** operator Theme Studio at `/admin/appearance` (DB themes,
  token allowlist ~45, live preview); member switcher at `/settings/appearance`.

---

## 7. Scheduled jobs (26 crons, UTC)

`process-queue */2 · space-campaigns, space-drips, conversation-batches,
publish-scheduled */5 · season-go-live, embed-room-messages */10 · nurture,
event-reminders, space-follower-event-reminders */15 · journey-drips 15,45 ·
referral-release, embed-events */30 · lifecycle-triggers 00:00 ·
event-occurrences 02:00 · refresh-traits 02:30 · enforce-retention 02:45 ·
demo-decay 03:15 · embed-help 03:20 · summarize-vera-memory 03:35 ·
embed-library, embed-practices 03:40 · billing-renewals 04:10 · journey-prompt,
vera-owner-brief 13:00 · weekly-digest Sun 14:00.`
All behind `CRON_SECRET`; freshness checked by `pnpm check:cron-freshness`;
dead-man heartbeats per job.

---

## 8. Tenancy and white-label (the strategic frame)

A **Space** is the white-label tenant unit: one app, one graph, many sub-brands
(`docs/SPACES.md`). The data plane is ~80% tenant-ready today — page docs,
`page_settings` (keyed space_id+route), `element_settings` (master + per-Space
override), Loom assets, CRM/contacts (per-Space uniqueness live), email
templates/events, all 35+ `space_*` commerce tables, and QR all carry `space_id`.
`spaces.network_connected` switches a tenant between the connected (collective)
world and the standalone white-label world (discovery-walled, 0% take-rate).

**Approved but not yet built** (ADR-509, `docs/WHITE-LABEL-SITES.md`): subdomain
sites on a dedicated apex → custom domains via the Vercel Domains API → the
per-Space Puck editor un-gated → hardening → member sites. 🔴 `/sites/[slug]` is
currently a coming-soon stub; there is no domains table or host router yet;
`space_whitelabel` / `custom_domain` entitlements are not yet enforced. Space
pages currently live in `spaces.preferences.pageDocs` (the `pages` table
convergence is a planned decision).

---

## 9. Current initiatives (the build plan, one line each)

| Phase | Focus |
|---|---|
| P0 Ground truth | Migration-ledger reconciliation, regenerated DB types, dedicated HMAC secrets, doc-drift fixes, web-vitals baseline |
| P1 Tenancy walls | RLS policies on all `space_*`/CRM tables (predicates exist), `app_instances` live, pgTAP cross-tenant proof, service-role client ratchet, zod at boundaries, deny-by-default edge |
| P2 Instant shell | Kill the 326 `router.refresh()` full-tree refetches, stream the 16 heaviest pages, Next 16 cache components with tenant-scoped tags |
| P3 One design system | Snapshot harness → radius/type/spacing/motion token sweeps, marketing tokenized, Theme Studio v2 (+ per-Space theme authoring), DTCG portable themes |
| P3R Site redesign (DAWN 2) | The Claude Design ⇄ code loop: rounds land as CHANGES.md → token/kit PRs; identity evolves as the default theme; clarification pass on nav/copy/IA |
| P4 Uniform fabric | 100% template-kit adoption, card/control/chrome/canon CI guards, PageModules expansion, app-shell decomposition |
| P5 App Platform | Feature modules with enforced boundaries, four-layer app-instance contract, enablement inside RLS, CRM as flagship packaged app, meters go live |
| P6 White-label sites | `space_domains` + host router + resurrected site renderer → subdomains → per-Space editor + templates → custom domains + billing → hardening → member sites |

---

## 10. Built but dormant (design and build around these deliberately)

Flag-gated, awaiting keys, or shipped ahead of their wiring — not missing, not
broken. The important ones:

- ⏳ **All AI/Vera** (`ai_enabled` default off, fails closed) · **payouts/billing**
  (`host_payouts_enabled` off; every commerce path exists but settles only when
  live) · **SMS** (A2P pending) · **push** (needs VAPID keys only) · **referrals**
  flag · **Starter Circles** flag · **teaser paywall** (wired, inert) ·
  **feature meters** (one go-live switch).
- ⏳ **Shipped ahead of code:** `app_instances` (0 rows — the P5 backbone),
  notification registry (2 events migrated), personas Stripe binding (stubbed),
  journeys v2 runtime (0 cohorts yet), trust scores (0 rows, no recompute job),
  beta graduation/admission-wave runners (no callers), bundle checkout (no
  webhook seating branch — do not enable as-is).
- 🔴 **On hold:** `/sites/[slug]` external Space websites (renderer exists in git
  history) · Side Quests (documented, zero code) · `quest_chains` tables (legacy,
  no readers) · outpost stewardship (no-op) · flyer PDF downloads · the nested
  `resonance/` venue-world sub-app (separate scaffold project, not routed).
- **Retired-but-live routes:** `/vault` → `/crew/store`, `/people` → `/network`,
  funnels + automations pages reachable by deep link only (menus retired).

---

## 11. Where truth lives

| Question | Source |
|---|---|
| Naming / voice | `docs/NAMING.md`, `docs/CONTENT-VOICE.md` (locked canons) |
| Page composition | `docs/PAGE-FRAMEWORK.md` + `components/templates` |
| Menus / consoles | `docs/MENU-CONTRACT.md` + the three module catalogs (ADR-553) |
| Theming | `docs/THEME.md`, `design_handoff/HANDOFF-TO-DAWN-2026-08-03.md` |
| Tenancy / Spaces | `docs/SPACES.md`, `docs/ENTITY-SPACES-SYSTEM.md`, `docs/CONTACT-TENANCY.md` |
| White-label | `docs/WHITE-LABEL-SITES.md` + ADR-509 |
| Decisions | `docs/DECISIONS.md` (756 ADRs; the ledger) |
| Design rounds | `design_handoff/SYNC.md` (routine) + `CHANGES.md` (per round) |
| This overview | Regenerate after major phases; the registries and route tree are the ground truth it summarizes |
