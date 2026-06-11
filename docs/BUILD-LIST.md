# Master build list — Frequency web

> **The single, prioritized, execute-from list for the whole platform.** Consolidates every
> scattered roadmap (BACKLOG · ONBOARDING-BUILD-LIST · DEVELOPMENT-MAP · IA-RESTRUCTURE ·
> EDIT-PATH-AUDIT · STUDIO-REVIEW · LAUNCH · CHECKLIST) into one ranked list, after the
> 2026-06-08 five-domain code sweep + the owner's Roles & Permissions redesign.
> Legend: ✅ done · ⏳ partial / in flight · 📋 specced, not built · 🔴 blocked / gated.
> Spec detail still lives in the per-topic docs; this is the **order of operations**.

## 🔎 Full-site audit — 2026-06-09 (post events / journeys / circles)

Four-agent sweep (incompleteness · security · journeys/events/circles completeness · UI/linkage).
**Verdict: ~85–90% launch-ready. No broken routes, no orphans, no critical security holes.** Two
items were fixed during the audit; the rest is the prioritized list below.

**Fixed this pass:** 🟢 **Events migrations applied to prod** — `events` capacity/visibility, `event_ticket_types`,
`circle_current_transactions` (orig. `circle_field_transactions`; renamed to canon, ADR-208), `event_embeddings`,
the `adjust_ticket_sold` RPC + capacity trigger were **not live** (only the journey migration was), so the whole
events ticketing/Circle-Current system was broken in production. Applied all five (ADR-185). 🟢 **AI event-blurb
prompt-injection** hardened (user fields sanitized).

