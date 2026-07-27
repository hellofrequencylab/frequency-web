# Meta-scan status + master to-do

> The durable record of the full-repo meta scan: what shipped, and what is still open with the
> exact fix. Update it as items close. Newest pass first; earlier passes are kept below.

## 2026-07-27 scan (14 dimensions, 92 findings: 19 high / 49 medium / 24 low)

Fourteen read-only dimension sweeps (orphans, unplugged routes, half-wired features, security,
performance, member + admin correctness, SEO/AIO, DB hygiene, canons, a11y, docs drift, UI
consistency), each finding re-verified against the actual code and the live database before
anything was touched. Baseline at scan start: tsc clean, 6348 tests green, all 12 machine guards
green. Everything below is therefore something the guards structurally cannot see.

**Two findings were false and are recorded as such:** the "15 marketing pages missing metadata" are
15 intentional 308 redirect stubs, and `/spaces/<slug>/podcasts` (the Shows index) was already
anonymously viewable — only the Show *page* was not.

### Shipped this pass

| Area | What was wrong | Guard added |
|---|---|---|
| 🔴 **Migrations** | Three pairs of files shared a version. `schema_migrations.version` is the PK, so on any fresh apply the second of each pair is **silently skipped** — a `db reset` or DR rebuild would have built a schema with no `events.time_zone`, no orphan-retirement, and no `supporter_contributions`. Prod was fine only because each half had been applied by hand via MCP. | `pnpm check:migrations` (in CI) |
| 🔴 **Migration ledger** | 106 repo migrations from 2026-09-13 on were applied but never recorded. Each was **proven applied** (signature object checked against the live catalog) before reconciling. Drift from that date is now zero in both directions. | same |
| 🔴 **Security, anon chat** | `openOrGetConversation` keys threads on `(kind, email, owner)`. Typing a target's email into the public live chat returned a capability token for **their** existing CRM conversation: full transcript read plus forged inbound messages. The signed-in path had the same hole via a spoofable email. | 3 regression tests |
| 🔴 **Security, Airwaves** | `listAttachedRecordings` is a `'use server'` action doing a service-role read with **no caller check**; anyone could enumerate attached recording titles for any host id. | — |
| 🔴 **SEO, crawler gate** | Five sitemap-advertised detail families (`/store/<id>`, `/market/<id>`, `/marketplace/housing/<id>`, `/classifieds/<id>`, `/spaces/<slug>/podcasts/<showSlug>`) **307-redirected crawlers to the homepage**. We submitted the URLs and then bounced the bot off them. | sitemap-to-gate drift test |
| 🔴 **SEO, pricing doors** | Three of the five `/for/<niche>` doors were shadowed by `next.config` redirects written for a slug rename the registry never adopted: one 404, two bounced back to `/pricing`. All three are in the sitemap. | funnel-redirect test |
| 🔴 **Perf, /discover** | All 22 pages declared `revalidate = 3600` and none got it: `<SiteHeader>` read auth during render, and one dynamic API in a layout opts the whole route out of static rendering. **8 routes measured Dynamic to Static/SSG** after moving the auth read to `/api/viewer`. | — |
| 🔴 **`profiles.email` does not exist** | Five sites selected it. PostgREST treats an unknown column as a request-level error, so the **whole row** returned null: `/apply` told every member "Only members can apply", `/waitlist` dropped members into the anonymous branch, and three checkouts lost the owner's cached `stripe_customer_id`. | repo-wide select guard |
| 🔴 **Feed ranking discarded** | `feed-list.tsx` re-sorted by `created_at` unconditionally *after* ranking. "Resonance" and "Most popular" rendered identically to "Most recent" — the whole ranking layer computed and thrown away on every render. | — |
| 🔴 **Orphan: Events discovery** | The map toggle, For You lane, connector suggestions and AI blurbs were built, documented as shipped, and never mounted, while `/events` paid to compute `mapPins`/`showForYou` on every request. | reachability test |
| 🔴 **Orphan: Founding Business** | `createFoundingBusinessCheckout` had zero callers and redirected to routes that did not exist, so the offer was unbuyable. Built the offer page, the owner-gated action, and the success confirm that grants the founder record. | wiring test |
| 🔴 **Orphan: Vera autonomy** | `autonomousSend`, "the ONLY function that turns a Vera-decided send into a real send", had zero callers while `/admin/vera-ai` rendered a live master switch, per-category toggles, rate caps and a decision history over a table nothing wrote. Now wired at both send executors; behaviour is unchanged until the switch is turned on. | wiring test |
| 🟠 **Two files unsearchable** | `lib/ai/vera/execute.ts` and `lib/apps/for-scope.ts` held raw control bytes (NUL, 0x1f, 0x7f), which makes a file "binary" to ripgrep — so **every grep-based sweep silently skipped them**, including this scan's own. | source-hygiene test |
| 🟠 **CRM contacts meter** | The `space_crm` meter (dimension "Contacts", 250 free) was fed the **deal** count. A Space with 900 imported contacts and 2 deals read "2 of 250 used". | count tests |
| 🟠 **Retired reward promised** | The event page told every Circle-event attendee "adds to <Circle>'s Current", a mechanic whose table and trigger were dropped in the rewards v3 teardown. | — |
| 🟠 **Canon breaks** | Member-facing training copy: lowercase "zaps & gems", the retired noun "broadcast", the banned word "unlocked", two em dashes. All outside `check:canon`'s `content/` scope. | — |
| 🟠 **Date in the wrong zone** | The Journey event chip formatted in the **browser's** zone; events store wall-clock in UTC parts, so a viewer west of UTC saw the previous day. | — |
| 🟠 **Docs drift** | `CONVERSATION_TOKEN_SECRET` **throws in production** and was in neither `.env.example` nor the LAUNCH checklist (plus four more secrets). `DATABASE.md` described 10 tables that no longer exist, verified against the live DB. | — |

