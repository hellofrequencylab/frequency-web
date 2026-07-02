# Meta-scan status + master to-do

> Snapshot of the full-repo meta scan (17 parallel dimension sweeps, 249 findings:
> 49 high / 117 medium / 83 low) and the follow-up work. This is the durable record of
> what shipped and what is still open. Update it as items close.

## Completion roadmap (phases)

The remaining work, sequenced by risk + dependency. Each phase is one (or few) PRs, all
green (`tsc`/`lint`/`test`/`check:authz`/`check:canon`) before merge. Sign-off = merged +
its row here flipped to ✅.

| Phase | Scope | Risk | Sign-off criteria |
|---|---|---|---|
| **A. commerce_variants** | ① remove the null-only `variant_id` write in `lib/billing/checkout.ts`; ② after that deploys, drop the `variant_id` column + `commerce_variants` table (migration). | Low (2-step, deploy-gated) | Column/table gone; checkout still creates orders; tests green. |
| **B. Dependency hygiene** | Bump patch/minor (resend, stripe, supabase-js, lucide-react, tailwindcss, next patch, @sentry, @anthropic-ai/sdk, supabase CLI). Hold majors (eslint 10, @types/node 26). Re-run `pnpm audit`. | Low-med (build+test per batch) | Build+test green; audit ≤ prior; no major bumps. |
| **C. Stripe / economy atomicity** | Atomic RPCs for: ticket oversell reservation (`lib/billing/tickets.ts`), gem daily-cap (`lib/gems.ts`), notification-queue SKIP-LOCKED claim (`lib/queue/outbox.ts`), challenge/streak read-modify-write (`lib/achievements.ts`), journey-finish purse claim (`lib/quest/complete.ts`); + Stripe event-ordering guard. | High (needs RPC design + concurrency tests) | Each fix has an RPC migration + a concurrency/idempotency test; `test:rls` green. |
| **D. Performance** | Authed `(main)/layout.tsx` serial-await tail → `Promise.all` + per-section `<Suspense>`; make `(marketing)`/`discover`/splash auth a client island so `revalidate` ISR isn't defeated by `cookies()`; events/messages serial chains → waves. | High (architectural; shell regressions) | Before/after render trace; shell not blocked; ISR restored on public routes; tests green. |
| **E. @measured/puck migration** | Execute ADR-493: pin exact → in-house `<Render>` over the block registry → in-house editor → drop dep. Keep the persisted `Data` shape (zero doc migration). | High (multi-week, phased itself) | Each ADR-493 sub-phase shippable behind a flag; published-page parity. |
| **F. Lower-priority advisors** | Consolidate 56 `multiple_permissive_policies`; enable leaked-password protection (Supabase dashboard auth setting — not a migration, needs owner toggle). | Med / config | Advisor counts drop; document the dashboard toggle for the owner. |

Execution order: A → B (safe, fast) → C → D (dedicated, test-gated) → F → E (largest).
Phases C–E are deliberately individual, verified PRs — not rushed in a batch, because their
failure modes (money races, shell regressions, published-page breakage) are not caught by
the unit suite.

## Status at a glance

| Area | State |
|---|---|
| Build / lint / tests | ✅ `pnpm build` compiles, lint clean, 3,267 tests pass |
| Supabase migrations | ✅ all repo migrations applied to prod; zero drift |
| Supabase advisors (initplan + unindexed FKs) | ✅ fixed + applied (`auth_rls_initplan` 6→0, unindexed FKs 13→0) |
| Timezones (LA home, per-event zones, member location) | ✅ shipped |
| Billing / reward correctness (safe subset) | ✅ shipped |
| Admin data-integrity + swallowed-error feedback | ✅ shipped |
| Naming / voice canon (bulk) | ✅ shipped |
| Moderation gate, marketplace refund | ✅ shipped |
| `@measured/puck` migration | ⏳ plan only (ADR-493 + `PUCK-MIGRATION-PLAN.md`); execution open |
| a11y, performance, remaining tail | ⏳ open (see master to-do) |

## Shipped (merged PRs #1392–#1399)

- **Timezone system** — `lib/time/zone.ts` (HOME = `America/Los_Angeles`, per-event IANA zone,
  worldwide lat/lng→zone via `tz-lookup`, 16 tests), `events.time_zone` migration; every
  event gate (`isPast`/`hasEnded`/check-in/RSVP/ticket-window) and render (detail page,
  ICS, Google Calendar, RSVP + reminder emails, listing day-boundary) resolves through the
  event's own zone; member location prompt (`LocationTimezoneCard` + `setMemberLocationFromCoords`).
- **Data exposure** — feed private-event leak, global-search visibility leak, event
  `generateMetadata` venue/visibility leak.
- **Billing** — webhook throws on failed entitlement write; `supporter`→`crew`+badge;
  confirmCheckout mode guard; founder `locked_price_id` fix; subscription tier from metadata;
  past_due grace; reward claim-release-on-failure; partial-refund guard; gate fail-closed;
  `getUpcomingSeason` status; queue error checks.
- **Admin** — season-clone `parent_id` remap; segment boolean bug; applications KPI; funnel
  rollback; reward-cap validation; theme-default guard; swallowed-error feedback; moderation
  gate (community staff domain); marketplace refund error surfacing.