| Pri | Item | Why | Where |
|---|---|---|---|
| ✅ ~~P0~~ | **Regenerate `lib/database.types.ts`** | Done — regenerated from the live schema (all recent tables/columns now typed). The `as unknown as SupabaseClient` casts still compile and can be removed file-by-file as follow-up cleanup | `lib/database.types.ts` |
| ✅ ~~P0~~ | **Journey reward fires** | Audit false positive — Full-Day/Rhythm/Journey-complete are **already** wired (ADR-200, `lib/journey-rewards.ts`, 10/10 tests). No work needed | done |
| ✅ ~~P0~~ | **RSVP confirmation email** | Done — sends on going/waitlist via the durable outbox + prefs/suppression + calendar links | `events/actions.ts`, `lib/email.ts` |
| ✅ ~~P0~~ | **Event cancel → bulk refund + notify** | Done — cancel refunds every succeeded ticket (idempotent `refundTicket`) + emails attendees; behind the host/admin gate + a first-cancel transition guard | `admin/events/actions.ts`, `lib/email.ts` |
| ✅ ~~P1~~ | **Public/unlisted event RLS** | Done — visibility-aware SELECT policy (applied to prod) + app-level gate on the detail page + listable-only browse filter. ADR-202 | `20260612000000_events_visibility_rls.sql` |
| 🟠 **P1** | **Owner go-live configs** | Remaining owner-side: Stripe Connect payouts (`host_payouts_enabled`), `RESEND_WEBHOOK_SECRET`, enable Auth leaked-password protection, review whether anonymous sign-ins should be off. **Advisors run 2026-06**: the one fixable security class (20 mutable-search_path functions) is pinned (applied to prod); remaining lints are INFO/by-design (service-role-write-only tables) or deferred perf tuning (RLS initplan ×59, permissive-policy consolidation ×92, FK indexes ×38 — all pre-launch noise) | owner / env |
| ✅ ~~P2~~ | Journey depth-tier UI (Initiate/Adept/Master) | **Audit false positive** — already built + live (`TierControl` wired in `/journeys/[slug]`, `setMyJourneyTierAction`, `resolveTier` chain, 17 tests, 48 seeded tiers; tier names renamed to canon by migration `20260613000020`). The journeys-audit findings were read from JOURNEYS.md (marked "planned") but the code shipped them — **verify journey items against code before building** | done |
| ✅ ~~P2~~ | Circle-scoped challenges model | Done — a host adopts a global `season_challenge` for the circle to do **together**; the CircleQuest Challenges column shows collective progress ("N of M members done") and members completing it credit the circle's Circle Current (collaborative, ADR-201). New `circle_challenge_adoptions` table (applied to prod) | `lib/circles/challenges.ts`, `circle-challenges`, `admin-actions.ts` |
| ✅ ~~P2~~ | Practice backlinks ("used in these journeys/circles") | Done (#489) | `app/(main)/practices/[id]` |
| ✅ ~~P2~~ | Plus-ones + "maybe" RSVP controls | Done (#489) | event RSVP form |
| ✅ ~~P2~~ | Library "Propose to Library" + review queue | **Audit false positive** — fully shipped: `ProposeToLibraryButton` on owned practices/journeys, `/library/review` queue (Host/Guide+ gated, approve/reject), linked from the Library header with a pending-count badge | `/library/review` |
| ✅ ~~P2~~ | Extend Settings panel to events/channels/people (PX.5) | Done — events/hubs/nexuses already had modules; added **ChannelSettingsModule** (staff-only, `channel.manage`) and **PersonSettingsModule** (janitor-only moderation surface) to the page admin dock | `page-admin-bar`, `admin/modules/*` |
| ✅ ~~P3~~ | Font-token cleanup | Done — zero `text-[10/11px]` remain (bulk in #489; stragglers in QR module, season-progress, rail panels swept after) | — |
| ✅ ~~P3~~ | Per-section Suspense on `/events` · per-event OG image · `offers` in eventSchema · distance facet | Done — "For You" lane streams behind `<Suspense>` (shell no longer waits on embeddings/AI); dynamic OG image at `/discover/events/[slug]/opengraph-image`; `offers` + honest `isAccessibleForFree` from `price_cents` (public RPCs updated, applied to prod); "Distance" facet from the viewer's fuzzed home geocell → hosting-circle coords (hidden without a home location) | events |
| 🔵 **Deferred** | SMS reminders (EIN/Twilio/A2P) · post-event recap album (`event_posts` unused) · duo-streaks/reciprocity/bridge-badge metrics | Owner decisions / later waves | — |

## 🔎 Full-site sweep — 2026-06-10 (post naming-canon · journeys-icons · economy-CRUD · contacts-merge)

Three-lens sweep (security/dead-ends · SEO/AIO · infra/migration-drift) after the day's ships
(#497, #503, #506, #508, #511, #514, #515, #516). **Verdict: clean. No broken routes, no orphans,
no critical security holes.** Owner/config items (Stripe Connect, VAPID, Resend webhook, the auth
leaked-password toggle, anonymous-sign-ins decision) are tracked elsewhere and deliberately **omitted
here** — this is the *buildable* backlog only.

**Shipped today:** ✅ Reward-economy **add/edit/delete** CRUD in `/admin/gamification` (#514) · ✅ Journeys
**lucide icon faces** (no emoji) + cleaner index (#511) · ✅ Network **member-counts on the tab row** +
**My Contacts** header standardized (#515) · ✅ **Contact ↔ Community merge** — detect/alert/merge +
private profile card (#516, migration `20260610060000`).

**Buildable backlog the sweep surfaced** (ranked; owner-config excluded):

| Pri | Item | Why | Where |
|---|---|---|---|
| **P-SEO.1** | **Enrich `public/llms.txt`** with a first-party **Frequency Stats** block (WAM, circle count, top practices, return-rate) | CONTENT-VOICE §8c — original data is the AIO citation lever; `llms.txt` is currently bare | `public/llms.txt` (+ a tiny stats read) |
| **P-SEO.2** | **Public `/discover/practices`** (list + detail, HowTo/Article JSON-LD) | Practices are high-intent search terms (breathwork, meditation…) with **no public mirror** — the one missing discover surface | new route + `public_practices()` RPC |
| **P-SEO.3** | **Dynamic OG images** for marketing pillars + discover detail (`/the-lab`, `/the-community`, `/the-quest`, `/discover/circles/[id]`, `/discover/journeys/[slug]`) | Only 1/23 public routes has a content OG image; the rest fall back to the generic root card | reuse the event OG template |
| **P-SEO.4** | **Schema gaps:** Circle schema on `/discover/circles/[id]`, Person on event organizer, Article/Course on journeys | Rich-result + AIO coverage; Event/HowTo/ItemList already strong | `lib/jsonld.ts` |
| **P-SEO.5** | **Seeker-track article layer** (5 pain-first pillar pieces, FAQ schema, internal links) | CONTENT-VOICE §7a clusters specced, none published — the primary organic-discovery channel | `/help/*` or new `/blog` |
| **P-SEC.1** | **RLS perf debt:** wrap `auth.uid()` → `(select auth.uid())` (advisor `auth_rls_initplan` ×59) + consolidate `multiple_permissive_policies` (×92) | Per-row re-eval at scale; pre-launch noise but a clean, mechanical migration | RLS policies |
| **P-SEC.2** | **Index hygiene:** add covering indexes for `unindexed_foreign_keys` (×39); review/drop `unused_index` (×130, carefully) | Advisor perf; FK indexes are safe wins | migration |
| **P-SEC.3** | **Rate-limit `requestBetaAccess`** (open signup, no throttle) + tighten `public_bucket_allows_listing` on avatars/posts/event-media/site-media | Abuse surface; object-name enumeration | `beta/actions.ts`, bucket policy |
| **P-SEC.4** | **CSP report-only → enforce** (nonces) · remove `as unknown as SupabaseClient` casts now types are regenerated · purge retired `'crew'` role refs (`@deprecated`) | Hardening + tech-debt the regen unblocked | `csp`, lib casts, `roles.ts` |

> Migration note: prod's `schema_migrations` versions are stamped at apply-time (MCP) so they differ
> from the repo filenames (e.g. canon batch `20260613*` files ↔ `20260610*` applied), but **every repo
> migration is applied by name** — no unapplied drift. Cosmetic; a `migration repair` would re-align.

## The headline

The platform is **substantially built** — member surfaces, the practice engine + gamification,
the CRM/marketing suite, and the onboarding/Vera/AI stack are largely complete and wired. The
real work is two things: **(1) the role & permissions system** the owner just designed — *one
site for everyone, function-gated per role* — and **(2) the money layer** (entitlement + billing
+ partner suites). Everything else is targeted gap-fill and hardening.

## Priority ladder (the spine — work top to bottom)

| Rank | Track | Delivers | Size | Status |
|---|---|---|---|---|
| **P1** | **Permissions & Roles** | One site, function-gated per role (the matrix) | XL | ✅ matrix+menu+nav synced to sheet; scope edge-cases ⏳ |
| **P2** | **Entitlement & Billing** | Free → Member → Supporter + Stripe; the ✋ gates go live | L | ✅ live (Supporter + lifetime rank); Connect binding blocked on owner setup |
| **P3** | **Partners** | Collaborator · Practitioner · Business · Organization + Hook | XL | ⏳ personas + verification + listings done; Hook/paywalled left |
| **P4** | **Platform completion** | The concrete stubs the sweep found | M | ⏳ few small gaps (4.2/4.8/4.9) |
| **P5** | **Member · Practice · Operator depth** | The feature-depth backlog | L | ⏳ |
| **P6** | **Onboarding / Vera / AI / Capture** | Finish the last-mile activation items | M | ⏳ (AI core largely built via PI) |
| **P7** | **Navigation & IA** | Collapse sprawl into dashboards; data-driven nav | L | ✅ 4-section menu + matrix-driven nav (this session) |
| **P8** | **Infra · Data · Security · Hardening** | Migrations, RLS Phase 2, CI gates, scale ladder | L | ⏳ hardening |
| **PI** | **Intelligence & Activation Engine** | Wide behavioral capture → feature store → AI site-improvement loop → retroactive rewards | XL | ✅ all 5 layers built (PI.1–PI.5) |
| **PX** | **Extension opportunities** | Extend the new seams (Settings panel · content registry · per-page QR · Circle Quest) | S–M | 📋 high-leverage next steps (see §PX) |
| **PM** | **Money verticals** (gated) | Collective · Affiliate · Donations · Lab Spaces | XL | 🔴 after PMF |

**Outpost is parked** (owner direction) — tracked in ROLES.md/§11.5 but not scheduled.

## Progress log

- **2026-06-10 ✅ Contact ↔ Community merge** — a logged contact (`network_contacts`) and the member
  profile that is the same human are now reconciled: detect by hard signal (email / phone, via the
  `find_contact_matches` SECURITY DEFINER RPC, migration `20260610060000`), alert on `/network/contacts`
  with Merge/Dismiss, link via `linked_profile_id` (your logged fields + notes untouched; the live
  profile fills the card; an **On Frequency** badge shows), and surface a **private contact card** on the
  member's profile that only the owner who merged sees. `lib/connections/matching.ts` + UI islands. (#516)
- **2026-06-10 ✅ Reward-economy CRUD** — `/admin/gamification` reward editor gained **add + delete**
  (was edit-only): define a new `action_type` (normalized, dup-guarded), remove one (ledger rows
  untouched). Gate moved to the staff axis `isJanitor(webRole)` (ADR-208). Changes stay live-immediately
  (the award engines read `zap_config`/`gem_config` at grant time). (#514)
- **2026-06-10 ✅ Journeys: lucide icon faces + cleaner index** — retired the freeform emoji "face" for a
  curated 24-icon lucide set (`lib/studio/journey-icons.ts`); the key rides the existing `emoji` column,
  `JOURNEY_ICON_MAP` resolves legacy emoji so existing journeys keep a face with no backfill. Studio
  identity kit (`IconAccentFace`/`IconGrid`), builder + launcher, index + detail all render the icon;
  two side-by-side entry cards on the index. (#511)
- **2026-06-10 ✅ Network header pass** — Community member counts moved onto the tab row; `/network/contacts`
  title standardized to **My Contacts** with a Contact icon (matching the Community header). (#515)
- **2026-06-13 ✅ Naming Canon 2026 (ADR-208)** — locked the platform vocabulary in
  [`NAMING.md`](NAMING.md) (the single source of truth) and aligned the schema to canon: **Pillars**
  (`pillars`, `topical_channels.pillar_id`), depth tiers **Initiate/Adept/Master**
  (default Adept), season ranks **Echo/Signal/Beacon**, **Circle Current**
  (`circles.season_current`, `circle_current_transactions`), **Co-op**, and a
  two-axis role split (`profiles.web_role` alongside `community_role`) — see NAMING.md for the full
  rename map. Migrations `2026061300*` (data-preserving, idempotent); thresholds/economy/RLS substance
  unchanged. Also retired: the legacy action-chain engine (dropped, ADR-152), and the prior Quest/tier/
  currency phrasing now superseded by canon. Technical docs rewritten to canon this pass.
- **2026-06-09 ✅ Page Settings panel on every page** — the on-page operator editor: `page-admin-bar` rendered by the templates (PageHeading/DetailTemplate) via `PageAdminProvider` (`page-admin-context`). One "Settings ▾" surface that composes the content editor, per-page QR, and circle-rail order — each gated by capability so a non-manager sees nothing. The pattern the next three items hang off.
- **2026-06-09 ✅ Site-wide editable page content (ADR-180/182)** — operator-tunable header (title + description) per route, additive over the coded fallback (`resolvePageContent`). Now wired SITE-WIDE via the single `CONTENT_EDIT_ROUTES` registry (`lib/layout/editable-content.ts`) across **/network · /circles · /channels · /events · /market · /messages · /journeys · /practices · /library · /broadcast** (`/feed` excluded — personalized greeting). To add a page: one registry line + a `resolvePageContent` read.
- **2026-06-09 ✅ QR per-page folders (ADR-179)** — `qr_codes.page_path` is the folder key; `PageQrManager` (compact StyleEditor `compact`+`controls` variants) creates a QR *from* a page in the Settings panel; QR Studio groups codes into per-page folders + an "Unfiled" group.
- **2026-06-09 ✅ Circle rail order + permalink + Circle Quest (ADR-181)** — `circles.sidebar_order` (NULL = coded default) arranged by a drag-and-drop `SidebarWidgetEditor`; `updateCirclePermalink`/`saveSidebarOrder` gated on `circle.editSettings`. `CircleQuestModule` replaces the old practice-only module — picker **plus** the circle's adopted journeys/practices/challenges (challenge model currently empty → extension below).
- **2026-06-09 ✅ Founder's First Week config centralized (ADR-184)** — `lib/onboarding/founder-config.ts` is the single edit point (reward gems/badge · Vera coach copy · page copy · the six tasks); `founder-tasks.ts`/`founder-actions.ts`/`layout.tsx`/`founder/page.tsx` all read from it. Badge seeded by `20260606170000_founders_first_week_badge`.
- **2026-06-09 ✅ Onboarding edge tabs + Next-Steps popup** — `edge-pill` tabs tucked into the margins (icon-only at rest) + the `chores-overlay` coach popup redesigned (only "Don't show till tomorrow").
- **2026-06-09 ✅ Admin guard redirects home, not 404 (ADR-183)** — `requireAdmin`/`requireAdminFloor` redirect an unauthorized viewer (logged-out → `/`, insufficient role → `/feed`) instead of `notFound()`. Nav fix: `/admin` root matches **exactly** in `app-shell` `isActive`, so a deep admin sub-route highlights only its own rail item.
- **2026-06-09 ✅ Live-DB migration reconcile (ADR-185)** — a batch merged without being applied was applied this session: `page_content` · `qr_page_folders` · `circle_sidebar_order` · `founders_first_week_badge` · `training_paths` · `connect_accounts` · `tips` · `event_tickets`. Process gate added (CHECKLIST §"Standing deploy gate") so it doesn't recur.
- **2026-06-08 ✅ "Ask Vera before you file"** — the support-deflection intake: the member report dialog gets an **Ask Vera first** button that runs their question through the grounded help RAG (`askHelp` → `answerHelpQuestion`, logged as a demand signal). If Vera answers, the member closes with a "That solved it" — no ticket filed; otherwise it folds into "Send to the team". Cuts ticket volume on the intake side, completing the support loop with the operator-side AI draft/triage. 443 tests green.
- **2026-06-08 ✅ AI ticket triage** — an **AI triage** button in the support console: `suggestTriage` (host+) has Claude classify the ticket and **set its priority** (low/normal/high/urgent) with a one-line reason; budget-gated with a keyword-heuristic fallback when AI is off. Completes the virtual-staff support trio (draft · ground · triage).
- **2026-06-08 ✅ Agentic support (AI draft, help-grounded)** — an **AI draft** button in the support console (`/admin/support/[id]`): `draftReply` (host+) has Claude draft a warm, on-tone reply from the ticket thread **grounded in retrieved help articles**, returned to the agent to **edit and send** (never auto-sends). Grounding uses a new non-logging `retrieveHelpChunks` (extracted from the RAG path; DRY), so drafting doesn’t pollute the help-gap demand signal. Budget-gated (`support-draft`) with a deterministic fallback. The "virtual staff fields support through Claude" vision (ADR-167). 443 tests green.
- **2026-06-08 ✅ P8 (CI gate)** — added `.github/workflows/ci.yml`: typecheck (`tsc --noEmit`) + lint (`eslint`) + tests (`vitest run`) on every PR to main + pushes, with pnpm cache + concurrency cancel. The Vercel build never ran the suite; now a red PR is caught before merge. No app secrets needed (tsc/eslint/vitest don’t touch env). `pnpm lint` is clean repo-wide; 443 tests green.
- **2026-06-08 ✅ Roles/permissions + menu (owner sheet)** — synced `lib/core/access-matrix.ts` to the owner CSV exactly (full-grid conformance test, all 30×13 cells) and rebuilt the left-nav into the sheet’s four sections — **Community · The Quest · Studio · Platform** — in the exact item order/labels. Message Boards → Messages; Website / Hook Network / Studio-Finances / Financial-Dashboard / Status are gated **Coming-soon** stubs; the Quest dashboard is now member-full (only the Vault stays paid-gated). Each nav item carries its `surface` (the matrix seam). 443 tests green. *Nav visibility floors are reviewable in the preview (open decision: structure mgmt → Admin-only).*
- **2026-06-08 ⏳ PI.5 (retroactive rewards)** — the final PI layer (ADR-168, migration `20260608110000`): a governed reward-rule registry (pure predicates over the durable history — lifetime rank, feature-store traits, tags, tier) + an idempotent **claim-then-pay** batch evaluator that grants once against the immutable history (the reward lands in the gem/zap ledgers; `reward_grants` unique guard makes re-runs safe). `/admin/rewards` previews pending grants (dry-run) and grants them one-click. v1 ships 5 gem rules (e.g. *ever reached Beacon → 200 gems* — Beacon is the rank formerly named Agent, ADR-208). 415 tests green. **Completes the engine: capture → feature store → predictions → AI Studio → retroactive rewards.**
- **2026-06-08 ⏳ PI.4 (AI Studio — increment 1)** — the AI Intelligence Studio is live (ADR-167, migration `20260608100000`): `/admin/studio` (Admin/Janitor) turns the banked signal — feature store + PI.3 predictions + interaction-surface rollups + **support tickets + help-gaps** — into **ranked, evidence-backed recommendations**, with Claude narrating the summary (deterministic fallback). The safety core is a **governed allow-list** of reversible, audited, role-gated site actions (`reindex_help`, `set_flag`) an operator applies one-click — the AI can only ever propose a registered action, never an arbitrary backend mutation. Every change logs to `studio_site_changes` with one-click revert. 407 tests green. Ties support pain → recommendation → applied fix (the "virtual staff" loop); agentic support replies + experiment-spawn are the next increments.
- **2026-06-08 ⏳ PI.3 (predictive traits)** — the prediction layer is live (ADR-166): a new `predicted` trait kind + `churn_risk` / `activation_propensity` / `next_best_action`, computed nightly by heuristic rules over the feature store (lifecycle + RFM + engagement-depth). The trait refresh now merges the ledger + interaction views per member so ledger/behavioral/predicted traits all derive from one consistent picture. Pure compute unit-tested; 398 tests green. Heuristic v1 behind stable keys — a model/Claude-graded path swaps in later. Feeds Vera nudges, campaigns, and PI.4/PI.5.
- **2026-06-08 ⏳ PI.2 (feature store)** — the firehose now feeds the durable feature store (ADR-166, migration `20260608090000`). 8 registry-declared behavioral traits (interaction volume/active-days/surfaces/dwell-minutes/sessions/scroll-depth/last-interaction + an `engagement_depth` band) computed from a new `member_interaction_stats` RPC and merged into `member_traits` by the existing nightly trait refresh; a `interaction_surface_stats` RPC gives the per-surface site-level rollup for PI.4. Pure compute is unit-tested; 394 tests green. The clean per-member aggregate the AI + reward engine read (never the raw firehose).
- **2026-06-08 ⏳ PI.1 (wide capture spine)** — the raw behavioral firehose is live (ADR-166, migration `20260608080000`): `interaction_events` (wide + jsonb-extensible, append-only, retention-bounded) + a batched client buffer (`observe()` → sendBeacon flush) + the consent-gated `/api/observe` batch sink + `ObserveProvider` auto-capturing view/dwell/scroll-depth/rage-click/visibility, mounted beside `PageViewTracker`. The semantic `engagement_events` pipe is unchanged; this is its high-volume twin. 90-day raw purge wired into the retention cron. 391 tests green. *The un-retrofittable "capture wide now" piece — banking history before PI.2–PI.5 read it.*
- **2026-06-08 ✅ P2.7 (verification half)** — partner persona claims now run a real, staff-gated ladder (ADR-165, migration `20260608070000`). Self-serve **claim** lands in *pending review* (no longer an instant tool unlock); a `profiles`-domain operator (or janitor) runs **verify → activate** from the new `/admin/personas` queue, with suspend/reinstate, allow-map-validated transitions, and an audit trail (`verified_by/at`). `getActivePersonas` now lights surfaces on verified/active only. The per-persona Stripe Connect binding stays stubbed until Connect is configured. 384 tests green.
- **2026-06-08 ✅ P2.6 (lifetime rank)** — the locked, never-resetting **peak rank** (`profiles.lifetime_rank`, ADR-164, migration `20260608060000` applied + backfilled). The zap trigger ratchets it (`GREATEST(lifetime_rank, current_season_rank)`); `reset_season()` locks it from the final rank before wiping the season (catching manual Luminary) and leaves it untouched after. Surfaced on the member's Vault (Store widget + ledger headline); `lib/season-ranks.ts` mirrors the enum order (`RANK_ORDER`/`higherRank`, tested). *Remaining P2.6:* entitlement sources beyond `membership_tier` (comp/Lab/staff grants — speculative beta infra).
- **2026-06-08 ✅ P2.2–2.5 (Stripe membership + Supporter)** — the env-gated Stripe layer is the membership rail: `/upgrade` + `/settings/billing` are a real checkout/manage flow (inline price + success-redirect confirm + webhook), the ✋ gates already read the tier. **P2.4 Supporter** (this round): pay-more tier wired end-to-end — `STRIPE_SUPPORTER_AMOUNT` (default $25), a "Become a Supporter" CTA on `/upgrade`, tier-aware billing confirmation, and a reusable `SupporterBadge` endorsed on the profile header.
- **2026-06-08 ⏳ P3.1 (Partners foundation)** — `profile_personas` table (applied) + `lib/personas.ts` reader threaded into `getViewerHats` (the matrix's partner columns now activate per active persona; closes PB.1f) + self-serve `/partners/join`. 43 core tests green.
- **2026-06-08 ✅ Admin in the framework + view-as for Host+** — `AdminPage` promoted to a first-class `AdminTemplate` (composes the shared `PageHeading`); all 20 admin pages adopt it unchanged. The "view as a role under you" selector, previously janitor-only, now works for **every steward Host and above** (downgrade-only, scoped to roles beneath them) — `lib/view-as.ts` `canViewAs` + the control/action. (Owner directive: no separate "admin mode" — admin functions inline + role view.)
- **2026-06-08 ✅ PB (framework dialed)** — PB.1 access control unified (one `isPaid(tier)` predicate; beta-grant regression fixed). PB.2 page framework: genuine primitive-cobbling fixed (`StatInline` dedup; `/support`+`/growth` recomposed; `/crew`+`/broadcast` headers → `PageHeading`); the rest already compose the kit or are sanctioned-rich detail headers (PB.2d). Tails tracked: PB.1i (`isEndorsed`→tier via feed RPCs), PB.1f/g/h, remaining `Stat` variants.
- **2026-06-08 ✅ model correction + audits** — Crew = the paid membership tier (migration `20260608050000`, values `free|crew|supporter`); ROLES.md vision rewritten. Two best-practice audits (access-control · page-framework) folded into track **PB** — no security holes, no `text-[Npx]`; main work = unify "is paid" to the tier + re-compose ~26 hand-rolled pages.
- **2026-06-08 ✅ P2 (decouple, §11.2)** — paid is now the **tier only** (removed the role≥crew proxy from `columnsForHats`); stewards (host+) get full on steward surfaces via their role, not payment; `/upgrade` sets `membership_tier` (Crew = pure stewardship). Backfill means no current user loses access. *Follow-up policy: auto-comp leaders' membership on promotion?* PR #411.
- **2026-06-08 ✅ P2.1 (live)** — `membership_tier` migration **applied** to the DB (backfilled: 10 paid / 1 free); read path flipped from the crew proxy to the real column (`lib/auth.ts` → `getViewerHats` → `deriveTier`). The entitlement is now real.
- **2026-06-08 ⏳ P2.1 (foundation)** — `deriveTier` + `lib/core/entitlement.ts`; `getViewerHats` sets `tier`; migration `20260608040000_membership_tier.sql` authored (⚠️ apply pending). Behavior-preserving. PR #410.
- **2026-06-08 ✅ P1.3 (rollout)** — centralized the scattered `['crew',…]` paid-proxy into `isPaidViewer()` across `/crew`, `/circles/[slug]`, `/events/[slug]`, `/codes`. One matrix-backed source. PR #410.
- **2026-06-08 ✅ P1.3 (pilot)** — `lib/core/viewer-hats.ts` seam + Vault/Store wired to `surfaceAccess('vault')`. The unified-site pattern is established. PR #410.
- **2026-06-08 ✅ P1.2** — Scope re-validation on structure/event mutations + `assignRole` escalation closed (`app/(main)/admin/actions.ts`). PR #410.
- **2026-06-08 ✅ P1.1** — Access matrix encoded (`lib/core/access-matrix.ts`, 18 tests, tsc+eslint clean). PR #410.
- **2026-06-08 ✅ docs** — Master list, ROLES.md access matrix + unified-site principle, ADR-163.

---

## P1 — Permissions & Roles  (the headline)

> Spec: [ROLES.md](ROLES.md) (three systems + entitlement, the **access matrix**, the
> **unified-site principle**) + ADR-163 + [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) §11.
> Foundation already exists: `community_role` ladder, the staff capability matrix
> (`lib/core/staff-roles.ts`), the 32-area `NAV_AREAS` grid + janitor-editable `area_permissions`.
> The shift: **route-level gating → per-capability gating inside shared pages.**

| # | Item | Status | Notes |
|---|---|---|---|
| **1.1** | Encode the matrix as one source of truth | ✅ | `lib/core/access-matrix.ts` — `accessTo(surface, hats) → none/limited/full`. Done. |
| **1.2** | 🔴 **Security: re-validate scope on mutation** | ✅ | Structure/event mutations now re-resolve per-scope leadership (`requireScopedManage`); `assignRole` privilege-escalation closed (janitor/owner/staff-roles only). Done. |
| **1.3** | Unified-site refactor | ⏳ | ✅ Vault/Store + the scattered `['crew',…]` paid-proxy across `/crew`, `/circles/[slug]`, `/events/[slug]`, `/codes` now route through the matrix (`isPaidViewer` / `surfaceAccess`). ✅ **In-page admin advanced this session:** the **page Settings panel** (`page-admin-bar`) now puts content-editing · per-page QR · circle-rail order **on the page** (the "collapse `/admin/*` into in-page controls" direction). **Remaining:** open the member-facing ✋ surfaces per the sheet (Studio Overview, Personal CRM, QR Studio — a deliberate access change) + continue migrating remaining `/admin/*` management into in-page Settings (IA-RESTRUCTURE §10). |
| **1.4** | Scoped stewardship (`stewardships` table) | ⏳ | §11.1 — **Foundation shipped** (ADR-218, additive/behavior-preserving like 2.1): `stewardships` edge table `(profile·role·scope·state)` + derived `profiles.community_level` cache (floored by `community_role`, kept fresh by trigger); backfilled from `circles.host_id`/`hubs.guide_id`/`nexuses.mentor_id`; pure derivation `lib/core/stewardship.ts` (+ tests) + reader `lib/stewardships.ts`. Migration `20260614100000` **apply pending**. **No read path flips yet** — `getViewerHats`/`load-capabilities`/`requireScopedManage` still read the FKs + `community_role`. *Remaining:* the resolver reads edges (a scoped host lights Host surfaces only in-scope) — lands with **1.6**. |
| **1.5** | Admin axis formalization | ✅ | §11.3 (ADR-223) — `team_members` formalized as the single staff source: the System-3 **super-ladder** is named in code (`SUPER_STAFF_ROLES`/`isSuperStaff`: owner=Executive/Janitor, admin=Site Admin), no schema change needed (the `20260606000100` CHECK already holds all 7 roles). **Missing staff-domain unlocks added** — Support + Members roster via the `members` domain (owner/admin/operations/support), Vera via `insights`. The bespoke host-only `/admin/support` inline guard swapped to `requireAdmin('host', { staff: 'members' })`, matching its nav link; the Members page guard aligned to `requireAdmin('janitor', { staff: 'members' })`. **Access note:** both swaps are additive supersets (host+ now joined by `members`-write staff) — no one loses access. Unit tests cover the unlocks + unchanged grants. |
| **1.6** | Unified capability resolver | ⏳ | §11.6 — one resolver = union of Community edges ⊕ Entitlement ⊕ Partner personas ⊕ Admin matrix. **PR 1 — foundation shipped** (ADR-220, additive/behavior-preserving): the per-scope resolver (`capabilities.ts`) reads `stewardships` edges via a `leadsScope` predicate **OR'd with the leader FK** (provably a no-op on the backfill data — every FK has a matching edge; scope-isolated by construction); edges fetched once/request in `load-capabilities.ts`; parity test locks no-behavior-change; `requireScopedManage` re-bases for free. **PR 2 — scoped surfaces shipped (additive)** (ADR-221): `community_level` threaded through `auth.ts` (view-as floors it); `getViewerHats` sources community standing from the derived level via `communityStanding` (a no-op for member…mentor, `max`-guards a global admin/janitor's column); `surfaceAccess`/`canUseSurface` take an optional `scope` and elevate the in-scope standing for an edge-leader (circle⇒host/hub⇒guide/nexus⇒mentor) so a global-member edge-leader gains the in-scope surfaces; the `load-capabilities` parent-walk loosened with an OR so a guide/mentor EDGE (any scope) also triggers the walk (FK **or** edge confirms the specific parent). **The `community_level` floor (ADR-218) protects global roles — nothing regresses; strictly a superset of today.** **PR 3 — scoped-surface adoption shipped (additive)** (ADR-225): the circle / hub / nexus detail pages now PASS their `scope` into `surfaceAccess('insight', { type, id })`, so the ADR-221 seam actually fires — a global-member edge-leader sees the in-scope **Insight** view at the matrix depth (Host ⇒ limited basic health; Guide/Mentor ⇒ full analytics); pure presentation helper `lib/core/scoped-surface-ui.ts` (+ test). `/admin/insights` + `/admin/vera` stay global; scoped Vera deferred (no UI yet). Org-tenant isolation satisfied by absence (no tenant infra yet — deferred until Hook tenancy). |
| **1.7** | Per-function permission grid | ⏳ | **Built** (ADR-222, migration `20260614300000` **apply-pending**): `/admin/roles` now edits permissions at the **capability** level, not just per-route. New `capability_permissions` table is a sparse OVERRIDE store over the ADR-127 staff `CAPS` matrix (precedence **override > code-default**); `resolveStaffAccess`/`staffCan(…, overrides?)` layer it in (pure, parity-tested — empty override == today). `getCapabilityOverrides` threads it into the **live** gate (`requireAdmin`/`requireAdminFloor`/`authorizeAction`) so a denied capability actually blocks entry + mutations. Janitor-only `CapabilityGrid` panel (domains × staff roles, click to cycle none→read→write). RLS mirrors `area_permissions`; route-grid untouched (additive). |
| **1.8** | Role-advancement training Journeys | ⏳ | §7 — assignment-on-promotion ✅; curriculum (7.3–7.5) ✅ full ladder member→host→guide→mentor (registry + pure selectors, ADR-224); help-article `role` tagging ✅ (front-matter + loader, additive); authoring surface ✅ read-mostly `/admin/content/training`. Remaining: in-place curriculum editor (write-through table) + per-step coachmark tours. |

## P2 — Entitlement & Billing

> The matrix's **✋ cells are the paid gate** (Vault · Studio Overview · Personal CRM · QR Studio).
> Billing was flagged a stub by **three** sweeps. Spec: §11.2 + DEVELOPMENT-MAP Stage C2/D2.

| # | Item | Status | Notes |
|---|---|---|---|
| 2.1 | Tier flag `free / member / supporter` | ✅ | Migration applied (backfilled); `profiles.membership_tier` threaded `getCallerProfile → getViewerHats → deriveTier` — the ✋→✅ gate is now driven by the **real entitlement column**. Remaining for P2: re-point `/upgrade` to set the tier; Crew → pure stewardship; cash-in eligibility. |
| 2.2 | Stripe membership layer | ✅ | Env-gated (`billingEnabled()`); `lib/billing/{stripe,checkout}.ts` + webhook (`checkout.session.completed` / `subscription.updated\|deleted` → `membership_tier`). Inline `price_data` fallback (no price ID needed) + `confirmCheckout` success-redirect fallback (works pre-webhook). Partner payouts/commissions still pending (2.7). |
| 2.3 | Stripe membership checkout | ✅ | Real `/upgrade` checkout + `/settings/billing` (manage/cancel via portal). Beta free toggle stays when keys absent. |
| 2.4 | Supporter badge | ✅ | Pay-more tier live — `STRIPE_SUPPORTER_AMOUNT` (default $25) inline price; "Become a Supporter" CTA on `/upgrade`; reusable `SupporterBadge` endorsed on the profile header. |
| 2.5 | Wire the ✋ gates to the tier | ✅ | Matrix-driven: `accessTo()` + `isPaid(tier)` gate Vault · Studio · Personal CRM · QR Studio (the ✋ cells read the real entitlement column). |
| 2.6 | Freemium Vault + season cash-in | ⏳ | Accrual (zap/gem ledgers) ✅, season `zaps → gems` conversion ✅, persistent Vault + "how you earned" log ✅. **Lifetime rank** ✅ — locked monotonic peak (`profiles.lifetime_rank`, ADR-164/migration `20260608060000`): zap trigger ratchets it, `reset_season()` preserves it, surfaced on the Vault. *Remaining:* entitlement **sources** beyond `membership_tier` — host comp-grant / Lab rollup / staff grant (ADR-037 §6c/d; speculative beta infra). |
| 2.7 | Persona verification + Connect binding | ⏳ | **Verification half** ✅ (ADR-165, migration `20260608070000`): the `profile_personas` ladder is real — claim → *pending review* → staff **verify** → activate (suspend/reinstate), validated by `canStaffTransition`; surfaces light on verified/active only; audit trail (`verified_by/at`, `updated_at`); admin queue at `/admin/personas` (janitor / `profiles`-staff). *Remaining:* per-persona **Stripe Connect binding** (the money gate at `active`) — stubbed until Connect is configured. |
| 2.8 | Module registry + inter-entity Lab bridge | 📋 | Verticals self-declare (ADR-033); audited for-profit↔Foundation transfers (ADR-038). |

## P3 — Partners (personas + Hook federation)

> Self-serve account personas, multi-select hats. Spec: §11.4 / §8 + [ROLES.md](ROLES.md) System 2.

| # | Item | Status | Notes |
|---|---|---|---|
| 3.1 | `profile_personas` + per-persona dashboards | ⏳ | ✅ **foundation:** `profile_personas` migration (applied) + `lib/personas.ts` reader threaded into `getViewerHats` (matrix partner columns now activate per active persona) + self-serve `/partners/join` claim. ✅ **3.2:** `/crm` + `/growth` open to Business/Org personas. ✅ **3.3:** Business/Org self-serve **directory listing** (`/partners/listing` → the `/partners` directory). ✅ **3.4:** Collaborator featured directory (`/partners/collaborators`). **Remaining (mostly need Stripe/infra):** website builder · Hook sub-community · Collaborator affiliate kickbacks · Practitioner paywalled Programs. |
| 3.2 | Collaborator | 📋 | Featured Practices/Journeys directory + influencer/affiliate kickbacks + Earnings view. |
| 3.3 | Practitioner | 📋 | Paywalled Programs + client gamification + private Channel/Circles (Frequency-branded) + Connect. |
| 3.4 | Business | 📋 | Listing + network integration + loyalty + CRM + **website builder** (Studio › Website stub). |
| 3.5 | Organization + Hook federation | 🔴 | XL — white-label sub-communities; identity link + Hook membership rollover (§8.1); points rollup, idempotent+capped (§8.2); community federation / lead-funnel bubble (§8.3); isolated tenant admin (ADR-158). |

## P4 — Platform completion (verified 2026-06-08)

> **Verification pass corrected the sweep:** several "stubs" were false positives — the
> sweep pattern-matched an `EmptyState`/`coming soon` *fallback branch* in code, but the
> feature is actually built/populated. Real, code-completable gaps are few.

| # | Item | Status |
|---|---|---|
| 4.1 | **Programs library** — ✅ **already built**: 4 frameworks live in `content/programs/`, page renders them (the "coming soon" is the empty-state fallback). Sweep false positive. | ✅ done |
| 4.3 | **Outreach member-send** — ✅ **completed**: `sendOutreach` fans a steward's direct note to the members of the scope(s) they lead, via the email+push spine. | ✅ done |
| 4.2 | Help-center articles — ✅ **expanded 2026-06**: 7 new member articles (season challenges · achievements · leaderboard · Circle Current · gem store · partners · location privacy), each verified against the code, + 2 extensions. 32 articles across 7 categories. Further coverage = ongoing authoring. | ✅ expanded |
| 4.9 | Nurture/Automations — per the operator audit these are **wired** (Nurture complete; Automations email-only). Add SMS/push actions + segment builder. | ⏳ |
| 4.8 | Library submission flow — ✅ **completed**: members get a status-aware **"Propose to Library"** control on their own practice (`ProposeToLibraryButton` → `submitToLibrary` → `status='pending'` → the existing leadership review queue → approve flips it public). Journeys already publish via the builder's "Share to community". | ✅ done |
| 4.7 | Founder task-assignment model — ✅ **done 2026-06 (ADR-205)**: circle-scoped claimable crew tasks (`circle_id`/`assigned_to`/`claimed_at`, applied to prod); real `openTaskCount` wired into `getCircleCapabilities`; race-safe claim; host panel + Crew-dashboard section. | ✅ done |
| 4.6 | `/hubs` + `/nexuses` index pages — **won't build**: the approved IA keeps Hubs/Nexuses **contextual** (reached via circle drill-down). Not a gap. | ✅ by design |
| 4.4 | Engagement physical sources (QR/NFC/geo/p2p) | 🔴 needs device/verification infra |
| 4.5 | Push notifications — needs **VAPID keys** + delivery config | 🔴 owner keys |
| 4.10 | Email metrics need the **Resend webhook** configured; donor flow needs design | 🔴 owner config |

## P5 — Member · Practice · Operator depth (the feature backlog)

**Member & Community** (BACKLOG §G/§H, STUDIO-REVIEW): Network hub unification (`/people`+`/connections`+`/marketing/contacts`) · ✅ directory filters (topic/location/role — ADR-204, on `/network`) · ✅ friend suggestions ("People you may know", real signals only — ADR-204) · circle-discovery map layer · circle lineage + "nearly full → seed a new circle" flywheel · multi-topic circles · hub/nexus-scoped events · two-way message inbox · richer profile header + privacy-safe public profile schema · (later) Postgres sync-engine pilot.

**Practice / Quest / Gamification** (BACKLOG §F): ✅ daily-streak achievement badges (2026-06 — `practice_streak` criteria over `profiles.current_streak`, evaluated on each log, pays zaps; 3 badges seeded: Week of Devotion 7d · Moon Cycle 30d · 100 Days 100d) · stage-driven disclosure (apply `stageIndex` to dashboard/profile/rails) · `practice.verified` host/peer verification + device attestation/P2P mutual-confirm · realtime reward feedback via Broadcast · Programs content depth (>4 frameworks) + program-as-template "Add to Circle" · community-library moderation + promote-to-tracked Journey · seasonal-Journey authoring surface + content (link to season + Pillar).

**Operator: Growth Studio / CRM / Marketing** (ONBOARDING-BUILD-LIST §9, BACKLOG §I): visual entry-point/flyer designer (9.2) · live QR style preview (9.3) · unified link generator (9.4) · lead-flow customization UI (9.6) · A/B builder + scheduled publish (9.7) · segment builder + Kanban pipelines + React-Email templates · per-campaign/automation performance drill-down · live Claude Studio operator (gated on consent harness) · funnel/acquisition/cohort analytics.

## P6 — Onboarding / Vera / AI / Capture

> Detail + status in [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md).

- **§0 Pre-test enablement (config, not code):** `ANTHROPIC_API_KEY`, flip `ai_enabled`, build help index, run pending migrations, prod env, verify funnel.
- **§1.5 live-loop suggestion chips** ⏳ · **§2.1 welcome post** ✅(tweaks) · **§2.2 finish `draft_intro`** ⏳ · **§2.3 memory summarization cron** 📋 · **§2.4 warm demo content** 📋 · Vera matriarch/coach tweaks ⏳.
- **§6 Capture Phases 2–4** 📋 (richer kinds; Quest pipeline + sponsor rewards) · journal framing (3.1).
- **§3 Proactive Vera** 🔴 gated on the consent harness (ADR-028) · **AI core** governance kernel (router, RAG, caps, kill switch) 📋.

## P7 — Navigation & IA

> [IA-RESTRUCTURE.md](IA-RESTRUCTURE.md) §10. The unified-site refactor (P1.3) and this converge.

- 10.1 Quest tabbed dashboard ✅ · 10.6 widget-free rail ✅ · 10.2 Marketing→Growth ✅ — **remaining:** 10.2 operator dashboards (`/admin` suites → Community Studio/Insights/Platform) · 10.3 Network hub · 10.4 Practices+Library merge · 10.5 Settings hub · 10.7 `NAV_AREAS` rewrite → later **data-driven Site Navigation admin suite** (BACKLOG §J).
- Polish: soften newcomer breadcrumb · milestone wake-up gating map · reconcile "Interests" vs "Topics" · "tune in" verb decision.

## P8 — Infra · Data · Security · Hardening (BACKLOG §A/§B/§C/§D/§I/§O)

- **Migrations/data:** ✅ **2026-06-09 reconcile** — a batch that merged without being applied to the live DB was applied (`page_content` · `qr_page_folders` · `circle_sidebar_order` · `founders_first_week_badge` · `training_paths` · `connect_accounts` · `tips` · `event_tickets`); a **standing deploy gate** (apply-on-merge, ADR-185) now lives in CHECKLIST so it doesn't recur. ✅ **2026-06-09 second verify** — `lock_economy_columns` (the `prevent_economy_self_edit` trigger) and `perf_indexes` (all 5 indexes) were **already live** in prod, and the zap ledger + `trg_after_zap_transaction` confirm the economy double-award / online-pay-zaps fixes are applied — those "pending" rows were stale. ✅ **quest engine dropped** — `/admin/quests` rebuilt as the Journey-Library manager (chain CRUD removed), the retire migration applied to prod (`quest_outcomes` RPC + the legacy action-chain engine gone, ADR-152), and types regenerated. ✅ **zap-award paths already collapsed** (stale row) — every grant flows through `awardZaps`/`awardZapsForAction` → one `zap_transactions` insert → `trg_after_zap_transaction` owns totals + rank; the only other ledger writers are the deliberate, audited janitor grant/revoke overrides (`economy-actions.ts`). *Remaining (decisions, not code):* resolve gem-farm / store-redeem TOCTOU / zap auto-promotion decisions.
- **Security:** ✅ **CSP (report-only)** + the `/api/csp-report` sink (next step: tighten + nonces → enforce) · RLS convergence Phase 2 (blocked on test harness) · ✅ **Stripe webhook replay/idempotency** (claim `event_id` before handling, migration `20260608120000`) · ✅ **rate-limit** `check-handle` · `search-handles` · `search` (Upstash sliding-window, 60/min/IP; fails-open + no-ops without the `KV_*` env) · ✅ **admin audit log** — unified `admin_audit_log` (+ `logAdminAction`) instrumented on the crown-jewel actions (role grants · partner verification), read at `/admin/audit` (admin+); complements the domain ledgers (`platform_flag_events` · `studio_site_changes` · `reward_grants`).
- **CI / quality:** ✅ gate `tsc`+`eslint`+`vitest` in CI (`ci.yml`) · ✅ Dependabot (`dependabot.yml`, grouped weekly) + CodeQL (`codeql.yml`, JS/TS security-and-quality) · *remaining:* enable secret-scanning push-protection (repo setting) · vitest consent harness · lint debt (`pnpm lint` is now clean repo-wide) · doc fixes.
- **Comms infra:** notification router/registry + migrate email/push onto the outbox queue · deliverability hardening (SPF/DKIM/DMARC subdomain) · verify `frequencylocal.com` in Resend + OAuth redirect URLs · submit sitemap/robots.
- **Scale (Phase 4, when measured):** paginate People/Circles · `force-dynamic`→ISR on CMS pages · profile zap-sum via SQL · `<img>`→`next/image` · Supavisor/read-replicas/denormalized feed read-model/partitioning/Broadcast realtime.
- **Design system:** unify pill/button radius (shared `Button`/`Badge` primitive) site-wide.

## PM — Money verticals (gated on PMF + legal entity)

Designed, sequenced after Stage C2: **D1 The Collective** (contributor verification → paid offerings → payout) · **D3 Affiliate** (referral → commission → payout ledger) · **D4 Donations & Grants** (Foundation rail) · **D5 Lab Spaces** (gym SaaS + Lab membership + rollup) · **Money foundation** (entity partition + `financial_transactions` ledger, ADR-029/032).

## PI — Intelligence & Activation Engine (track everything → AI-guided improvement)

> **Vision (owner):** *"Track everything a member does; have the AI studio recommend site changes
> for better member engagement, and build future rewards based on past behaviors."* The full spec
> is the **6th layer** of [MEMBER-DATA-PLATFORM.md](MEMBER-DATA-PLATFORM.md) (ADR-166). **We already
> own the spine** — `engagement_events` (append-only, idempotent), `member_traits`/`member_tags`,
> `segments`, the nightly rollup crons, `lib/experiments` (variant assignment + holdouts), the
> consent ledger, and the Vera/Claude kernel (router, budget, kill switch). This track adds the
> two things you **cannot retrofit** (raw width + immutable history), then *composes* the rest on
> what exists.

**The one rule that prevents re-developing later: capture wide and immutable NOW.** Every future
metric, reward, or model must be a *read* over data we already banked — never a backfill we can't
do. So PI.1 ships first, even before the AI can use it.

| # | Item | Status | Notes |
|---|---|---|---|
| PI.1 | **Wide interaction capture (the fire-hose)** | ⏳ | **Spine shipped** (migration `20260608080000`, ADR-166): `interaction_events` (wide, jsonb-extensible, append-only, host-read RLS) + batched client buffer `lib/analytics/observe.ts` (`observe()`, sendBeacon flush on interval/full/page-hide) + batch sink `/api/observe` (consent-gated, member-tied, service-role bulk insert) + `ObserveProvider` auto-capturing view · dwell · scroll-depth · rage-click · visibility. Retention-bounded (90d purge in the nightly cron). *Remaining:* explicit per-feature `observe()` calls (search/zero-result/form-abandon at the call sites), anon-session capture, per-kind sampling tuning. |
| PI.2 | **Member feature store (durable behavioral profile)** | ⏳ | **Built** (migration `20260608090000`): the firehose now rolls into the feature store. 8 registry-declared **behavioral traits** (`interaction_count_30` · `interaction_days_30` · `surfaces_touched_30` · `dwell_minutes_30` · `sessions_30` · `scroll_depth_avg` · `last_interaction_at` · `engagement_depth` band) computed by `computeBehavioralTraits` from the `member_interaction_stats` RPC and upserted into `member_traits` by the nightly refresh. Plus `interaction_surface_stats` — the per-surface site-level rollup (views/dwell/scroll/rage/reach) PI.4 reads. *Remaining:* near-real-time path for live signals; affinity vectors. |
| PI.3 | **Predictive traits** | ⏳ | **Built** — new `predicted` trait kind + 3 registry-declared predictions computed nightly from the feature store: **`churn_risk`** (low/med/high), **`activation_propensity`** (0–100), **`next_best_action`** (reengage/activate/join_circle/deepen/invite/none). Heuristic v1 (pure, unit-tested) over lifecycle + RFM + engagement-depth; the refresh now merges the ledger + interaction views per member so all three trait families compute from one picture. A model/Claude-graded path slots in behind the same keys. *Remaining:* LTV band (needs billing signals), model upgrade. |
| PI.4 | **AI Intelligence Studio (predict → recommend → apply → audit)** | ⏳ | **Built — increment 1** (ADR-167, migration `20260608100000`): `/admin/studio` (Admin/Janitor) reads the feature store + predictions + `interaction_surface_stats` + **the Support DB** (tickets + help-gaps) and emits **ranked, evidence-backed recommendations** (`synthesizeRecommendations`, pure/tested; Claude narrates the summary with deterministic fallback). The safety core: a **governed allow-list** of reversible, role-gated, param-validated site actions (`lib/studio/site-actions.ts` — `reindex_help`, `set_flag`) the operator applies one-click; every apply/revert is audited (`studio_site_changes`). The AI can never emit an arbitrary mutation. *Remaining:* experiment-spawn + lift measurement; more registered actions (publish help draft, promote segment, tune Vera); agentic support replies. |
| PI.5 | **Retroactive reward engine (future rewards from past behavior)** | ⏳ | **Built** (ADR-168, migration `20260608110000`): a governed **rule registry** (`lib/rewards/rules.ts` — pure predicates over the durable snapshot: lifetime rank, feature-store traits, tags, tier; e.g. the `seasoned_agent` rule [code key unchanged] = ever reached Beacon (the rank formerly named Agent) → 200 gems) + an **idempotent batch evaluator** that **claims-then-pays** against the immutable history (`reward_grants` unique `(rule, member)` backstop; reward lands in the gem/zap ledgers). `/admin/rewards` (Admin/Janitor): dry-run **preview** of pending grants + one-click grant. Re-running never double-grants. *Remaining:* zap-kind rules, tag/badge rewards, cron auto-run when trusted. |

**Sequencing:** PI.1 now (urgent, un-retrofittable) → PI.2 → PI.3/PI.5 in parallel (both read the feature store) → PI.4 last (it consumes all of the above). Most of PI.4–PI.5 is *composition* of existing primitives (experiments, segments, ledgers, AI kernel, idempotency); only PI.1–PI.2 need new data infra.

---

## PX — Extension opportunities (build *on* what just shipped)

> The 2026-06-09 session landed four reusable seams — the **page Settings panel**, the
> **content-edit registry**, **per-page QR folders**, and the **Circle Quest module**. Each is a
> small, high-leverage extension, not new infra. Ordered roughly by value/effort; pick from the top.

| # | Extension | Builds on | Status | Notes |
|---|---|---|---|---|
| PX.1 | **Content editor → hero/CTA, not just title+description** | `page_content` (ADR-180) + Settings panel | ✅ done (ADR-206) | Add optional `hero_image` / `cta_label` / `cta_href` columns + module fields; pages keep the coded fallback. The header is editable; the rest of the chrome should be too. |
| PX.2 | **Editable content → SEO metadata** | `resolvePageContent` (ADR-180/182) | ✅ done (ADR-206) | Feed the operator-set title/description into the route's `generateMetadata` (og/twitter + `<title>`), so an in-place edit also tunes search/share cards — no second editor. |
| PX.3 | **Per-page QR analytics in the Settings panel** | `qr_codes.page_path` (ADR-179) + existing `qr_scans` rollups | ✅ done | Surface scan counts / last-scan / top source for *this page's* codes inside `PageQrManager` (the data already exists in QR Studio — just scope it to `page_path`). Closes the create→measure loop on-page. |
| PX.4 | **Fill the Circle Quest challenge model** | `CircleQuestModule` (ADR-181) | ✅ done | Shipped as the circle-challenge adoption model (ADR-201): hosts adopt a global season challenge, the column shows collective progress, completions credit Circle Current. |
| PX.5 | **Settings panel → remaining entity types** | `page-admin-bar` / `PageAdminProvider` | ✅ done | Events already had a module; channels (`channel.manage`, staff) + people (janitor moderation) modules added — see the audit-table PX.5 row. |
| PX.6 | **Circle rail order pattern → other rail-bearing pages** | `circles.sidebar_order` (ADR-181) | 🔵 deferred | **Assessed 2026-06: no second consumer.** Circles are the only entity with a per-entity reorderable rail; every other route uses the global/scoped rail with fixed blocks. Generalizing now is speculative infra — revisit when a second rail-bearing entity needs ordering. |
| PX.7 | **Founder-config pattern → other milestones** | `founder-config.ts` (ADR-184) | ✅ convention | **Codified 2026-06:** any new milestone/quest ships as ONE config module (reward + copy + steps) that the code reads — `founder-config.ts` is the reference shape; circle-challenge constants (`CIRCLE_FIELD_CHALLENGE_AWARD`) and tier metadata (`tier-meta.ts`) already follow it. Enforced by review, not tooling. |

---

## PB — Best-practice cleanup & hardening (2026-06-08 audits)

> Two read-only audits (access-control architecture · page-framework consistency). Verdict:
> **the architecture is well-layered and there are no security holes** — the gaps are *semantic
> drift* (gating computed two ways) and *incomplete framework adoption* (cobbled pages).

### PB.1 — Unify access control (one capability layer)

The permission stack (matrix → per-scope resolver → staff matrix → nav grid) is sound; the issue
is **"is paid / is steward" computed in divergent ways**. Now that Crew = the paid tier (decoupled
from role), the role-based proxies are wrong and must move to the tier.

| # | Item | Where | Status |
|---|---|---|---|
| PB.1a | Drop the role≥crew fallback in `deriveTier` | `lib/core/entitlement.ts` | ✅ done |
| PB.1b | **Unify "is paid" → the tier** — `isPaid(tier)` is now the single predicate; gamification gates moved off `atLeastRole(role,'crew')` (capabilities task · zaps rate · entry-points · codes). Also fixed a regression: beta-grant now comps the Crew **tier**. | `capabilities.ts`, `zaps.ts`, `entry-points`/`codes` actions, `beta/actions.ts` | ✅ done |
| PB.1c | Thread the tier into the per-scope resolver (`Viewer.tier`, fed by `load-capabilities`) | `load-capabilities.ts`, `capabilities.ts` | ✅ done |
| PB.1d | `requireCrew()` — name is now correct (Crew = the paid tier); body checks `isPaid(tier)` | entry-points/codes | ✅ done |
| PB.1e | Page-level `requireAdmin('janitor')` on `/admin/roles` (defense in depth for `assignRole`) | `/admin/roles` | ✅ already in place |
| PB.1i | **`isEndorsed` display → tier** + retire the `community_role='crew'` value | `season-ranks.ts` + feed/profile types | ✅ done (ADR-207, migration applied — incl. the role-as-paid read floor: entry-points · messages rooms · events composing · Vault nav · demo generators) |
| PB.1f | Thread `profile_personas` through `getViewerHats` | `lib/core/viewer-hats.ts` | ✅ done (P3.1) |
| PB.1g | Capability **reason** metadata | resolver | ✅ done — additive `capabilityGaps()` (needs-membership/paid-tier/role), 8 tests (ADR-207) |
| PB.1h | Bring janitor-only admin surfaces (Vera/AI) under the matrix | `access-matrix.ts` | ✅ done — Vera → `insights`, AI → `platform` staffDomains (ADR-207) |

### PB.2 — Page-framework re-composition (same framework on every page)

**54% template adoption** (62/115 pages) — the rest hand-roll headers/layouts. Target 75%+.

| # | Item | Status |
|---|---|---|
| PB.2a | Dedup the `Stat` components. ✅ done — `StatCard` gained `bordered`/`detail`/`size='sm'`; the bespoke stats in `practices/[id]`, `admin/qr/analytics`, `admin/qr/stats` are deleted in favor of the kit. | ✅ |
| PB.2b | Quick wins → kit. ✅ `/support` + `/growth` recomposed (IndexTemplate + EmptyState). `/crew/quests` + `/crew/store/ledger` were **already** composing PageHeading + StatCard + EmptyState. | ✅ |
| PB.2c | Crew section + broadcast headers → shared `PageHeading`. ✅ `/crew` + `/broadcast` (the two raw-`<h1>` offenders). achievements · challenges · journey · streaks **already** compose PageHeading/IndexTemplate — verified. | ✅ |
| PB.2d | `/crew/store`, `/people/[handle]`, `/journeys/[slug]` — assessed: these have **intentionally rich detail headers** (Vault aside-card · avatar/rank identity · accent emoji-tile + pillar chips) that PAGE-FRAMEWORK explicitly sanctions ("Detail pages keep their richer context band"). They use the kit's type scale + primitives in their bodies. Forcing the generic templates would regress the visuals — **left as sanctioned custom, not recomposed.** | ✅ assessed |

> **Audit recalibration:** the "46% hand-rolled" overcounted — many pages compose `PageHeading`/`StatCard`/`EmptyState` directly without the template *wrapper*, which is correct (e.g. where a back-link/eyebrow is needed). The real cobbling is pages that hand-roll the *primitives* (raw `<h1>`, bespoke empties/stats): `/support`, `/growth`, `/circles`+`/channels` (StatInline), `/crew`, `/broadcast` — now fixed — leaving PB.2d.

### PB.2e — Full template-wrapping (2026-06-08 definitive audit)

> Owner standard: **every interior page wraps one of the 5 templates** (slots = easy to assign/reorganize). Verified: the **framework is complete** (no missing slot). ✅ **2026-06-09 re-verified page-by-page: the migration list below is DONE** — a prior wave ("Standardized internal-page system, Wave 1") wrapped every listed interior page; two agents confirmed each file (crew/broadcast/connections/support chunk + help/discover/system chunk) with zero edits needed. Remaining custom pages are all sanctioned exceptions: discover index pages + `/sign-in` (full-bleed marketing-ui heroes), Admin (on `AdminTemplate`), editors, real-time threads, join/onboarding flows, redirects. Historical migration list kept below for reference:

- **Wrap (trivial, PageHeading-only):** `/broadcast`→Stream · `/crew`→Dashboard · `/crew/quests`→Stream · `/crew/store`→Dashboard · `/crew/store/ledger`→Dashboard
- **Member/crew:** `/crew/{achievements,challenges,leaderboard,streaks,journeys,journey,arcs}` → Dashboard/Index · `/people/[handle]`→Detail · `/connections`(+`[id]`,`shared/[id]`)→Index/Detail · `/support/[id]`→Detail
- **Help:** `/help`, `/help/[category]`, `/help/[category]/[slug]`, `/help/changelog` → Index/Stream/Detail
- **Discover:** `/discover`(+`/circles`,`/events`,`/topics` & their `[id]`/`[slug]`) → Index/Detail
- **Focus/system:** `/sign-in`(+confirm) · `/privacy` · `/unsubscribe` · `/code-unavailable` · `/n/[nodeId]` · `/g/[slug]` → Focus
- **Sanctioned exceptions (do NOT migrate):** `(marketing)/*` · `/edit/[slug]`, `/journeys/[slug]`, `/practices/[id]/edit`, `/pages/sequences/[slug]/{build,edit}` (editors) · `/messages/[id]`, `/messages/r/[roomId]` (real-time) · `/join/[token]`, `/onboarding/*` (flows) · redirects/print.
- ✅ **`/admin/*` (20 pages) now on the template system** — `AdminPage` promoted to a first-class **`AdminTemplate`** in `@/components/templates` that composes the shared `PageHeading` (was a parallel hand-rolled header). All 20 admin pages adopt it via a back-compat alias — zero per-page changes. The sixth template; the admin-nav sibling of Dashboard.

*(Specialist surfaces — message threads, editors, QR/CRM tools, scan landings — stay custom by
design; ~27 pages.) Token hygiene is good: **zero** `text-[Npx]`, only 3 acceptable hardcoded-hex
specialist tools.*

## Source map — legacy lists folded in here

| Doc | Role now |
|---|---|
| [ONBOARDING-BUILD-LIST.md](ONBOARDING-BUILD-LIST.md) | **Detail track** for P1 (§11) + P6 + P7; still the spec for onboarding/Vera. |
| [BACKLOG.md](BACKLOG.md) | Source for P5/P8 items; keep for per-item depth (§A–§S). |
| [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md) | Stage view of P2/P3/PM (entity/money/verticals). |
| [IA-RESTRUCTURE.md](IA-RESTRUCTURE.md) | Detail for P7. |
| EDIT-PATH-AUDIT · STUDIO-REVIEW | Folded into P4/P5 (Nurture/Automations, Studio KPIs). |
| BUILD-PHASES · CHECKLIST · LAUNCH · REDESIGN-STATUS | History / runbook / done — no open items (see harvest). |

*Living master list — re-rank as tracks land; update the Progress log on every ship.*