### Verified healthy (worth not re-auditing)

- **Crons**: all 25 `vercel.json` entries resolve to a real route handler, and every cron route
  handler is scheduled. No drift in either direction.
- **Orphaned tables**: none. Every live `public` table has a code reader or writer except
  `app_instances`, which is schema-ahead-of-code for the Loom backbone (tracked below).
- **CI**: every `check:*` script the repo defines runs in CI. `check:cron-freshness` is consciously
  excluded and documented as a runtime SLO check.
- **DB advisors**: one `auth_rls_initplan` warning across ~270 tables. The `rls_enabled_no_policy`
  INFOs are deliberate deny-all.

---

## Master to-do (open)

### 🔴 High, verified — ALL FOUR CLOSED (follow-up pass, 2026-07-27)

| Item | What shipped | Guard |
|---|---|---|
| **`/people/<handle>` showed a directory skeleton** | `/people` is now only a redirect (ADR-172), so the segment's grid skeleton was the nearest one Next.js found for the DETAIL route: opening a profile flashed six person cards, then reflowed into a Detail page. Added `app/(main)/people/[handle]/loading.tsx` (hero + band + 2/3 content beside a 1/3 aside) and deleted the parent. | route-shape test |
| **⌘K search overlay was an untrapped modal** | It owned its backdrop, ESC and scroll-lock but was not a dialog to assistive tech: Tab walked out into the page behind it and closing dropped focus to `<body>`. Added `role="dialog"` + `aria-modal` + `aria-label`, and called the existing `useDialogFocusTrap`. Purely additive. | 3 markup tests |
| **`Label` never associated with its control** | Create Event's 17 labels are now associated: 12 real controls got `htmlFor`/`id`, and the 3 button groups plus the multi-field Address block became `role="group"` + `aria-labelledby` (a button group is not labelable, so `htmlFor` has nothing to point at). Added a shared `Field` primitive that WRAPS its control — implicit association, no hook, so `ui/field.tsx` stays importable from Server Components. | 3 source tests |
| **Chat routes bled past the mobile gutter** | A flat `-mx-6` against the shell's `px-4 sm:px-6 lg:px-8` over-pulled 8px on mobile (a horizontal scroll) and under-pulled at lg; `100vh` ignored the iOS dynamic toolbar. Now `-mx-4 -my-6 sm:-mx-6 lg:-mx-8` and `100dvh`, on all three routes. | per-file test |

Also closed in the same pass, both flagged above as the highest user impact:

| Item | What shipped | Guard |
|---|---|---|
| 🔴 **RSVP reported success on a failed write** | `setRsvp` returns null when the upsert fails; that result was discarded, so a failed write fell through to revalidate and a silent success — the member watched the control flip to "Going" and the host never got the RSVP. `setEventRsvpDepth` now returns `{ ok }`, and the control shows a `role="alert"` message instead of reporting success. | 2 source tests |
| 🔴 **Event JSON-LD claimed every tier-priced event was free** | It priced from `events.price_cents`, which stays null for ticketed events (they price on their active tiers), so both `/events/<slug>` and `/discover/events/<slug>` published `isAccessibleForFree: true` while the page showed the real price — a Google structured-data mismatch. Now reads the tier authority via `ticketFromPriceCents`, three-state so "tiered and free" cannot fall back to the stale column. **ADR-855.** | 3 unit tests |

> Every assertion above was confirmed to FAIL against the pre-fix tree before being accepted. The one
> exception is deliberate: `falls back to price_cents when no tier data is supplied` passes both
> before and after, because it guards the untiered path against regression.

### 🟠 Medium, grouped by theme

**Half-built features (each has a live control or nav entry with nothing behind it)**
- Beta **graduation** is orphaned, so referral-contest prizes were never awarded on the `billing_live` flip (`lib/beta/graduation.ts:33`).
- Beta **admission-wave** engine has no caller while the Command Center advertises and renders the UI (`lib/beta/admission.ts:88`).
- **Email Studio** Phase-3 template gallery is a dead subtree; its nav target `/admin/email-studio` does not exist (`components/admin/email-studio/template-gallery.tsx:42`).
- **Household/Circle bundle checkout** has no caller AND no webhook seating branch, so enabling the flag would take payment and seat nobody (`lib/billing/bundle-checkout.ts:21`).
- `/admin/elements` renders QR Studio toggles and role gates nothing consumes; saving them silently does nothing (`lib/elements/qr-studio.ts:83`).
- The declared **CRM policy layer** and membrane contact-card primitive are unreferenced (`lib/crm/capabilities.ts:83`).
- The embeddable-elements `<AppElement>` mounter is orphaned; every mount forks its own (`components/elements/app-element.tsx:25`).
- `lib/marketing/personas.ts` is a second, unwired copy of the persona registry `/for/[niche]` actually uses.
- `app_instances` (0 rows, no reader or writer) is the Loom where-referenced backbone, shipped ahead of its code.

**Correctness**
- **Circle-placed events via the placement console are invisible to the circle-membership gate.**
  `app/(main)/events/placement-actions.ts:116` writes `scope_circle_id` alone; the
  `sync_event_scope_arc` trigger (20260829000000) only derives when `scope_id` is null or
  changed, so `scope_id`/`scope_type` stay pointed at the old region — and every reader plus the
  `circle_only` RLS disjunct keys on `scope_id`. Fix: that write must also set
  `scope_id`/`scope_type` (or the trigger must sync the reverse direction). Found while building
  ADR-857; not fixed there because it changes that flow's semantics on its own.