- **Correctness** — room-thread newest-100 ordering; dropped-`practice_streaks` reads repointed.
- **Naming / voice** — Zaps/Gems casing, Vault Store, Get Moving/Mindless, Journey Run,
  Channels (not Interests), breadcrumb alignment, member-facing em dashes, winback/email voice.
- **Docs** — ADR numbers, dead pointers, stale counts; `PUCK-MIGRATION-PLAN.md` + ADR-493.
- **DB advisors** — initplan policy rewrites + FK covering indexes (applied).

## Master to-do (open)

### 🔴 High — correctness / needs an atomic RPC or a decision
- ✅ ~~**Reminder send-window offset**~~ — FIXED: the cron now widens the raw-`starts_at`
  band by ±14h and filters in code by `eventInstant(starts_at, time_zone)`, so reminders fire
  at the event's real instant regardless of its zone.
- **Stripe/economy races** (need atomic RPCs): ticket oversell reservation
  (`lib/billing/tickets.ts`), gem daily-cap count-then-insert (`lib/gems.ts`), notification
  queue claim (`lib/queue/outbox.ts`, SKIP LOCKED), challenge/streak read-modify-write
  (`lib/achievements.ts`), journey-finish Zap purse claim (`lib/quest/complete.ts`).
- **Stripe subscription event ordering**: a delayed `subscription.updated` re-grants a
  canceled tier; compare `event.created` / fetch the live sub before writing.

### 🟠 Medium
- ✅ ~~**DB retirement**~~ — DONE (applied + verified): dropped `circle_topics`, `menu_config`,
  `listing_saves`, `library_renditions`, `library_usages`, `conversation_room_migration` +
  RPCs `are_friends`, `get_my_{circle,hub,nexus,outpost}_id` (singulars), `housing_rentals_near`.
  Each verified 0 code refs / FKs / triggers / policy deps / body callers.
  STILL HELD: `commerce_variants` (FK + null-only code write in `lib/billing/checkout.ts` —
  remove the write, deploy, then drop the column + table).
- **Performance** (docs/PAGE-FRAMEWORK §5): authed `(main)/layout.tsx` serial-await tail →
  Promise.all + Suspense; `(marketing)`/`discover` layout + splash `cookies()`+`getUser()`
  defeats `revalidate` (make auth a client island); events index + messages inbox serial
  chains → waves; `GameStatsDock` needs its own `<Suspense>`; `<img>`→`next/image` on LCP
  surfaces (practices library, space profile, spotlight, market); help search index re-parsed
  per request + shipped in every RSC payload.
- **a11y**: missing `error.tsx`/`not-found.tsx` for some route groups; icon-only buttons
  missing `aria-label`; dialog focus-trap soundness; client mutations without error feedback
  (some admin row-actions). ✅ notifications toggle now reverts + shows an error on save failure.
- **`@measured/puck` migration execution** — per `PUCK-MIGRATION-PLAN.md` (pin exact → in-house
  renderer → in-house editor → drop dep). Also: publishing a Puck page drops FAQ/Article
  JSON-LD (emit schema from the block render path).
- ✅ ~~**SECURITY DEFINER executable lockdown**~~ — DONE (applied, verified). Phase 1: 15 trigger
  functions revoked. Phase 2: the 2 genuinely-internal standalone helpers
  (`recompute_community_level`, `get_my_group_ids`) revoked. The other 68 flagged standalone
  functions are **intentionally executable** and left as-is — 49 are PostgREST RPCs, 18 are
  RLS-policy helpers (revoking breaks RLS — confirmed via `pg_depend`), 1 is PostGIS. Those
  advisor warnings are expected/"won't fix". Method is codified in the `/meta-scan` skill.
- **Supabase advisors (remaining, lower priority)**: 56 `multiple_permissive_policies` (consolidate
  overlapping policies), `auth_leaked_password_protection` off (a dashboard toggle), 71
  `rls_enabled_no_policy` (default-deny, informational), 225+ unused-index review.
- **Help-doc naming audit**: sweep `content/help/**` for retired member terms
  (e.g. `the-quest/movement.md`, `on-air.md`, `zaps-and-gems.md`).
- **Dependencies**: minor/patch bumps (resend, stripe, supabase-js, lucide-react, tailwindcss,
  next patch); 2 moderate transitive vulns (`postcss` via next, `uuid` via `@measured/puck`).

### 🟡 Low
- ✅ ~~Marketplace/catalog lib helpers swallow Supabase errors~~ — FIXED: `createProduct`,
  `setProductStatus`, `updateProduct`, `deleteProduct` (`lib/commerce/products.ts`) and
  `setReportStatus` (`lib/commerce/reports.ts`) now throw on error so the action surfaces it.
- Page-framework nits: hardcoded hex + `text-[11px]` in a handful of admin/marketplace
  components; hand-rolled headers in Theme Studio / walkthrough editors.
- Bulk em dashes in **operator/admin** copy and `lib/demo/engine.ts` demo content (voice ban
  is primarily member-facing; operator copy is lower priority).
- Docs: `docs/PAGE-EDITOR-SPEC.md` still cites a retired `/studio/pages/[slug]/edit` route.
- Dead single-symbol exports flagged but not removed (kit API judgement calls):
  `MapPreview`, `DeltaBadge`, `StudioSectionLabel`, `canSeeMenuCategory`, a couple stray re-exports.