- Reactivating a suspended operator **bypasses the licensed-seat wall**, single and bulk (`lib/spaces/roster.ts:179`).
- CRM import dedupe index truncates at 1,000 rows, so re-importing into a large list creates duplicates (`lib/crm/import/commit.ts:230`).
- Circle handoff has no way to see or cancel a pending offer, so an unanswered offer blocks the Circle permanently (`app/(main)/spaces/[slug]/circles/actions.ts:161`).
- The Vault card shows `lifetime_gems` as "gems to spend", so it never decreases after a redemption or gift (`components/sidebar/right-sidebar.tsx:147`).
- The 7-day streak strip keys days in server UTC while logs are keyed to the member's local day (`components/sidebar/right-sidebar.tsx:118`).
- The per-topic notification Frequency selector is inert on every realtime email path (`lib/notification-preferences.ts:181`).
- The host's "List this event publicly" opt-out is honored on one of four public browse surfaces (`lib/commerce/ticket-projection.ts:99`).
- Admin footer "Report a problem" links to a POST-only handler, so a click returns 405 (`components/admin/admin-footer.tsx:113`).
- A root-type Space's "Manage" affordance dead-ends in a 404 (`lib/spaces/types.ts:47`).
- `library_usages` was dropped five days after it was created; the admin Library splash lane still queries it (`lib/library/splash-registry.ts:190`).
- Four incompatible cents-to-price formatters; the one used by the seller price editor and product emails drops precision (`lib/commerce/types.ts:375`).

**SEO/AIO**
- `/spaces/<slug>/podcasts` is advertised in the sitemap but canonicals to `/spaces/<slug>` (`app/(main)/spaces/[slug]/podcasts/page.tsx:23`).
- Spotlight pages render a double-branded title, "Name · Frequency · Frequency" (`app/spotlight/[handle]/page.tsx:27`).
- Four indexable public hubs have **zero inbound internal links**, so they are crawlable only from `sitemap.xml`.
- Nine `/discover` pages remain dynamic for their own reasons (filterable indexes read `searchParams`). Worth a pass now that the layout no longer forces it.

**Performance**
- `app/sitemap.ts:379` fires one `podcast_shows` query per networked Space, up to 200 round trips in a single request.
- QR Studio reads the entire `qr_scans` and `captures` tables into memory on every load, and reads `qr_codes` twice (`app/(main)/admin/qr/page.tsx:42`).
- The events embedding cron runs every 30 minutes. Now that the For You lane is mounted this work finally has a consumer, but the cadence deserves a look.

**Naming and voice (member-facing, outside `check:canon`'s scope)**
- The "Around You" dashboard calls Dispatches "broadcasts" in three visible strings (`app/(main)/broadcast/page.tsx:204`).
- The Dispatches console is "Broadcasts" in the app rail and "Dispatches" in the admin sub-header (`lib/nav/studio.ts:195`).
- Global search labels eight member destinations with the retired name "Marketplace" (`lib/search/destinations.ts:40`).
- `/for/community-builders` and Journey copy both sell "cohorts", the one word the canon bans.
- Public profile and Spotlight stat pills render lowercase "zaps" and "gems earned".
- **Worth doing:** widen `pnpm check:canon` past `content/` to member-facing strings in `app/` and `lib/`. Every canon break this scan found was outside its current scope.

**Accessibility**
- **~105 `<Label>` uses across ~40 files are still unassociated.** Create Event (the worst, 17) is
  fixed and `Field` now exists as the shared labelled-control primitive, but the rest of the repo
  still renders a bare `<label>` beside its control. Next by volume: `circle-builder.tsx` (12),
  `movement-session.tsx` (9), `events/drafts/[id]/editor.tsx` (9), the six onboarding `*-render.tsx`
  files. Mechanical: wrap in `Field`, or thread `htmlFor`/`id` where the control is a real one and
  `role="group"` + `aria-labelledby` where it is a button group.
- The header wordmark's keyboard focus indicator is explicitly deleted (`app/globals.css:1028`).
- Four member-facing toggle switches have no accessible name.
- Vera's chat transcript is not a live region, so replies are never announced.

**Docs and repo hygiene**
- Seven ADR numbers (088 to 094) are each used twice, 090 three times; 75 cross-references are ambiguous.
- ADR-219 is still marked "Accepted" after ADR-305 retired it.
- `ARCHITECTURE.md` documents two cron endpoints deleted by ADR-305, and still warns about a removed `vercel.app` canonical fallback.
- **`tsconfig` excludes `scripts/`**, so the CI guard test files vitest runs are never typechecked.

**UI consistency**
- Five "Spark" wizards hand-roll the WizardShell lockup, a header violation `check:headers` structurally cannot see.
- Two hand-rolled `EmptyState` components shadow the kit's variant taxonomy on the two main post feeds.
- Six route skeletons use the retired `px-4 py-8 max-w-2xl mx-auto` shell, double-padding inside the shell.

### 🧑 Needs your call — ALL FOUR CLOSED (database best-practice pass, 2026-07-27, ADR-856)

| Item | Resolution |
|---|---|
| **Pre-2026-09-13 ledger divergence** | Re-measured as version SETS and found worse than recorded: **296 repo files were absent from the ledger** (re-appliable by any future `migration up` — a correctness risk, not cosmetics) alongside the 477 orphan rows. Every missing version was proven applied (261 by name lineage, 33 by live signature objects, 2 by a later retire migration), inserted, and the orphans deleted in one asserted transaction. The ledger is now an **exact bijection with the repo: 549 ⇄ 549**. Pre-surgery snapshot: `docs/maintenance/ledger-archive-2026-07-27.json`. |
| **Three anon-callable SECURITY DEFINER RPCs** | Locked to their verified callers in `20270104000000` — and two of this doc's claims were stale on re-verification: `circle_momentum` IS live on the authed client (anon revoked, authenticated kept), while `resonance_neighbors` + `mkt_interest_demand` are service-role only. Verified with `has_function_privilege` per role, because a role revoke under the default PUBLIC grant is a no-op. |
| **Duplicate `record_qr_scan` overload** | 7-arg dropped in `20270104000000`; the 8-arg already defaulted `p_variant`, so every call now lands on the one true function and variant attribution cannot be silently lost. |
| **19 unindexed FKs** | All 19 indexed in `20270104000000`. Every one points at a delete-bearing parent (`profiles`/`spaces`/`contacts`) and arrived with #1961's tables, so the indexes were free at current row counts. Advisor INFO now zero. The **247 unused indexes** stay untouched deliberately: usage stats are young, and mass-dropping serves nothing yet — revisit after real traffic. |


## 2026-07-25 re-scan (post Comms/Collective/Events era, #1867–#1919)

### 2026-07-25 late-day close-out (PRs #1926 merged, #1927 open)

- ✅ **Pricing overhaul (ADR-818)** — Free Space leads /pricing, Supporter sold again at $12,
  Independent hidden (flag OFF), "Vera AI" listing, Opening Beta vocabulary everywhere, admin
  console lists every price monthly + yearly (effective yearly always populated).
- ✅ **Event hosting entity (ADR-819)** — events.host_space_id; space-calendar + wizard creates are
  space-hosted; "Hosted by" picker; ticket payee + take-rate follow the hosting space; manage
  calendar (grid/list, click-to-edit, co-host approvals); QR PNG/SVG downloads. MELD re-homed.
- ✅ **F5 sealed** (owner ruling): tenant CRM lanes visible only to web_role admin/janitor.
- ✅ **F7b/c stitched**: Vera Today + Space funnel union the tenant contact lane.
- ✅ **Supporter-contribution confirm wired** into the /upgrade success redirect (was dormant).
- ✅ **D3 closed**: room thread reads in one wave; /messages index + DM thread already batched.
- ✅ Royal Temple comped to Collective (owner grant); Resend key re-scoped to full access (owner).
- ⏳ Remaining tail: flat-inbox → spine migration (own PR; also retires F1-root-cause + F6 category
  divergence), chat shell C3/C4 mobile polish, pre-`20260923` ledger history (cosmetic), operator
  em dashes, 26 raw `<img>` → next/image.


Fresh deep pass over the ~50 PRs merged since 07-10 (Comms/CRM/Vera spine, Events/calendar/
collaborator-spaces, Community Collective pricing/seats, practice timer). All 12 machine guards
green at scan start; the real findings were in runtime wiring, which guards don't see.
Four fix batches shipped on `claude/site-meta-scan-bugs-pgnw78`, each tsc/lint/test-green.

**Shipped this pass:**
- ✅ **Comms/CRM (HIGH)** — the anonymous live chat (ADR-816) was dead on arrival:
  `startSupportChat` passed no counterparty, so the spine's CHECK made `openOrGetConversation`
  return null and the widget always said "Live chat is unavailable." Now resolve-or-creates the
  visitor's platform contact first. Plus: Space brand replies were signed with the acting
  manager's PERSONAL `email_signature` (now the purpose-built, previously-orphaned
  `brandSignature()`); the inbound-digest cron advanced `last_digested_at` with no resolvable
  recipient email (digest silently lost — now retried); member-facing em-dash email footers
  removed (voice canon) + a guard test.
- ✅ **Practice timer (P0)** — a `'none'` (log-only) practice opened the Meditate/Free-Practice
  sit and logged the WRONG practice on feed/journey/prompt surfaces (they pass `timer_kind`
  raw). `LogPracticeButton` now screens `'none'` centrally. Full bug map + phased redesign in
  **[PRACTICE-TIMER-CONTINUITY.md](PRACTICE-TIMER-CONTINUITY.md)** (double countdown root cause,
  Just-Log routing, Get Moving free-config memory, authorable cues).
- ✅ **Events** — the per-event `.ics` recurring export emitted an RRULE with NO EXDATE, so
  cancelled occurrences resurrected on "Add to calendar" (the feeds already EXDATE via
  `computeFeedExdates`; the route now reuses it — parity).
- ✅ **Billing authz (MED-HIGH)** — the Space billing actions (seats, portal, plan/founding
  checkouts) gated on `canManage` (owner/admin/**editor**), letting an editor mutate the owner's
  live Stripe subscription. Now gated on `isAdmin`, matching the `billing` function floor and the
  page render.

**🔴 Open HIGH — pre-`billing_live` blockers (billing verified OFF, so latent not live):**
- ✅ ~~**Founding Business checkout mispricing**~~ — FIXED (owner-confirmed ladder 2026-07-25:
  Business $29/$19 beta · Collective $79/$49 beta · Non Profit $39). Two-part fix: ① the
  checkout now charges the catalog **founding** key `business_base_<interval>` (the synced
  $19/$190 beta price, verified live in `pricing_stripe_prices`), honoring a grandfathered
  `locked_price_id` first, exactly like `resolveLoadoutPriceId` — it had charged
  `business_monthly`, a Stripe price minted 06-23 from the stale `plan.business` row; ② migration
  `20261212000000_adr811_plan_anchor_reconcile` (applied + verified; ledger `20260725174004`)
  reconciled the two stale ADR-590-era anchor rows to the ADR-811 ladder — `plan.business`
  $49/$490 → **$29/$290**, `plan.nonprofit` $29/$290 → **$39/$390** — guarded on the exact stale
  pairs so operator-set rates are never clobbered.
- 🧑 **Owner action — re-run the Stripe pricing syncs** (admin pricing console): ① the product
  sync, so `business_monthly`/`nonprofit_*` re-mint at the corrected $29/$39 anchors (the live
  Stripe prices still hold the stale $49/$29 amounts); ② the catalog sync — **no
  `collective_base_*` or `independent_base_*` price rows exist at all** (verified live), so the
  Collective/Independent checkouts (go-live #1889) currently dead-end on "Plan checkout is not
  available yet."
- ⚠️ **CORRECTION (2026-07-25, later the same day): billing is LIVE, not OFF.** The earlier
  "billing verified OFF" note queried `pricing_settings` for the flag; it actually lives in
  `platform_flags` (`billing_live` = true, all four plan switches + operator seat on, Stripe
  configured). Verified **zero damage**: 0 spaces with subscriptions, 0 founding records, 0
  profiles with a Stripe customer — nobody was ever charged the stale price. Until this PR's
  founding-checkout fix deploys AND the syncs re-run, the live founding checkout still resolves
  the old $49 `business_monthly` price, so merge + re-sync is the go-live path.
- ✅ **Admin pricing console: Collective + Independent catalog cards** — the ADR-811 tiers were
  sellable (switches, checkouts, sync keys all cover them) but the console's Catalog section never
  rendered their `CatalogItemRow`s, so the operator could not see or edit Collective $79/$49 or
  Independent $249 (the owner hit exactly this). Both cards added (`resolveCatalogConfig` already
  loaded all six items; render-only gap). The owner's 07-24 catalog sync predated the deploy that
  added those keys, which is why their Stripe prices never minted; the next sync mints them.
- **Space plan/seat webhook has no event-ordering guard** — the member path uses
  `apply_membership_event_atomic` (ignores stale `event.created`); the space path
  (`lib/billing/space-subscriptions.ts` `reconcileSpacePlanSubscription`) set-to-targets seats/
  plan/add-ons from any `subscription.updated`, so a late-delivered older event can revert a
  newer seat count/tier. Mirror the atomic-event pattern.
- **Seat-downgrade floor is client-only** — the editor floors minus at
  `used - BASE_SEAT_ALLOWANCE` but `updateOperatorSeats` clamps only `0..MAX`; a direct action
  call can license fewer seats than active operators (existing operators stay active; the wall
  only blocks new invites). Re-derive the floor server-side.

**✅ Fix-everything pass (2026-07-25, later the same day — owner directive):** every drafted item
above shipped on the follow-up branch: timer P1–P5 (one countdown / Just-Log note / free-config
memory / authored breath pattern / live builder preview, per PRACTICE-TIMER-CONTINUITY.md), the ICS
timezone rework (TZID + VTIMEZONE + BYMONTHDAY clamp idiom; 35→58 ICS tests), the comms
null-Message-ID dedup fallback, the server-side seat-downgrade floor, and the space-plan webhook
event-ordering guard (`claim_space_plan_event`, migration `20261213000000`, applied). Migration
`20261214000000` (practice_breath_pattern) also applied. Remaining owner action: the two Stripe
pricing syncs after deploy.

**🟠 Open MED (drafted, dedicated PRs):**
- **ICS timezone rework (one PR, two bugs)** — (a) monthly series anchored on day 29/30/31 lose
  their short-month occurrences in every collapsed feed (RRULE on a UTC day-31 DTSTART skips
  short months per RFC 5545, the clamped child row is folded and NOT EXDATE'd); (b) any series
  crossing a DST boundary renders post-transition occurrences one hour off (UTC DTSTART, no
  TZID/VTIMEZONE — clients expand at a fixed offset; HOME_TZ observes DST). Both need
  `DTSTART;TZID=<zone>` + a VTIMEZONE block (+ `BYMONTHDAY` for day-29/30/31 monthlies) in
  `lib/events/ics.ts`; the EXDATE reconciliation cannot compensate for an RRULE generating the
  wrong instants.
- **Comms double-send edge** — inbound idempotency keys on `external_message_id`, whose unique
  index is partial (`where … is not null`); an inbound with no Message-ID that gets redelivered
  appends twice and (house path) re-emails the member. Fall back to a content-hash id.
- **Practice timer P1–P5** — per PRACTICE-TIMER-CONTINUITY.md: the double countdown (every Get
  Moving mode plays the 5s Warm-up ring THEN the plan's 3s PREPARE lead-in; Be Still doesn't;
  owner call on approach, Option A recommended), Just-Log = note-capture (authored Just Log
  currently routes to Meditate), Get Moving free-config memory, authorable breath/cues.

**Verified sound this pass (no action):** reply-address codec + inbound webhook signature/replay
handling; send-gate precedence + consent backfill (scope wider than the "~46" note but
intentional per its header); calendar-feed RLS gates (no private leak); collaborator/venue-hold/
event-share authz (both-space checks, status-guarded races); follower-reminder cron windows;
differential take-rate 0% collapse on all three fee paths; fee rounding; server-side price
re-derivation + `locked_price_id` honoring; operator_seat placeholder inertness; new-era
migrations (`20261191`–`20261211200000`) additive/idempotent/RLS-correct.

**Carried owner config:** set `CRON_HEARTBEAT_BASE_URL` (24 jobs paging-blind); Supabase
leaked-password protection + disable anon sign-ins; submit sitemap to Search Console/Bing;
the 3 stale "$49" prose strings flagged by `check:collective`.

## 2026-07-10 re-scan (post Shop-rework merge, #1647)

Fresh pass on the merged `main` (base `3d9ca385`) once the marketplace build landed. Guard
scripts + live Supabase advisors + a dedicated shop deep-audit. Headline: **no correctness or
security bugs**; the shop's auth (every mutating action object-authorizes), booking/checkout
(HOLD-FIRST, idempotent, atomic stock), and visibility gating all verified sound.

**Shipped this pass** (branch `chore/meta-scan-hygiene`):
- ✅ **DB advisor hygiene** — migration `20261104000000`: wrapped the 2 `auth_rls_initplan`
  policies (`supporter_contributions`, `practice_timer_sessions`) in `(select auth.uid())` +
  added the 8 unindexed-FK covering indexes. Applied to prod + verified; idempotent.
- ✅ **Shop naming-canon copy** — 3 member strings called Classifieds "Marketplace"
  (`classifieds/error.tsx`, `classifieds/page.tsx`) and the Store empty state said "the shop"
  (`store/page.tsx`). Fixed per NAMING.md §Classifieds + Store/Shop collision guard. (These
  live in `app/**`, which `check:canon` does not scan — a guard blind spot, see below.)
- ✅ **Checkout `cancel_url`** — `lib/commerce/checkout.ts` sent cancelled buyers to
  `/marketplace` (→ the free Classifieds board). Now routes by `owner_kind` (platform → `/store`,
  else → `/market`).

**Migration-ledger reconcile (OPEN-THREADS A2) — modern era CLOSED (2026-07-10):**
- ✅ **Clean era (≥ `20260923000000`) fully reconciled — 35/35, zero drift.** Every modern-era
  migration was verified genuinely applied on prod (distinctive object/constraint/function/effect
  per file) *before* recording, then stamped into `schema_migrations`: the 20-file shop/practice era
  `20261008`→`20261104` (all MCP-applied with no ledger row), plus the two stragglers
  `20260927000000` (secdef helper lockdown) and `20261006000000` (redundant-index drop).
- ✅ **Duplicate migration version fixed** — two files shared `20261010000000`
  (`dm_conversation_summaries` + `library_sequence_kind`); the latter renumbered to
  `20261010000001` so a fresh `supabase db start` (the db-tests gate) no longer errors on a dup version.
- ⚠️ **Pre-`20260923` history still diverges** (~288 repo versions vs 373 orphan ledger rows) — the
  long-standing "renumbered timestamps vs prod" condition (same schema, different stamps; "not
  breaking"). Correct fix is **owner-run `supabase db pull`** (or `migration repair`) with the linked
  CLI — NOT a blind SQL insert (some historical files could be genuinely unapplied). Then flip
  `db-tests.yml` to a required PR gate.
- 🧑 **Cron paging-blind** — 21 jobs, 0 monitors; set `CRON_HEARTBEAT_BASE_URL`.
- LOW · Contact-only Market service (`service-booking-picker.tsx`) says "reach out to the space"
  with no DM affordance — needs a product decision on the Space DM target before wiring (ADR-596 §3/§7).
- 🟡 `check:canon` blind spot: it scans `content/**` only, so UI copy in `app/**`/`components/**`
  can drift off-canon (this pass found 4 such). Consider extending the guard to member-facing JSX strings.
- Owner config carried: `NEXT_PUBLIC_SITE_URL`, submit sitemap, leaked-password protection,
  disable anon sign-ins, Stripe go-live (A3).

## Completion roadmap (phases)

The remaining work, sequenced by risk + dependency. Each phase is one (or few) PRs, all
green (`tsc`/`lint`/`test`/`check:authz`/`check:canon`) before merge. Sign-off = merged +
its row here flipped to ✅.

| Phase | Scope | Risk | Sign-off criteria |
|---|---|---|---|
| **A. commerce_variants** | ✅ DONE. ① removed the null-only `variant_id` write (#1411, deployed); ② dropped the `variant_id` column + `commerce_variants` table (applied, verified gone). | Low (2-step, deploy-gated) | ✅ Column/table gone; checkout unaffected; tests green. |
| **B. Dependency hygiene** | ✅ DONE. Tree was already current — only `next` (16.2.9→16.2.10, exact-pinned) + `eslint-config-next` (lockstep) were behind; all other called-out packages already at latest. `postcss` deduped to the patched `8.5.16` (already in-tree via `@tailwindcss/postcss`) with a `pnpm.overrides` pin, clearing the last moderate advisory; the `uuid` vuln vanished with the Puck removal. Held majors `eslint`→10, `@types/node`→26 (Dependabot handles majors individually). **`pnpm audit`: 1 moderate → 0.** | Low-med (build+test per batch) | ✅ Build+test green; audit 0 (≤ prior); no major bumps. |
| **C. Stripe / economy atomicity** | Atomic RPCs for: ticket oversell reservation (`lib/billing/tickets.ts`), gem daily-cap (`lib/gems.ts`), notification-queue SKIP-LOCKED claim (`lib/queue/outbox.ts`), challenge/streak read-modify-write (`lib/achievements.ts`), journey-finish purse claim (`lib/quest/complete.ts`); + Stripe event-ordering guard. | High (needs RPC design + concurrency tests) | Each fix has an RPC migration + a concurrency/idempotency test; `test:rls` green. |
| **D. Performance** ⏳ | Authed `(main)/layout.tsx` serial-await tail → `Promise.all` + per-section `<Suspense>`; make `(marketing)`/`discover`/splash auth a client island so `revalidate` ISR isn't defeated by `cookies()`; events/messages serial chains → waves. **D1 shipped**: guarded the layout coach/tour reads behind their (shipped-OFF) flags + cached `getOnboardingStatus` (drops ~18 serial DB round-trips/navigation in the shipped state). **D2 shipped**: `/events` index loader — parallelized the 3 event-source reads + the 4 post-assembly reads (`Promise.all`). **D3 next**: messages/DM/room fetch waterfalls. | High (architectural; shell regressions) | Before/after render trace; shell not blocked; ISR restored on public routes; tests green. |
| **E. @measured/puck migration** | ✅ DONE (ADR-493). In-house `BlockRender` replaced Puck's rsc `<Render>` on the read path (#1434, golden-markup parity), then the in-house editor replaced `<Puck>` and `@measured/puck` was dropped from the tree (#1435). Persisted `Data` shape unchanged (zero doc migration). | High (multi-week, phased itself) | ✅ Published-page parity proven; dep removed; tests + build green. |
| **F. Lower-priority advisors** | ✅ policies DONE. Consolidated all `multiple_permissive_policies` (56 → 0): the 6 highest-count `{public}` tables (migration `20261004000000`) + the last 2 `{authenticated}` findings (`20261007000000`, #1438). ⚠️ leaked-password protection remains an **owner-only** dashboard toggle (Auth → Password protection; not a migration). | Med / config | ✅ Advisor `multiple_permissive_policies` 0; ⚠️ leaked-password documented for the owner. |

Execution order: A → B (safe, fast) → C → D (dedicated, test-gated) → F → E (largest).
Phases C–E are deliberately individual, verified PRs — not rushed in a batch, because their
failure modes (money races, shell regressions, published-page breakage) are not caught by
the unit suite.

## Status at a glance

| Area | State |
|---|---|
| Build / lint / tests | ✅ `pnpm build` compiles, lint clean, 3,378 tests pass |
| Supabase migrations | ✅ all repo migrations applied to prod; zero drift |
| Supabase advisors (initplan + unindexed FKs) | ✅ fixed + applied (`auth_rls_initplan` 6→0, unindexed FKs 13→0) |
| Timezones (LA home, per-event zones, member location) | ✅ shipped |
| Billing / reward correctness (safe subset) | ✅ shipped |
| Admin data-integrity + swallowed-error feedback | ✅ shipped |
| Naming / voice canon (bulk) | ✅ shipped |
| Moderation gate, marketplace refund | ✅ shipped |
| `@measured/puck` migration | ✅ done (in-house renderer #1434 + editor #1435; dep dropped) |
| a11y, performance, remaining tail | ✅ done (perf mediums #1436, a11y tail #1437); low-priority nits remain |
| Dependency hygiene / `pnpm audit` | ✅ done — audit 0 vulns; majors held (see Phase B) |
| Supabase `multiple_permissive_policies` | ✅ 56 → 0 (#1436-era + #1438) |

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
- **Stripe/economy races** (need atomic RPCs):
  - ✅ ~~gem daily-cap count-then-insert (`lib/gems.ts`)~~ — `award_gems_atomic` (C1, shipped).
  - ✅ ~~ticket oversell reservation (`lib/billing/tickets.ts`)~~ — `reserve_ticket_atomic` (C2, shipped).
  - ✅ ~~notification queue claim (`lib/queue/outbox.ts`, SKIP LOCKED)~~ — `claim_outbox_jobs` (C3, #1418).
  - ✅ ~~challenge/streak read-modify-write (`lib/achievements.ts`)~~ — `advance_challenge_progress` +
    `record_streak_tick` (C4, #1420); closes challenge purse double-pay + streak lost-increment.
  - ✅ ~~journey-finish Zap purse claim (`lib/quest/complete.ts`)~~ — C5: purse rides its own
    claim-then-pay `reward_grants` row, recovered on the alreadyDone path so a crash between the
    completion row and the award self-heals. No migration (reuses the existing unique constraint).
- ✅ ~~**Stripe subscription event ordering**~~ — DONE (ADR-494, migration
  `20261003000000`): `apply_membership_event_atomic` stamps `profiles.last_stripe_event_at`
  and applies only events with a strictly-newer `event.created`, under a per-profile advisory
  lock, so a delayed `subscription.updated(active)` can never re-grant a canceled tier.

### 🟠 Medium
- ✅ ~~**DB retirement**~~ — DONE (applied + verified): dropped `circle_topics`, `menu_config`,
  `listing_saves`, `library_renditions`, `library_usages`, `conversation_room_migration`,
  `commerce_variants` (+ its `variant_id` column) + RPCs `are_friends`,
  `get_my_{circle,hub,nexus,outpost}_id` (singulars), `housing_rentals_near`.
  Each verified 0 code refs / FKs / triggers / policy deps / body callers before drop.
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
- ✅ ~~**Anon-executable state-mutating SECURITY DEFINER RPCs**~~ — 🔴 HIGH, found in the follow-up
  security sweep, DONE (migration `20261005000000`, applied + verified + pgTAP guard). `reset_season`
  (platform season rollover), `adjust_ticket_sold` (ticket inventory), `set_node_geo` (node geofence),
  and `refresh_member_engagement_scores` (DoS) were `SECURITY DEFINER` with no internal auth check and
  EXECUTE-able by anon/authenticated. All revoked to `service_role` only; every caller already uses the
  admin client, so behavior is unchanged. (Distinct from the RPCs above, which are legitimately callable.)
- **Supabase advisors (remaining, lower priority)**:
  - ✅ ~~56 `multiple_permissive_policies`~~ — Phase F (migration `20261004000000`): consolidated the
    6 highest-count `{public}` tables (post_reactions, posts, applications, events, user_achievements,
    waitlist_entries) to one OR-merged permissive policy per (role, action). Advisor **56 → 2**;
    predicates byte-verified against live policies, RESTRICTIVE policies untouched.
    - ✅ ~~the 2 remaining `{authenticated}` findings~~ — migration `20261007000000`:
      `space_subscription_items` (2→1 OR merge) + `dispatch_likes` (split the `ALL` "manage own"
      policy into own INSERT/UPDATE/DELETE, kept the SELECT-true read). Advisor
      `multiple_permissive_policies` now **0** (applied + verified + pgTAP guard).
  - ⚠️ `auth_leaked_password_protection` off — **owner action** (Supabase Dashboard → Auth → Password
    protection; not a migration). Enable "leaked password protection" (HaveIBeenPwned check).
  - ⚠️ `auth_allow_anonymous_sign_ins` fires 147× but the code never calls `signInAnonymously`
    (verified: 0 refs). Almost certainly **enabled-but-unused** — **owner action**: disable anonymous
    sign-ins in Auth settings to close an unused JWT attack surface (verify first; nothing depends on it).
  - `rls_enabled_no_policy` (default-deny, informational); unused-index review now ~202 (mostly the
    FK covering indexes added in the advisor sweep — expected with no production traffic; do NOT drop
    pre-launch, revisit once query patterns are real). `spatial_ref_sys` ERROR = PostGIS reference
    table (documented no-action); `extension_in_public` (vector/postgis, 3) = low-risk hardening, left.
- **Help-doc naming audit**: sweep `content/help/**` for retired member terms
  (e.g. `the-quest/movement.md`, `on-air.md`, `zaps-and-gems.md`).
- ✅ ~~**Dependencies**: minor/patch bumps + 2 moderate transitive vulns~~ — DONE (Phase B). The
  tree was already current: only `next` 16.2.9→16.2.10 (+ `eslint-config-next` in lockstep) were
  behind; resend/stripe/supabase-js/lucide-react/tailwindcss/@sentry/@anthropic-ai/sdk/supabase CLI
  were all already at latest. The `uuid` vuln vanished with the `@measured/puck` removal (0 refs in
  the lockfile); `postcss` was deduped to the patched `8.5.16` (already in-tree via
  `@tailwindcss/postcss`) with a `pnpm.overrides` pin. **`pnpm audit`: 1 moderate → 0.** Majors held
  (`eslint`→10, `@types/node`→26; Dependabot ships those individually).

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
  `MapPreview`, `DeltaBadge`, `StudioSectionLabel`, `canSeeMenuCategory` — deliberately kept as
  intended-surface API. (The rest of the dead-code surface was swept — see Final verification scan.)

## Final verification scan (2026-07-02)

A full re-sweep (docs / SEO / AIO / security / speed + orphan/unwired/undeveloped hunt) after the
roadmap phases merged. Overall assessment: **~90/100 — launch-ready**, no correctness or security
bugs surfaced. Two things shipped from it; the rest is owner config + lower-priority polish.

> A deeper follow-up sweep of **wired admin surfaces, control boards, and member-facing features**
> (bug + unfinished-function hunt) is tracked in **[`docs/PATCH-LIST.md`](PATCH-LIST.md)** — a
> prioritized development list. It found no unguarded mutations and no dead controls, but one
> privacy leak (fixed), a data-integrity race + an economy double-award (P0), a few authz-axis
> mismatches (P1), and a broad silent-write-failure class (P2). The safe P0/P1 subset (journey-draft
> leak, duplicate Starter Circle, stranded bonus, marketplace writes, Support staff gate) is fixed;
> the rest is enumerated there with file:line + fix.

- ✅ ~~**Dead-code sweep**~~ — DONE. Removed **45 verified zero-reference symbols** (each re-checked
  with `rg -w` before deletion) + the orphaned `/coming-soon` page: 12 dead server actions
  (`equipCosmetic`, `revokeInviteLink`, `createDispatch`, `archiveFunnel`, `setAvatar`, `markOneRead`,
  `setSeatQuantity`, `setModeLabelOverride`, and the legacy `journeys/actions.ts` journey-CRUD cluster
  superseded by `create-actions.ts`), 3 orphaned journey discovery-widget components, 14 unused
  singletons, 12 dead types, and 1 barrel re-export (`eraseMemberContext`). Kept the intentionally
  **staged-not-rot** work (`lib/spaces/content-actions.ts`, the `*Live` pricing/entitlement gates).
  tsc/lint/test all green after the sweep (no test referenced the removed code — confirming dead).
- ✅ ~~**Gift Gems had no UI**~~ — DONE. The race-safe `giftGems` → `gift_gems_atomic` backend
  (ADR-305) was fully built but unreachable. Wired it: `searchGiftRecipients` (SEC-10-safe member
  search) + `GiftGemsDialog` + a trigger in the Vault Store widget (outside the CrewGate). Added
  `lib/rewards/gifts.test.ts` (the input-guard money-path contract, previously untested). **Policy
  resolved:** gifting is open to ANY member with a spendable balance (`balance > 0`), aligning the UI
  with the deliberately tier-agnostic backend (generosity is ungated; no spendable value is created,
  only moved). Member-facing docs shipped: a "Gifting Gems" section in
  `content/help/membership/the-gem-store.md` + a `docs/CHANGELOG.md` entry.
- ⏳ **SEO owner step** — submit `sitemap.xml` to Google Search Console + Bing (needs domain
  verification creds). Note: `lib/site.ts` now falls back to the production apex
  `https://frequencylocal.com`, so canonical/OG/sitemap/JSON-LD are correct even without
  `NEXT_PUBLIC_SITE_URL` set (the old `SEO-AEO-PLAN.md` warning about the vercel.app fallback is stale).
- ⏳ **Still-dormant, wire before billing goes live**: `confirmSupporterContribution`
  (`app/(main)/upgrade/actions.ts`) has no caller and no test — the PWYW supporter-contribution
  confirm half. Intentional pre-launch (behind `billing_live`), flagged so it isn't forgotten.
- ⏳ **Lower-priority polish** (unchanged): operator/admin em dashes, 26 raw `<img>` → `next/image` on
  the few LCP-ish surfaces, extend JSON-LD to circle/journey detail, axe/a11y CI gate, E2E coverage.
