# Architecture Decision Records

This file consolidates the **design decisions + reasoning** that were previously
scattered across Notion's "Website Development" database. Those Notion pages have
drifted (stale geography, dropped tables, Stripe-as-live) and are no longer
authoritative. Each ADR below records only a decision whose *rationale* is still
true and is **not** already captured in [ARCHITECTURE.md](ARCHITECTURE.md),
[DATABASE.md](DATABASE.md), or [GLOSSARY.md](GLOSSARY.md), and that is
corroborated against the running code / `supabase/migrations/`. Where Notion
conflicted with code, code wins and the conflict is noted.

Authority order: running code + migrations > repo `docs/` + `ROADMAP.md` > Notion.

---

## ADR-001: `proxy.ts`, not `middleware.ts` (Next.js 16 convention)

**Status:** Accepted · corroborated by `proxy.ts` (`export async function proxy`)
**Context:** Next.js 16 renamed the edge entry convention from `middleware.ts`/`middleware()`
to `proxy.ts`/`proxy()`. An earlier session renamed the file to `middleware.ts`,
which Next 16 silently ignored — producing intermittent logouts and unenforced
protected routes. (Some Notion pages still carry the old "rename to middleware" note;
those are superseded by later in-page corrections and by the code.)
**Decision:** Keep the root file named `proxy.ts` exporting `proxy()`. It builds a
Supabase SSR client, calls `getUser()` to refresh the session on every request, and
redirects unauthenticated users away from protected paths.
**Consequences:** Do **not** rename to `middleware.ts`. Add no logic (not even a stray
`await`) between `createServerClient()` and `getUser()` — it can silently break cookie
refresh. `.ics` paths are excluded from the auth gate (shareable calendar feeds).
See [ARCHITECTURE.md](ARCHITECTURE.md#stack).

## ADR-002: Admin client uses `createServerClient` from `@supabase/ssr`

**Status:** Accepted · corroborated by `lib/supabase/admin.ts`
**Context:** `lib/supabase/admin.ts` originally used `createClient` from
`@supabase/supabase-js`. In the App Router SSR context that client silently returned
empty results even with a valid service-role key, causing production 404s on profile
pages. (A second cause was a mis-set key — the `SUPABASE_SERVICE_ROLE_KEY` was actually
the anon key; verify by decoding the JWT `role` claim.)
**Decision:** Build the service-role client with `createServerClient` (the same package
used everywhere else) and empty cookie stubs (`getAll → []`, `setAll → {}`), since it
authenticates via the service-role key, not a session cookie.
**Consequences:** One Supabase client package across all server code; no version-skew
or SSR-init surprises. The empty stubs satisfy the API contract without cookie I/O.
The RLS-bypass authorization implications are documented in
[ARCHITECTURE.md](ARCHITECTURE.md#authorization-model--read-this-first).

## ADR-003: Layout-as-auth-gate for the `(main)` route group

**Status:** Accepted · corroborated by `app/(main)/layout.tsx`, `components/layout/app-shell.tsx`
**Context:** Authenticated pages needed a single, reliable auth + profile gate without
per-page boilerplate, plus role-gated nav with no client-side role fetch or flash.
**Decision:** `app/(main)/layout.tsx` (server) runs `getUser()` (→ `/sign-in`), fetches
the profile (→ `/onboarding` if none), and passes `profile` into the `<AppShell>`
**client** component. The server/client split exists because `usePathname()` (active-nav
highlighting) only works client-side; data flows one way (server fetches, client renders).
Role-gated UI is decided from the server-provided `profile.community_role`.
**Consequences:** Any page added under `(main)/` inherits auth + shell for free. Pages
*outside* the group (`/people/[handle]`, `/onboarding`, `/sign-in`) handle their own auth.
No flash of wrong role UI, no loading state for role.

## ADR-004: Four SECURITY DEFINER RLS helpers, with pinned `search_path`

**Status:** Accepted · corroborated by `supabase/migrations/20240101000001_rls_policies.sql`
**Context:** Almost every RLS policy needs the caller's profile id, role, and scope.
Inlining a correlated subquery in every policy hurts plan quality and is repetitive.
**Decision:** Provide SECURITY DEFINER helpers (`get_my_role`, `get_my_profile_id`,
`get_my_region_id`, plus group/circle scope helpers) and pin `SET search_path = public`
on each. Role checks rely on Postgres enum ordering so `get_my_role() >= 'crew'` works.
**Consequences:** `search_path` pinning blocks search-path-injection (a malicious schema
shadowing `profiles`). An unauthenticated caller returns NULL, making every `>=` check
falsy — safe by default. Note: the enum's *original* order was `member..mentor`;
`janitor` was appended later (`20240108…`), so it sorts highest. Scope arrays use
`COALESCE(…, '{}')` so `ANY(...)` never receives NULL.
**Drift note:** This migration still references the pre-v2 `groups` / `get_my_group_ids()`
(dropped in `20240102000000_hierarchy_v2.sql`). The *helper pattern and rationale* remain
correct; the specific group-scoped policies were superseded by the hierarchy v2/v3 model.

## ADR-005: Hosts cancel events; only mentors hard-delete

**Status:** Accepted · corroborated by the events policies in `20240101000001_rls_policies.sql`
**Context:** Event rows carry RSVPs and history; an accidental host DELETE would lose that.
**Decision:** Hosts flip `is_cancelled = true` (soft cancel); hard `DELETE` is restricted
to mentor (and above). The distinction is called out in policy comments.
**Consequences:** Cancellation is recoverable and keeps the attendee record. Do not add a
host-level DELETE policy. The public ICS feed emits `STATUS:CANCELLED` for cancelled events.

## ADR-006: Hierarchy evolution — v1 `groups` → v2 place-tree → v3 topical channels

**Status:** Accepted · corroborated by `20240102000000_hierarchy_v2.sql`,
`20240201000000_hierarchy_v3_topical_channels.sql`
**Context:** v1 used a monolithic `groups` / `group_memberships` table. It could not
express the intended geography or let practice-topic span localities.
**Decision (v2):** Drop `groups`/`group_memberships`; introduce the place tree
`outposts → nexuses → hubs → circles` with `memberships`, plus scope-bound `channels`.
**Decision (v3):** Add **global** `topical_channels` (janitor-managed practice forums)
that Circles link to via `circles.topical_channel_id`, layered on top of the place tree —
clusters *emerge*, they are not appointed.
**Consequences:** Two distinct "channel" concepts coexist (topical vs legacy scoped) — see
[GLOSSARY.md](GLOSSARY.md). The old `region/outpost/nexus/hub/circle` 5-tier framing and
`circle.type` values `general/interest/project/support` from early Notion docs are **wrong**;
the live `circle_type` enum is `in-person`/`online`. `nexus_regions` survives only as legacy
geography behind `get_my_region_id()`.

## ADR-007: Recurring events use a simple enum, not RFC 5545 RRULE

**Status:** Accepted · corroborated by `supabase/migrations/20240208000000_event_recurrence.sql`
**Context:** Real Frequency cadences are "Wednesday Morning Ride" / "monthly gathering" —
covered by daily/weekly/monthly. Full RRULE parsing is heavy for that payoff.
**Decision:** `events.recurrence_type` is a CHECK-constrained text enum
(`none`/`daily`/`weekly`/`monthly`) with `recurrence_until` and a self-referential
`parent_event_id`. Occurrences are **materialised** rows (not virtual), generated for a
~60-day window: synchronously on create for immediate visibility, then rolled forward by
the daily `event-occurrences` cron. A CHECK prevents an occurrence from itself recurring.
**Consequences:** Promotable to RRULE later without data loss (keep the enum as the simple
path). Materialised occurrences mean RSVPs/reminders/ICS work per-instance with no virtual
expansion. See `lib/event-recurrence.ts` and [ARCHITECTURE.md](ARCHITECTURE.md#cron).

## ADR-008: Shareable ICS via an unauthenticated route using the admin client

**Status:** Accepted · corroborated by `app/events/[slug]/event.ics/route.ts`, `proxy.ts`
**Context:** "Add to Calendar" links are pasted into emails/calendars and must resolve for
anyone with the link, without a login.
**Decision:** Serve a hand-built RFC 5545 VCALENDAR from a public route outside the
`(main)` group, reading via the admin client. `proxy.ts` excludes `*.ics` from the auth
gate. Hidden/cancelled/past events still return a file (the holder already has the link;
cancelled emits `STATUS:CANCELLED`), matching Google Calendar behaviour.
**Consequences:** Correct line-folding at 75 octets and escaping of `,;\\\n`. No new
public data surface beyond what `public_landing_reads` already exposes for events.

## ADR-009: Presence via a `last_seen_at` heartbeat on `profiles` (no Realtime)

**Status:** Accepted · corroborated by `20240202000000_profile_presence.sql`,
`lib/presence.ts`, `components/presence/{heartbeat,actions}.tsx`
**Context:** "Online now" needed a cheap, good-enough signal at the current community size.
**Decision:** A client heartbeat fires every 90s while the tab is visible (pauses on
`document.hidden`, re-fires on `visibilitychange`) and a server action stamps
`profiles.last_seen_at = now()` via the admin client (no-op if signed out). `isOnline()`
uses a 5-minute threshold (`ONLINE_MS`; ~3 missed heartbeats of grace); `RECENT_MS` = 60m.
The column is nullable with a partial index `WHERE last_seen_at IS NOT NULL`.
**Consequences:** No Supabase Realtime subscription — dots refresh on next render, not live
(deliberate, to avoid per-page socket cost). At thousands of concurrent sessions, move the
heartbeat to a dedicated `profile_presence` table to avoid churning `profiles`. The
sidebar "Active Members" widget is **community-wide online-first** (not strictly
circle-scoped) because at current size a strict circle filter showed no one online.

## ADR-010: Right sidebar is a streamed slot, composed by role

**Status:** Accepted · corroborated by `components/sidebar/right-sidebar.tsx`,
`app/(main)/layout.tsx`, `components/layout/app-shell.tsx`
**Context:** Wanted a sidebar of independent widgets without editing every page and without
blocking page render on sidebar queries.
**Decision:** The server layout builds `<RightSidebar>` (a server component with its own
queries) wrapped in `<Suspense>`, and passes it as a `sidebar?: React.ReactNode` prop into
the client `<AppShell>`. AppShell uses `usePathname()` to decide whether to show it. Each
widget is its own server component, composed by role (member → Members; crew+ → +Leaderboard;
host+ → +Announcements).
**Consequences:** Adding a widget = new server component + a role gate, zero page changes;
the sidebar streams independently (skeleton while loading). Hidden on chat threads /
settings / admin where it would crowd the view (the exact exclusion set has shifted over
time — `/messages/<id>` thread views hide it while the `/messages` index keeps it; consult
`app-shell.tsx` for the live list rather than older Notion notes).

## ADR-011: Hand-written Tailwind v4 — no component library

**Status:** Accepted · corroborated by `package.json` (no `shadcn`/Radix deps)
**Context:** Early setup notes mention `shadcn/ui init`, and `ARCHITECTURE.md` still lists
shadcn/ui in the stack. The shipped code uses **none** — UI is hand-written Tailwind v4
(`@import "tailwindcss"`) plus `lucide-react` icons only.
**Decision:** Keep components hand-written against the DAWN semantic-token layer; do not
add a component-library dependency.
**Consequences:** No component-library version surface; full control of markup/markup-tokens.
(Trust the code over the docs here — `ARCHITECTURE.md`'s shadcn/ui mention is stale and
should be corrected.) Styling tokens live in `app/globals.css`; see
[ARCHITECTURE.md](ARCHITECTURE.md#styling--design-tokens-dawn).

## ADR-012: Season ranks renamed off martial-arts; Luminary auto-caps at Conduit

**Status:** Accepted · corroborated by `20240115000000_rename_season_ranks.sql`
**Context:** The original `season_rank_enum` used martial-arts names
(deshi/sempai/sensei/…/bodhisattva) that did not fit the brand.
**Decision:** Rename to `ghost → runner → operative → agent → conduit → luminary`. The
DB trigger auto-advances rank on crew completions but **stops at `conduit`**; `luminary`
is a manual admin promotion gated on `season_challenges_complete`.
**Consequences:** Auto-advance can never hand out the top rank. The martial-arts names are
**legacy — ignore them** (also noted in [GLOSSARY.md](GLOSSARY.md#gamification)).

## ADR-013: Dual currency — seasonal Zaps reset and convert to permanent Gems

**Status:** Accepted · corroborated by `20240120000000_gems_economy.sql`,
`20240121000000_gem_store.sql`, `lib/gems.ts`
**Context:** Wanted a resettable competitive signal (seasons) *and* a durable reputation
currency, without one cannibalising the other.
**Decision:** **Zaps** are seasonal XP that drive ranks and reset each ~13-week season.
**Gems** are permanent and never reset; they are earned via daily-capped micro-rewards and,
at season end, by converting leftover Zaps to Gems at a **rank-based rate** (lower ranks
convert more Zaps per Gem; higher ranks fewer), then minting a `season_trophy`.
**Consequences:** Grinding Zaps (the crew path) yields the most Gems, while non-crew members
still accrue Gems slowly through daily engagement. Gems are spendable in the crew store
(cosmetics/titles). Terminology is canonical: say **zaps**, not "points".

## ADR-014: `am_participant()` SECURITY DEFINER gate for direct messages

**Status:** Accepted · corroborated by `supabase/migrations/20240103000000_direct_messages.sql`
**Context:** DM tables (`conversations`, `conversation_participants`, `messages`) must be
readable/writable only by the people in the thread, without recursive policy evaluation.
**Decision:** A single SECURITY DEFINER helper `am_participant(conversation_id)` maps
`auth.uid()` → profile → participant row; every DM policy is expressed in terms of it.
Message INSERT additionally requires `sender_id = own profile`.
**Consequences:** Realtime requires `ALTER PUBLICATION supabase_realtime ADD TABLE messages`
(a manual Supabase step) for live threads. DM/Group-DM *creation* is later gated by the
`friendships` graph (`20240203000000_friendships.sql`); the per-row read/write gate stays
`am_participant`.

## ADR-015: Friendship graph — one canonically-ordered row per pair, no `declined` tombstone

**Status:** Accepted · corroborated by `supabase/migrations/20240203000000_friendships.sql`,
`app/(main)/people/friend-actions.ts`
**Context:** DM and Group-DM *creation* needed a gate (see ADR-014, which records that
`am_participant` stays the per-row read/write gate while creation is gated by the graph).
A friendship is inherently symmetric, so the model must make reverse-direction duplicates
(A→B and B→A) impossible and must let a declined requester try again later.
**Decision:** A single `friendships` row per pair with a `CHECK (user_a_id < user_b_id)`
canonical-ordering constraint plus `UNIQUE (user_a_id, user_b_id)` — duplicates are
structurally impossible regardless of who initiates. `requested_by` records the initiator
(constrained to be one of the two parties); `status` is `pending` until the addressee
accepts, then `accepted`. **Decline, cancel, and unfriend all DELETE the row** (there is no
`declined` state) so no tombstone blocks a future request. An order-independent
`are_friends(a, b)` SQL helper (`LEAST`/`GREATEST`) backs the server-action gates:
1:1 DM (`startConversation`) requires accepted friends; Group DM (`startGroupConversation`)
requires the creator be accepted friends with **every** invitee. RLS: UPDATE-to-accepted is
allowed only for the addressee (`caller IN (user_a,user_b) AND caller <> requested_by`).
A migration backfill auto-friends every pair that has co-existed in any
`conversation_participants` row (`ON CONFLICT DO NOTHING`) so pre-existing threads keep working.
**Consequences:** **Rooms are deliberately NOT gated** — they are scope-based and already
require crew+. No blocking in v1 (unfriend suffices); a `blocked` state would be a separate
column/table. Adding members to an *existing* Room or Group DM is not gated either — flagged
for revisit if abused. Realtime/grandfathering caveats from ADR-014 still apply.

## ADR-016: DAWN is a semantic CSS-variable token layer; dark mode swaps the variable, not the utility

**Status:** Accepted · corroborated by `app/globals.css`, `lib/season-ranks.ts`, PR #3
(`f1f9299`). Supersedes the earlier indigo/charcoal brand decisions.
**Context:** The app was first built with raw `indigo-*` utilities, then a brand pass remapped
the Tailwind `indigo` scale to a charcoal palette at the `@theme` level (so every existing
`bg-indigo-*` propagated brand color with zero component edits). That charcoal-scale remap is
now **superseded**: the live palette is the amber-gold **DAWN** layer (`--color-primary`
`#E2912F` light / `#F2B14E` dark) — the indigo/charcoal brand-override notes are stale.
ADR-011 already records *why there is no component library*; this ADR records *how color works*.
**Decision:** Every color is a semantic CSS variable defined once in `:root` (light) and `.dark`
(dark) in `app/globals.css`; `@theme inline` maps them to Tailwind v4 utilities. Components
write a single token utility (`bg-surface`, `text-muted`, `text-primary-strong`) — **never**
`bg-white dark:bg-gray-900` pairs, because `.dark` swaps the variable underneath. Specific rules
that are easy to get wrong: **dark mode reads via surface lightness, not shadows**
(`canvas → surface → surface-elevated`); the **amber primary uses dark text on its fill**
(`--color-text-on-primary` `#2A1B06`) because white-on-amber fails WCAG — amber-as-link uses
`--color-primary-strong` instead of the raw fill; the **10-color rank spectrum**
(`stone/clay/gold/olive/jade/teal/slate/indigo/plum/rose`, each exposing `core/deep/bright`)
is a primitive consumed by `.rank-badge` via `color-mix`, and the season-rank ladder maps onto
it (ghost=stone → … → luminary=gold) in `lib/season-ranks.ts`. A pre-paint inline script reads
`localStorage('freq-theme')` (default `system`) and syncs `<meta name="theme-color">` to avoid
a flash.
**Consequences:** Adding a state color still means editing globals.css in three places (light
`:root`, `.dark`, `@theme inline`) per ARCHITECTURE.md — Tailwind v4 only emits a utility whose
class string is scanned. Nunito remains the brand typeface (the only surviving piece of the
earlier brand pass). Email templates (`lib/email.ts`) can't use CSS vars, so DAWN light-mode hex
is inlined there separately. Trust globals.css over any Notion "indigo"/"charcoal" color note.

## ADR-017: One capability resolver is the single source for authz + inline affordances

**Status:** Accepted · corroborated by `lib/core/capabilities.ts`, `lib/core/load-capabilities.ts`, `app/(main)/circles/[slug]/page.tsx`
**Context:** Host/admin checks were scattered (`host_id === me`, `isCrew` role-string arrays, host-only UI blocks), so "who can do what" was inconsistent and impossible to share with a future mobile client.
**Decision:** A pure `resolveCapabilities(viewer, scope)` returns a capability set; a server seam (`load-capabilities`) fetches the inputs (role, membership, ownership, parent leadership) and feeds it. The **same** set drives UI affordances (`<Can>`) and is re-checked server-side before mutations. Circle management is `circle.editSettings`, granted to the host, janitors, and the guide/mentor who leads the circle's hub/nexus (`viewerManagesParent`, derived from `hubs.guide_id` / `nexuses.mentor_id`).
**Consequences:** New surfaces gate by capability, not ad-hoc role strings. Capabilities are UX for the client, **law** for the server — never trust the client's set. Framework-independent (no Next/Supabase imports) so mobile reuses it. The flat `isHostPlus` checks in `ContextActions` (events/dispatch/post menus) remain and can migrate to scope-aware capabilities later.

## ADR-018: Presentation-neutral contract layer (view-models carry data + capabilities)

**Status:** Accepted · corroborated by `lib/contract/`
**Context:** Business logic and entity shapes lived inside RSC/React, which would trap them when the mobile app arrives.
**Decision:** `lib/contract/` defines presentation-neutral view-models (`CircleView`, `ProfileView`, `FeedView`) that bundle data **with** the viewer's capabilities; view-builders (`getCircleView`, `getProfileView`) compose them. Web renders them now; mobile consumes the identical shapes later (via RPC/endpoint).
**Consequences:** One contract both clients code against; clients render affordances from `capabilities` without recomputing policy.

## ADR-019: Engagement event ledger sits *in front of* the existing rules engine

**Status:** Accepted · corroborated by migration `20240215000000_engagement_events`, `lib/engagement/events.ts`
**Context:** Reward-earning actions ran inline (`processGamificationEvent` + `awardGems`) with no persisted, idempotent record — fine for web clicks, unsafe for retried physical scans.
**Decision:** An append-only `engagement_events` ledger with a unique `idempotency_key` (exactly-once) wraps the existing achievements/quests/challenges engine: `recordEngagementEvent` inserts, then runs the rules engine **only on first insert**. Existing direct callers keep working unchanged.
**Consequences:** Physical and (future) migrated web sources gain persistence + exactly-once + a verification hook without rewriting the rules engine. Service-role writes only; read-own RLS.

## ADR-020: Physical-trigger rewards are server-authoritative

**Status:** Accepted · corroborated by migration `20240216000000_physical_nodes`, `lib/engagement/verify.ts`, `lib/engagement/capture.ts`
**Context:** QR payloads, NFC taps, and GPS are trivially spoofable; trusting the device would make rewards farmable, and ghost-node coordinates must stay hidden.
**Decision:** `nodes` (QR / NFC / ghost) + `captures`, with RLS that denies **all** client reads of `nodes` (protects secrets + coordinates). `verifyCapture` checks validity window, signed payload, capture rule, and PostGIS proximity (`node_within_range`) on the server; `captureNode` then verifies → ledgers → logs the capture → awards zaps. Trust lives on the server, never the device.
**Consequences:** Clients can never read node secrets/coords or self-grant. Device attestation / P2P mutual-confirm still to add; repeatable-node idempotency keying is a TODO.

## ADR-021: Reward currency is split by where the activity happens (refines ADR-013)

**Status:** Accepted · refines ADR-013 · corroborated by `lib/zaps.ts`, `lib/engagement/currency.ts`, `app/(main)/events/actions.ts`
**Context:** ADR-013 set seasonal Zaps → permanent Gems but not which actions earn which.
**Decision:** **Gems** reward internal/on-platform (web) engagement; **Zaps** reward external + in-person activity (outreach, invites, in-person event hosting, ghost-node/QR/NFC captures, partner programs). `currencyForSource(source)` maps each engagement source; `awardZaps` mirrors `awardGems`. In-person event **hosting** now awards zaps; **attendance** zaps are deferred to verified check-in (ROADMAP P2.13) — RSVP stays a gems web-action (rewarding RSVP would be gameable). Season rollover (rank-based, `reset_season`) is unchanged.
**Consequences:** New earn-sources route to the correct currency by `source`. Point **values** remain a product decision, kept tunable (`ZAP_AMOUNTS`, `nodes.zaps_value`).

## ADR-022: Durable async job queue for drop-prone side-effects

**Status:** Accepted · corroborated by migration `20240219000000_notification_queue`, `lib/queue/outbox.ts`, `app/api/cron/process-queue/route.ts`
**Context:** Notifications/fan-out ran inline; a provider outage mid-dispatch dropped them silently.
**Decision:** A `notification_queue` (outbox) drained by `/api/cron/process-queue` (every 2 min) with retries + exponential backoff; `enqueue` / `processQueue` are the primitives; a durable web-push handler ships. Service-role only.
**Consequences:** Side-effects survive transient failures. Migrating existing inline sends onto the queue, and a `SELECT … FOR UPDATE SKIP LOCKED` claim for concurrency, are follow-ups.

## ADR-023: Partners/businesses module; a plaque is a node linked to a partner

**Status:** Accepted · corroborated by migration `20240218000000_partners_module`, `lib/partners/read.ts`, `app/(main)/partners/`
**Context:** The physical layer needs aligned local businesses — a geolocated directory, member offers, and NFC-plaque/QR claims.
**Decision:** `partners` + `partner_offers` + `partner_redemptions` + `nodes.partner_id`. Directory/offers are public-when-active (for the map/discover layer), redemptions are read-own, writes are service-role. A business plaque is a `node` with `partner_id` — claiming runs the same verified capture pipeline (ADR-020).
**Consequences:** Directory + detail pages render from the read layer. Redemption-on-capture (claim → log `partner_redemptions` + show discount) is the next wiring.

## ADR-024: North Star is Weekly Active Members; `practice.verified` is the canonical event

**Status:** Accepted · governs [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) §0
**Context:** Gamification can drift toward rewarding social activity (scrolling), diluting intrinsic motivation. The product's value is real-world transformation, not engagement-for-its-own-sake.
**Decision:** The North-Star metric is **Weekly Active Members** — members with ≥1 **verified practice** (check-in / attended session / logged practice) in a rolling 7 days. `practice.verified` is the canonical highest-value event on the engagement backbone. Zaps + streaks key on verified practice **above** social; activation = first verified practice within N days of joining (instrument first); analytics' hero metric is WAM (= practice retention); counter-metric = practice repeat/quality.
**Consequences:** New earn-rules and analytics optimize for verified practice. `practice.verified` sources (event check-in, logged practice, verified node check-in) run through the existing verifier (ADR-020) so "verified" is server-true. Refines ADR-013/021: gems = web/social, zaps top out at verified practice. Point values stay tunable (product).

## ADR-025: One event backbone, many projections

**Status:** Accepted · corroborated by `lib/engagement/events.ts` · governs COMMS-CRM §1
**Context:** The loyalty/gamification ledger, the notification spine's trigger source, and the CRM activity timeline are secretly the same stream; building three would fork the truth.
**Decision:** `engagement_events` is the **single** append-only stream. Gamification, notifications, the CRM contact timeline, analytics, and the AI agent are **projections/subscribers** — none keeps its own event log. The notification spine, CRM `engagement_score`, and WAM are read-models off it.
**Consequences:** Always add a subscriber/projection, never a parallel log. One idempotency + audit surface. The CRM timeline is a `lib/contract` projection.

## ADR-026: Communications spine — one router/registry, everything queued

**Status:** Accepted · corroborated by `lib/queue/outbox.ts` + `notification_queue` · governs COMMS-CRM §2
**Context:** Email sends inline today (fire-and-forget) → per-site duplication and no deliverability feedback loop.
**Decision:** Everything sends through the durable outbox via a single **router/registry** (event → category → channels → template) with a hard central **consent + suppression** layer + idempotency + batching. Resend webhooks write delivery/engagement back to an `email_events` table and auto-suppress bad addresses. Reputation isolation via separate transactional/marketing subdomains. Four lanes (L1 transactional … L4 community); two scoped consent surfaces — `contacts.consent_state` (L2 marketing/funnel) and `notification_preferences` (L3–4 product) — plus a global suppressions override; marketing is double-opt-in.
**Consequences:** No inline sends; one place defines who-gets-what. Step 1 is migrating existing inline email onto the queue. Templates move to React Email.

## ADR-027: The Studio — admin route group, separate staff roles, unified contacts

**Status:** Accepted · governs COMMS-CRM §3
**Context:** A business/CRM cockpit needs operator tooling distinct from member chrome and from community moderation.
**Decision:** `app/(studio)/` mounted at `/studio`, gated once at its layout. **Staff roles are a separate authz axis** — a `team_members` table (owner/admin/marketer/analyst) via `lib/staff.ts requireStaff()`, distinct from community roles. A unified **`contacts`** table (lowercased email = unique join key; nullable `profile_id` auto-linked on signup) is the CRM spine; `engagement_score` is a projection off the event backbone + `email_events`.
**Consequences:** The community-role capability resolver (ADR-017) is untouched; staff authz runs in parallel. The Studio reuses the spine, preferences, unsubscribe tokens, and community schema — a new layer, not a rewrite.

## ADR-028: The AI agent acts only through the spine + a bounded tool surface

**Status:** Accepted · governs COMMS-CRM §4
**Context:** An autonomous operator touching member communications is high-risk (consent, frequency, PII, trust).
**Decision:** The agent acts **only** via the spine and a bounded tool set (`query_contacts`, `get_pipeline_health`, `draft_message`, `enqueue_send`, `move_stage`, `create_task`, `propose_rule`, `flag_for_human`) — so consent/suppression/frequency caps are structural guardrails it cannot bypass. **Copilot-first:** it proposes into an Action Queue for one-click human approval; per-action-type autonomy graduates via an approval-flag as the audit log earns it. Governance: autonomy tiers, hard frequency + spend/volume caps, dry-run, kill switch, full audit log with rationale.
**Consequences:** **No agent autonomy until a test harness around spine/consent/suppression exists** (non-negotiable — repo has no test framework today). Agent scope includes community health, not just marketing.

---

> **ADR-029 → ADR-036 record the seams for the whole-platform vision** (one community
> graph, two legal entities, one game, marketplace + sessions + affiliate + donations as
> modules). They are **target decisions**: the rationale is accepted, but most are **not
> yet built**: code + `supabase/migrations/` remain the truth until each migration lands.
> Full picture: [PLATFORM-VISION.md](PLATFORM-VISION.md).

## ADR-029: One community graph, money hard-partitioned by legal entity

**Status:** Accepted (target) · governs [PLATFORM-VISION.md](PLATFORM-VISION.md) §0–1
**Context:** Frequency is one product over two legal entities, **Frequency Foundation**
(501c3 nonprofit: free community, seed programs, donations/grants) and **Frequency Labs**
(for-profit: Lab subscriptions, marketplace, sessions, affiliate, paid depth tiers). The
same website + database serve both. A 501c3 commingling funds with a for-profit is a
compliance/audit problem, not a style choice.
**Decision:** **The community graph and the engagement/game ledger are SHARED and
ENTITY-BLIND; the FINANCIAL ledger is HARD-PARTITIONED by entity, and the two money
systems never commingle.** Three rails: (1) community graph (shared), (2) engagement
ledger, zaps/gems/ranks (shared, entity-blind), (3) **financial** ledger (partitioned,
`entity`-tagged). A check-in at a *for-profit* Lab earns *shared* community points (the
glue); but **every dollar carries an immutable `entity` tag** (`foundation` | `labs`) and
cannot leak across. Two Stripe relationships, separate reconciliation/reporting.
**Consequences:** Points are not money; points are not entity-bound but **every dollar
is**. Inter-entity value flows (for-profit→Foundation donation, Foundation→for-profit
services agreement) are **first-class audited ledger entries**: the *mechanism* is a
legal decision (PLATFORM-VISION §10), the architecture only records it. Reverses any
"one Stripe with a flag" shortcut.

## ADR-030: Identity is three orthogonal axes; persona is a multi-select hat

**Status:** Accepted (target) · governs PLATFORM-VISION §2 · refines DATABASE.md
(`profiles.entity_types`)
**Context:** "Different sign-up tracks" and "many roles as we grow" (general member,
practitioner, business/seller, affiliate, host) must not be modeled as one inflating role
enum. A practitioner is **not** "above" a member, and one human can be several at once.
**Decision:** Three **independent** axes: **(1) trust/role ladder** (`community_role`,
unchanged), **(2) staff/ops role** (`team_members`, ADR-027, unchanged), **(3) persona /
track**: a **multi-select set** of `profile_personas` rows, each with its own `state`
(claimed → verified → active → suspended) and, where money is involved, its own **Stripe
Connect account binding + `entity`**. Nav + capabilities = **union of (trust-role ⊕ each
active persona ⊕ scope)** via the existing resolver (ADR-017). **Verification is
per-persona, not per-user** ("verified practitioner" ≠ "verified business"); some
capabilities (esp. *receive money*) gate on verified state.
**Consequences:** Adding a track = a new persona + its capabilities/nav; the role ladder
stays 6 tiers (ADR-034). The existing `profiles.entity_types text[]` stays as the
lightweight **directory-kind** tag (vendor/performer/service); `profile_personas` is the
**richer** layer for any persona gating capabilities/onboarding/money, **do not
duplicate**. The stripped-down mobile app shows the right hats with zero extra logic.

## ADR-031: Membership is one freemium tier ladder; tiers carry entity + revenue_type

**Status:** Accepted (target) · governs PLATFORM-VISION §3 · generalizes the `crew` tier
(GLOSSARY)
**Context:** Free community (Foundation) vs paid "depth"/Lab subscription (Labs) is a
freemium ladder, but a paid tier whose free version is a *nonprofit program* and whose
paid version is *for-profit revenue* crosses an entity boundary (UBI / charitable-purpose
risk).
**Decision:** Membership is **one tier ladder on one profile**, read by the same resolver
that gates everything, a **generalization of the existing `crew` paid tier**, not a new
system. The **tier object carries `entity` + `revenue_type`** (`donation` | `dues` |
`commerce`) so one smooth "upgrade for more depth" UX routes to the correct legal home +
Stripe relationship without a rebuild. **Which entity sells the paid tier is an open legal
decision** (PLATFORM-VISION §10), architecture supports either.
**Consequences:** No code path assumes the paid tier belongs to one entity. `crew`'s
"$10/mo, free during beta, `isCrew = role !== 'member'`" framing is subsumed by the tier
ladder. Billing wiring (ROADMAP P4) implements *against the tier object*, not a hardcoded
plan.

## ADR-032: Dual financial ledger: append-only, idempotent, entity-tagged, twin to engagement

**Status:** Accepted (target) · governs PLATFORM-VISION §1 · twins ADR-019
**Context:** Marketplace sales, paid programs, affiliate commissions, Lab subscriptions,
and donations all move **real money to third parties** (owner confirmed). This requires
**Stripe Connect (multiparty)**: connected accounts + KYC for anyone who *receives*
money, and an auditable money source-of-truth.
**Decision:** A **new** append-only `financial_transactions` ledger (double-entry-style,
idempotent, reconciled against Stripe webhooks) is the source of truth for "who is owed
what." It is the **money twin** of the `engagement_events` ledger (ADR-019) but a
**separate table**: gems/zaps and dollars **never** share a ledger. Every row is
`entity`-tagged (ADR-029). Refunds, disputes, chargebacks, holds, and payouts are modeled
states **from day one** (a clawed-back payout is a real state). One **payments module**
(`create_checkout`, `process_payout`, `record_commission`) serves marketplace + programs +
affiliate, built once, not re-invented per vertical.
**Consequences:** "Receive money" becomes a **persona-gated, Connect-verified** onboarding
step (ADR-030). Apple/Google's digital-vs-physical 30% rule attaches to the sellable item
(ADR-036). No vertical writes its own ad-hoc payment code. The stale "Stripe-as-live" note
(DECISIONS preamble) is replaced by this greenfield Connect design.

## ADR-033: Each vertical is an entity-tagged module against a registry

**Status:** Accepted (target) · governs PLATFORM-VISION §4 · extends SCALE-ARCHITECTURE §3,
ENGAGEMENT-ARCHITECTURE §4
**Context:** The vision adds whole verticals (marketplace, sessions/programs, affiliate,
donations). Hardwiring each into core would fork the truth and trap logic.
**Decision:** Each vertical is a **self-contained, vertical-slice module** that **declares**
to a registry: its **namespaced data** (`market_*`/`session_*`/`program_*`/`affiliate_*`/
`donation_*`), its **`SECURITY DEFINER` RPCs** returning **contract view-models +
capabilities** (the `/discover` pattern, ADR-018, **both web and app call the identical
RPC**), its **capabilities** (fed to the ADR-017 resolver), its **nav/composition** gates,
its **engagement hooks** (emit `engagement_events`), and its **entity domain**
(`foundation`/`labs`/`shared`). Core does not change when a module ships.
**Consequences:** "Add the trades marketplace" = ship a `market` module. Local trades are
**scoped to a locality** via the existing place-tree + PostGIS (ADR-006/020), no new geo
infra. Both clients stay in sync because they consume the same module RPCs.

## ADR-034: Growth happens on the persona axis; the role ladder stays 6 tiers

**Status:** Accepted (target) · governs PLATFORM-VISION §8 · preserves the GLOSSARY
worldview · reconciles ROADMAP "Deliberately NOT building"
**Context:** ROADMAP excludes "custom roles" with rationale *"the 6-tier ladder IS the
worldview,"* yet the owner wants "many different roles as we grow." These only conflict if
"role" is conflated across axes (ADR-030).
**Decision:** **"Many roles as we grow" is expressed on the persona axis (ADR-030), not by
inflating the `community_role` ladder.** The trust ladder remains exactly
`member < crew < host < guide < mentor < janitor`, it is the worldview. New tracks
(practitioner, business, affiliate, …) are **personas**, each contributing capabilities +
nav. Verticals previously on the "Deliberately NOT building" list (marketplace, affiliate,
branded mobile app) are brought **into scope but guardrailed** by ADR-024 (everything
high-value ladders up to verified practice).
**Consequences:** The role ladder never becomes a custom-role sprawl. The ROADMAP exclusion
list is annotated as **superseded-with-guardrail** by PLATFORM-VISION, not silently
contradicted.

## ADR-035: Subscription-as-bridge: for-profit subscription grants a shared-graph entitlement

**Status:** Accepted (target) · governs PLATFORM-VISION §3
**Context:** A Lab membership is a *for-profit subscription* (money) that grants *community
benefits* (space access where practice happens → earns shared points). The money and the
community benefit live in different domains and must not be modeled as one object.
**Decision:** Model the chain explicitly: **for-profit subscription state → grants a
shared-graph `entitlement` → which the engagement engine reads.** The subscription +
billing live in the money domain (`entity = labs`); the **entitlement** and the engagement
it unlocks live in the **shared, entity-blind graph**. The engagement engine never reads
Stripe; it reads the entitlement.
**Consequences:** Cancelling a subscription revokes the entitlement (one well-defined join)
without touching the engagement ledger's history. A future non-Lab paid tier reuses the
same entitlement mechanism. Keeps ADR-029's partition intact at the one place money and
community most want to bleed together.

## ADR-036: Content-agnostic moderation + first-class blocking + App-Store seams (supersedes ADR-015 "no blocking")

**Status:** Accepted (target) · governs PLATFORM-VISION §5, §7 · **supersedes** the
ADR-015 "no blocking in v1" stance
**Context:** Marketplace + paid sessions mean **strangers transacting**, and the **primary
client is a native app** (TECH-STRATEGY). Both raise the trust & safety floor; Apple/Google
gate UGC apps on specific controls.
**Decision:** (1) **One content-type-agnostic moderation pipeline**: generalize
`reports.target_type` to cover new content (listing/session/program/profile), never a
second moderation system. (2) **Blocking is first-class now**: a `blocked` relationship
(ADR-015 deferred it; **this supersedes that** because a marketplace needs it and Apple
requires per-user block + per-content report). (3) **Account deletion in-app** (Apple
requirement), a real self-serve delete beyond `is_active` soft-deactivation. (4) **Every
sellable item carries a `fulfillment` flag (`digital` | `physical`)**: Apple/Google take
~30% on in-app *digital* goods but not real-world goods/services; this **determines whether
an item can be sold in-app at all** vs web-only. (5) Ratings/reviews/disputes for paid
verticals (a disputed payout is a real ledger state, ADR-032).
**Consequences:** ADR-015's "rooms not gated / no blocking" note is updated, blocking
ships. Store-review landmines are designed in, not retrofitted under rejection pressure.
The digital/physical flag is a product-data field from the first marketplace migration.

## ADR-037: Free full app + an accruing Vault + membership-to-cash-in (the freemium model)

**Status:** Accepted (target) · governs [PLATFORM-VISION.md](PLATFORM-VISION.md) §3 · refines
ADR-031 (tiers) + ADR-035 (entitlement bridge)
**Context:** The Foundation's mission is free, real community for everyone (fight loneliness,
heal society), funded by public donations. The game (zaps/gems/ranks/leaderboard/store) is a
fun bonus on top. We want maximum inclusivity AND intrinsic monetization, with no community
paywall and no aggressive upgrade marketing. Calling a feature-unlock a "donation" is quid
pro quo (not legal); a crippled free tier betrays the mission.
**Decision:**
- **The full app is free for everyone.** Community, practices, programs, and an honest
  personal tracker (real streak/stats) are never gated. The mission layer carries no lock.
- **The game accrues for everyone, locked until claimed.** Rewards land for all users in a
  **persistent, non-resetting Vault**; everyone is "playing," they just cannot **cash in**
  (claim / spend / compete) without an **active game entitlement**.
- **Game access is an entitlement** (generalizes ADR-035), grantable from four sources:
  (a) the member's own Foundation membership, (b) a **host comp-grant** to a circle member
  who cannot pay, (c) a Lab-membership rollup (ADR-035), (d) a staff grant. The resolver
  reads "active game entitlement?" regardless of origin.
- **The pay path is a Foundation membership, not a price and not a pure donation:** a low
  floor (~$4.99/mo) unlocks the game as a member benefit, plus pay-what-you-want supporter
  tiers above the floor where the **excess is a genuine deductible gift**. The tier object
  carries `entity` + `revenue_type` (`dues` for the base, `donation` for the excess) per
  ADR-031.
- **Cash-in** converts the Vault to gems (spendable) + a lifetime rank; live **seasonal
  competition starts fresh** (fairness, so a long-time free member's haul is loot and
  status, not an unfair leaderboard lead). **Milestone freebies** (reusing the
  achievements/quests engine) are planted into the Vault as extra teases.
**Consequences:**
- The reward path always **records** a grant; for users without an active entitlement the
  grant is **vaulted (pending)** instead of credited live. Cash-in claims all pending
  grants. Generalizes `gem_transactions` / the ADR-019 ledger (grant gets a claimed/pending
  state).
- The capability resolver gains a tier/entitlement input: **free** = `practice.log`,
  `progress.viewOwn`, `vault.watch`; **entitled** = `vault.claim`, `rewards.spend`,
  `leaderboard.compete`, `store.access`, `events.register`.
- **Conversion is intrinsic:** the visible growing Vault + ghost leaderboard position +
  planted freebies do the selling. **Guardrails (anti-dark-pattern):** community and stats
  are never gated; gifts are not hostages; no fake urgency.
- **Open legal items (counsel, before money):** dues-vs-donation language + the
  deductibility math (deductible only above benefit value); UBIT on game revenue; which
  entity collects (ADR-031).

## ADR-038: Inter-entity bridge: a Foundation contribution can grant Frequency Lab access

**Status:** Accepted (target) · governs PLATFORM-VISION §1/§3 · extends ADR-029 (inter-entity
transfers) + ADR-035 (entitlement)
**Context:** The Foundation seeds community, which creates built-in demand for the for-profit
**Frequency Labs** (physical third spaces). The bridge: a person who contributes to the
Foundation an amount equal to a Lab membership gains Lab ("members-only club") access, and
Labs "donates" that subscription value to the Foundation. This is a 501c3 <-> for-profit
arrangement.
**Decision:** Model it as **a qualifying Foundation contribution grants a Lab-access
entitlement** (the same entitlement machinery as ADR-035/037); the value moving between
entities is recorded as a **first-class, audited inter-entity ledger entry** (ADR-029),
entity-tagged and never commingled. The product/architecture treats it as
"contribution to entitlement"; the **legal mechanism is an open decision** (in-kind
donation from Labs to the Foundation, or a sponsorship/services agreement, plus the
quid-pro-quo and private-benefit treatment).
**Consequences:**
- Lab access becomes an entitlement grantable from a Foundation contribution, not only from
  a Labs subscription. The resolver reads the entitlement regardless of which entity
  originated it.
- Every inter-entity transfer (Labs donating the subscription value to the Foundation, or
  the Foundation paying Labs for access) is an audited, entity-tagged ledger entry, never
  commingled (ADR-029).
- **Open legal items (counsel, non-negotiable before money):** quid-pro-quo treatment (the
  donor receives Lab access, which reduces the deductible portion); related-party /
  private-inurement risk (especially if the Foundation and Labs share owners); UBIT; the
  exact inter-entity agreement. Analogous structures exist (churches, university/for-profit
  arms), but this requires real structuring, not improvisation.

---

## ADR-039: In-app heading face stays Nunito (warm serif trialed and reverted)

**Status:** Accepted · governs DESIGN.md (type)
**Context:** Pages felt "template-like." A warm editorial serif (Fraunces) was trialed for
in-app page titles via a `.font-editorial` utility, paired with Nunito body, to add
magazine-like warmth.
**Decision:** **Revert the serif; Nunito bold remains the single in-app heading face.** In
context the serif read as a different product rather than a warmer version of this one, and
Nunito is already the brand-aligned rounded face (it matches the logo letterforms). Anton
stays scoped to public marketing headlines only. Warmth is carried instead by spacing,
shadow, color, and header composition, not a second text face.
**Consequences:**
- `Fraunces` import and the `.font-editorial` utility removed; templates use `text-2xl
  font-bold`. One fewer web font to load.
- Editorial warmth is a layout/token concern: even contained spacing (center+right column
  capped and centered), hairline header rules across templates, and a fuller, greeting-led
  feed header.

---

## ADR-040: Season rank is derived from zaps, not a stored column

**Status:** Accepted · fixes a tally bug · relates to ADR-013/ADR-024 (currencies)
**Context:** `profiles.current_season_rank` was set at signup and on the admin "complete
challenges" path, but `awardZaps()` only incremented `current_season_zaps` / `lifetime_zaps`
and never recomputed the rank. Result: a member with 400 zaps still displayed as **Ghost**
(0 to 99) with a broken "0 zaps to Runner" progress bar.
**Decision:** `lib/season-ranks.ts` gains `rankForZaps(zaps)` (highest tier whose `minZaps`
threshold is met). It is the **source of truth for display** (crew dashboard + the rail stats
dock derive the rank from `current_season_zaps`, ignoring the stored column), and `awardZaps()`
now writes `current_season_rank = rankForZaps(newTotal)` on every award so the column self-heals
and stays in lockstep going forward.
**Consequences:** Existing stale rows display correctly immediately (derived) and the stored
value corrects itself on the next zap award. Season rollover (`reset_season`) is unchanged.
A future backfill could set every row in one pass, but is not required.

---

## ADR-041: AI fabric and AI webmaster, on one copilot-first, least-privilege kernel

**Status:** Accepted (target) - describes not-yet-built work; extends ADR-027/028
(Studio agent governance). Detail in [`AI-STRATEGY.md`](AI-STRATEGY.md).
**Context:** We want Claude embedded across the product (support, encouragement,
host/guide/mentor copilots, calendar, program management) and as an internal
"webmaster" that runs periodic security/perf/correctness/docs sweeps and proposes
updates. Two risks dominate: cost of credits running away, and an autonomous agent
with repo/infra write becoming a new attack surface.
**Decision:**
- **One governance kernel for every AI surface.** Reuse the ADR-028 pattern
  (bounded typed tools, copilot-first via the Action Queue, per-action-type
  autonomy tiers that graduate as the audit log earns trust, hard frequency/spend
  caps, dry-run, kill switch, full audit log). Do not invent a second philosophy
  per surface.
- **Cost control is structural:** model tiering (Haiku default, escalate to
  Sonnet/Opus only when a cheap classifier says so), prompt caching of the system
  prompt + knowledge base + tool schemas, the Batch API for all non-realtime work,
  RAG over pgvector instead of stuffing context, and a usage ledger (modeled on the
  zaps ledger) with per-feature budgets. The richest AI is gated behind membership
  (ADR-037), making it a conversion driver rather than pure COGS.
- **The webmaster is two layers:** deterministic CI guardrails (tsc/eslint gating,
  Dependabot, CodeQL, secret scanning, Supabase advisors, an RLS/authz test suite)
  do the cheap certain work; agentic sweeps (scheduled, budgeted) do the reasoning
  and open PRs. It runs least-privilege: a scoped GitHub App that can open PRs but
  never merge to `main`, no production/secret/PII access, human review required on
  auth/RLS/migrations/`lib/ai/*`.
- **Autonomy is gated on a test/consent harness** (ADR-028's rule). Until the
  vitest verification + `shouldSend` harness exists, all agents run propose-only.
**Consequences:** A shared `lib/ai/` core (router, cache, RAG, tool registry,
usage ledger, caps, kill switch) is the first build and every later surface reuses
it. The webmaster's Layer 1 is the same CI gate the wider codebase needs anyway.
The critical path is shared with the product roadmap: CI gates + harness -> RLS
convergence -> live agent + webmaster + member surfaces graduate together. Member
data sent to Anthropic is data-minimized; crisis/safety routes to humans; AI is
labeled. See [`BACKLOG.md`](BACKLOG.md) sections D, E, I for the tracked work.

---

## ADR-042: RLS convergence proceeds own-row-first; aggregates wait for SECURITY DEFINER RPCs + a policy-test harness

**Status:** Accepted (in progress) · executes BACKLOG section A "RLS convergence" ·
refines the admin-client authorization model in [`ARCHITECTURE.md`](ARCHITECTURE.md).
**Context:** ~115 files read/write through `createAdminClient()`, which bypasses RLS,
so authorization lives in application code. The convergence goal is to move reads back
onto the session client where RLS can enforce them. But not every admin read is equal:
some are own-row reads the existing policies already cover, while others are cross-user
aggregates (capacity counts, the feed's scope fan-out, the capability resolver) that
the session client *cannot* reproduce without leaking or under-counting, because the
`memberships` SELECT policy only exposes rows in circles the caller already belongs to.
Migrating those blindly would silently break correctness or open a hole. The repo also
has no RLS/policy test harness yet (BACKLOG section D), so we cannot yet prove a new or
relied-upon policy behaves before shipping it.
**Decision:** Converge in tiers, safest first.
- **Tier 1 — own-row / public reads (migrate now, no new policy):** reads keyed by the
  caller's own identity (`auth_user_id = auth.uid()`) or against public-read tables
  (`circles`/`hubs`/`nexuses`/`outposts`). These are provably covered by existing
  policies. Done this pass: `lib/auth.ts` `resolveCaller()` (the anchor — every
  `getMyProfileId`/`getCallerProfile`/`requireProfileId` call across the app now reads
  identity via RLS), `lib/viewer-stats.ts`, and `components/layout/site-header.tsx`
  (both own-profile reads on every authenticated page render).
- **Tier 2 — cross-user aggregates (blocked on RPCs + tests):** capacity counts
  (`circles/actions.ts`), the feed scope fan-out (`feed-list.tsx`), and the capability
  resolver (`lib/core/load-capabilities.ts`) get dedicated `SECURITY DEFINER` RPCs with
  pinned `search_path`, each landing *with* a policy test once the harness exists. Until
  then they stay on the admin client with their existing in-code authz.
- **Tier 3 — legitimately service-role (no change):** cron jobs, webhooks, and the
  admin dashboard (authorization there is "is an admin", which RLS cannot express).
**Consequences:** The hottest path — caller identity on every authenticated request —
now respects RLS with zero new policy surface, establishing the pattern without waiting
on the harness. The remaining bulk is explicitly sequenced behind section D, matching
the documented critical path (CI gates + harness -> RLS convergence). No migration runs
without a way to prove the policy it relies on.

---

## ADR-043: Email-pipeline durability — explicit webhook error path + logged dead-letters, no new schema

**Status:** Accepted · hardens ADR-022 (durable async job queue) + ADR-026
(communications spine) · BACKLOG section A "email integrity".
**Context:** Two silent-failure holes remained in the email path. (1) The Resend
webhook (`app/api/webhooks/resend/route.ts`) had no error path: an exception from
`recordEmailEvent`/`suppress` became an unlogged 500, and an event with no
recipient was silently skipped — so the auto-suppress integrity signal could be
lost with no trace. (2) The outbox already retried with exponential backoff and
parked exhausted jobs at `status='failed'`, but that terminal state was never
logged or surfaced, and a malformed job was marked `done` (silently dropped). When
Resend is down, an email exhausts its 5 attempts and dead-letters invisibly.
**Decision:** Harden in place, **without a schema change** — the repo has two
migrations committed but not yet `db push`ed, so making running code depend on a
new column risks breaking prod if migration application lags the deploy.
- **Webhook return-code contract:** invalid signature → 401; bad JSON → 400;
  unmappable event (no recipient) → **200 ack** + warn log (retrying can't fix it);
  transient processing failure → **503** + error log so Resend redelivers.
  Suppression (delivery-critical, idempotent) runs first and independently of the
  analytics log, so one failing never skips the other.
- **Dead-letter = the existing terminal `failed` status** (`DEAD_LETTER_STATUS`),
  now logged loudly on entry, surfaced by the cron drain when `failed > 0`, and
  recoverable via `requeueDeadLettered()` / observable via `countDeadLettered()`.
  A failed claim query now throws instead of masquerading as an empty queue.
- **Handlers throw on malformed payloads** instead of no-op'ing to `done`, so bad
  jobs dead-letter visibly for inspection.
**Consequences:** No email-integrity signal fails silently any more; operators can
see and replay dead-letters (e.g. after a provider outage) from Vercel logs +
helpers. A dedicated DLQ table, webhook-replay idempotency (BACKLOG line 20), and
`FOR UPDATE SKIP LOCKED` claiming (BACKLOG section I) remain future work, layered
on once their migrations ship — this change is deliberately schema-free and
deploy-safe.

---

## ADR-044: Tests cover the pure core + security primitives, not DB-touching glue

**Status:** Accepted · corroborated by `vitest.config.ts` and the five `*.test.ts` files ·
relates to ADR-028 (autonomy is gated on a test harness)
**Context:** The repo runs against Supabase, where most modules call `createAdminClient()` /
RPCs and the real guarantees live in **RLS policies and SQL functions** — neither of which a
Node unit test exercises faithfully. Mocking Supabase end-to-end mostly re-asserts the mock,
not the behavior, and is high-maintenance. But ADR-028 makes a verification harness
**non-negotiable** before any AI agent earns autonomy, and some logic is genuinely
pure/security-critical and cheap to test for real. We needed a stance on *what* `vitest`
owns so coverage tracks risk instead of chasing a line-count target.
**Decision:** `vitest` (config: `environment: 'node'`, `include: ['**/*.test.ts']`, `@/`
alias mirroring tsconfig) targets two things only:
- **Pure, framework-independent core** — deterministic logic with no I/O. Today:
  `lib/engagement/currency.ts` (source → currency) and `lib/core/capabilities.ts` (the
  capability resolver / authz). These are the highest-leverage, lowest-cost tests.
- **Security-critical primitives** where a bug is silent and dangerous —
  `lib/webhook-verify.ts` (signature verification), `lib/suppression.ts` (the `shouldSend`
  consent gate ADR-028 names), and `lib/queue/outbox.ts` (idempotent/retrying job drain).

DB-touching code (`events.ts`, `verify.ts`, `capture.ts`, route handlers) is **not**
unit-tested in-process. Its correctness is owned by the type system + the RLS/RPC layer, and
the planned **RLS/authz test suite** (ADR-041 Layer 1, run against a real Postgres) is the
right tool for it — not Node mocks.
**Consequences:** Keep the pure core genuinely pure so it stays testable (it's a design
constraint, not just a convenience). New security primitives ship **with** a `*.test.ts`;
new DB glue does not grow the mock surface — it waits for the RLS suite. The `shouldSend` +
`vitest` harness that ADR-028 gates agent autonomy on is **partially in place** (suppression
+ pure core); the remaining gate is the RLS/authz suite. Reach for a mock only when logic is
both impure and security-critical enough that waiting for the RLS suite is too slow.

---

## ADR-045: Janitor "view as any role" is an effective-role downgrade gated on the real role

**Status:** Accepted · corroborated by `lib/view-as.ts`, `lib/auth.ts` (`resolveCaller`),
`app/(main)/view-as-actions.ts`, `components/layout/view-as-control.tsx`.
**Context:** Janitors need to preview the app as a lower role (member/crew/host/…) to QA the
experience without a second account. The role read-path is split: the `(main)` layout reads
`community_role` directly (nav gating) while the capability resolver reads it via
`lib/auth.ts`. A preview must be consistent across both, and must not become a privilege-
escalation vector.
**Decision:** A single shared helper (`lib/view-as.ts`) resolves an **effective role** from
an httpOnly `freq-view-as` cookie, applied in *both* read-paths (the layout and
`resolveCaller`). The override is honoured **only when the caller's real role is `janitor`**;
since janitor is the top of the ladder, every "view as" is a *downgrade* and can never
escalate — even a forged cookie on a non-janitor account is ignored. The effective role
flows everywhere (nav, capability resolver, and therefore server-side enforcement), so the
preview is faithful: a janitor "viewing as member" also loses janitor mutation rights until
they exit. The cookie is set only via a server action that re-checks the real role
(defence in depth) and auto-expires after 8h so no one is silently stuck impersonating.
`resolveCaller` returns both the effective `community_role` and the true `realRole`; the
latter gates the janitor-only control (in the sidebar profile box, opening upward).
**Consequences:** No new schema, no new policy — purely an application-layer effective-role
shim, so it composes with the RLS convergence (ADR-042) rather than fighting it. Known
limitation: any code that still reads `community_role` *directly from the DB* for
authorization (outside the capability resolver) won't be downgraded in preview — those
surfaces stay at the real role until they migrate to the resolver. Staff/Studio access is a
separate axis (the `staff` table) and is intentionally unaffected by view-as.

---

## ADR-046: Domain migration to frequencylocal.com — served on the apex; Workspace mail authenticated; transactional mail still needs Resend domain verification

**Status:** Accepted / shipped (2026-06-01).

**Decision:** Rebrand the production domain from `findafreq.com` (live on the
`go.findafreq.com` subdomain) to **`frequencylocal.com`**, served on the **bare apex**
(no `go.`/`app.` subdomain). The old `go.findafreq.com` host is retained as a permanent
(308) redirect to the apex to preserve inbound links and SEO.

**As-built:**
- **DNS (GoDaddy → Vercel):** apex `A @ → 216.198.79.1`; `www` `CNAME → *.vercel-dns-017.com`;
  `www` and `go.findafreq.com` both 308-redirect to the apex. GoDaddy domain forwarding had
  to be removed first (it locks the `@` A record).
- **App config (Vercel):** `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_APP_URL` set to
  `https://frequencylocal.com`; the `lib/site.ts` fallback and hardcoded server fallbacks
  (admin auth `redirectTo`, invite link, privacy page, JSON-LD/contact email) updated.
- **Auth:** Supabase **Site URL** + redirect allowlist set to the apex; Google OAuth client
  JS origin + consent-screen branding pointed at the apex (the Google→**Supabase** callback
  URI is unchanged — it's why sign-in kept working). Google sign-in now sends
  `prompt=select_account` so the account chooser always appears (app-layer only).
- **Email (Workspace mailboxes):** primary Workspace domain switched to `frequencylocal.com`;
  admin renamed `hello@findafreq.com → hello@frequencylocal.com` (old address kept as an
  alias). MX → Google; SPF authorizes `_spf.google.com` (GoDaddy managed-SPF chain); DKIM
  `google._domainkey` (2048-bit) enabled; DMARC moved to `p=quarantine` with
  `rua=mailto:hello@frequencylocal.com`.
- **Search:** `frequencylocal.com` verified as a Search Console domain property; `sitemap.xml`
  submitted.

**Consequences / open follow-up (important):** the Workspace SPF/DKIM/DMARC above authenticate
**human mail sent through Google only**. The product's **transactional/bulk mail sends via
Resend** (`lib/email.ts`), which is a *separate* sending path. Now that DMARC is enforcing
(`p=quarantine`), Resend mail from `@frequencylocal.com` will be quarantined unless the domain
is **verified in Resend** (its own DKIM, ideally on a dedicated `send.` subdomain so bulk
reputation is isolated from the human-mail apex). This is now a **blocking deliverability
prerequisite** before sending volume — see BACKLOG §I. The app-side bulk-sender hygiene
(RFC 8058 one-click `List-Unsubscribe`, hard-bounce/complaint suppression, durable outbox
with retries) is already in place (ADR-026/043).

---

## ADR-047: Onboarding becomes progressive and non-blocking; lazy profile capture; AI concierge is a later phase on the AI core

**Status:** Accepted (design) · 2026-06-01. Build spec: [ONBOARDING.md](ONBOARDING.md).

**Context:** Onboarding today is effectively a blocking wizard — profiles auto-create via a
trigger, new users are funnelled through `app/onboarding/*` to set identity, and surfaces
`redirect('/onboarding')` when no profile row exists. We want newcomers to explore the
product immediately and receive guidance progressively, eventually via an AI layer that
learns about them in conversation.

**Decision:**
1. **Non-blocking, lazy capture.** Land users in the app on their auto-created profile,
   requiring nothing up front (backfill a safe default handle/display name when empty).
   Collect identity/interests/region at contextual moments instead of a gate.
2. **Progressive, interaction-paced tour.** A declarative tip registry surfaces one
   contextual coachmark at a time, triggered by reaching a surface and gated by a
   cooldown / interaction count so tips never stack. Per-user state lives in the existing
   `profiles.meta` JSONB (`meta.tour`) — **no schema migration**.
3. **Phase the build.** Phase 0 decouples the gate; **Phase 1 ships the deterministic tour**
   (no AI cost/risk, immediately useful); **Phase 2 adds an AI concierge** as a separate
   initiative built on the planned AI core (`lib/ai/` — model router, caps, kill switch,
   governance kernel; ADR-028/041), with tool-use to personalize. The tip registry is the
   AI layer's always-on fallback.

**Consequences:** No new schema for Phase 1. The activation funnel becomes measurable via
`engagement_events` emitted by the tour (feeds the planned analytics dashboard). The "welcome
new members in the feed" idea folds in as a one-shot tour moment. Phase 2 is gated on the AI
core and the consent/verification harness (ADR-028) before any autonomous writes — so it does
not block Phase 1. The current `/onboarding` wizard is demoted to an optional "finish your
profile" surface rather than a hard gate.

---

## ADR-048: Add GA4 for acquisition analytics (privacy-configured), alongside a first-party product dashboard

**Status:** Accepted · 2026-06-01.

**Context:** We had no analytics and a privacy policy stating we use no third-party tracking
cookies. We want two complementary views: **acquisition** (how visitors find us — traffic,
sources, devices) and **product/community health** (what members do once in). Acquisition
data is hard to derive from our own DB; product data is hard to get from a third party.

**Decision:** Run **both**. (1) **GA4** via a gtag.js tag (`components/analytics/google-analytics.tsx`,
mounted in the root layout) for acquisition. It is **inert unless `NEXT_PUBLIC_GA_MEASUREMENT_ID`
is set AND `NODE_ENV==='production'`**, so it never fires in dev/preview and is safe to ship
before the property exists. GA4 "Enhanced measurement" covers SPA route changes, so no manual
pageview wiring. We configure it privacy-forward: `anonymize_ip`, and Google Signals /
ad-personalization **off**. (2) A **first-party dashboard** (planned, separate) built on our own
Supabase `engagement_events` for product/community metrics — no cookies, no consent surface.

**Consequences:** The privacy policy is updated to disclose Google Analytics (reversing the
"no third-party tracking" line) with the anonymization/no-ads configuration spelled out.
Because GA4 still sets cookies, **EU/UK traffic would require a consent banner / GA Consent
Mode** — deferred (audience is US/local beta today); flagged as a follow-up if traffic
internationalizes. Raw-`<script>` injection (matching the existing theme-script pattern) is
used instead of a Next-version-specific helper, since the bundled Next 16 docs referenced in
AGENTS.md aren't present in `node_modules`.

---

## ADR-049: Vera — a persistent, memory-backed AI guide persona; personas as a pluggable registry

**Status:** Accepted (design) · 2026-06-01. Spec: [AI-VERA.md](AI-VERA.md).

**Context:** The onboarding concierge (ADR-047 Phase 2) needs a voice and a model for how the AI
relates to members over time. We want a consistent character that debuts in onboarding and recurs
across the planned AI member surfaces, that *remembers* the member, and that we can extend to
other archetypes later.

**Decision:** Define **Vera** — a warm, dry, no-slack matriarch who keeps the place running. She
**spars (verbal aikido)** with people who test her rather than shutting them down; she only drops
the humor when someone is cruel to *another* member, which routes to existing moderation (she is
**not** the moderator). She is the **persistent voice of the place** (onboarding, contextual help,
encouragement, gentle accountability, guardian), and a **bridge to humans, not a replacement**.
She has **memory** — extracted facts + a rolling conversation *summary* (not raw transcripts),
sourced from the same `engagement_events` backbone as the analytics dashboard, stored per-member,
member-viewable and erasable. Personas are **data, not hardcoded** (`id, name, voice, tools,
surfaces, model`) so future archetypes are config; Vera is persona #1.

**Consequences:** Vera ships only on top of the AI core (`lib/ai/` — model router, prompt cache,
caps, kill switch, governance; ADR-028/041), via the Claude API with tool-use + prompt caching +
memory. **No autonomous writes until gated by the consent/verification harness (ADR-028);** budget
caps + kill switch are mandatory, and the deterministic onboarding tour (ADR-047) is her always-on
fallback so the product never depends on her being up. Open: autonomy level (propose-and-confirm
vs act-and-undo), memory store shape, and the first non-onboarding surface.

---

## ADR-050: First-party event tracking is the source of truth for the admin dashboard; GA4 owns acquisition

**Status:** Accepted (design) · 2026-06-01. Spec: [ANALYTICS.md](ANALYTICS.md). Builds on ADR-048.

**Context:** We want accurate, real-time product/community analytics on an **in-app admin
dashboard**, and GA4 (ADR-048) "fully embedded." GA4 is sampled, delayed, and acquisition-shaped —
unsuitable as the dashboard's data source.

**Decision:** Split analytics by job. (1) **First-party = source of truth** for the admin
dashboard: a canonical **event taxonomy** recorded to the existing `engagement_events` backbone,
read via aggregates/RPCs. (2) A single **dual-emit `track(event, props)` helper** is the only
sanctioned way to record an event — it writes `engagement_events` *and* fires the matching **GA4
custom event**, so coverage can't drift and GA's funnels reflect real behavior (not just
pageviews). (3) **GA4 owns acquisition**, surfaced in the dashboard via the **GA Data API** widget
(service account — same access the Google Analytics MCP uses) or linked out.

**Consequences:** The admin dashboard never reads from GA (accuracy + realtime). The same event
stream feeds **Vera's memory** (ADR-049) — one source, two consumers. First-party telemetry adds
no new cookies/consent; GA4 stays per ADR-048 (anonymized, ad signals off; EU consent deferred).
Open: GA Data API embed vs link-out, v1 metric priorities, and the client/server split per event.

---

## ADR-051: `admin` community role + DB-driven nav permissions

**Status:** Accepted · 2026-06-02. Migrations: `20240306000000_admin_role.sql`,
`20240306000100_area_permissions.sql`.

**Context:** The role ladder topped out at `janitor`, and Studio access lived on a separate
`team_members` staff axis (ADR-027). We wanted a near-top role for trusted operators, a single
place to manage who can reach each app area, and a clearer "marketing workspace" boundary.

**Decision:**
1. **New `admin` role** on the community ladder, between `mentor` and `janitor`
   (`member < crew < host < guide < mentor < admin < janitor`). Admin carries nearly the full
   janitor key-ring (Studio, structural admin tabs, marketing Pages, see-all scopes) but **not**
   the most sensitive keys — **member management, role assignment, and the permission grid stay
   janitor-only**. `lib/core/roles.ts` is the ordering source of truth; the Postgres enum order is
   cosmetic.
2. **Persisted nav permissions.** `lib/nav-areas.ts` is the single source of truth for nav areas
   and each area's *default* access level. A new `area_permissions` table stores per-area
   **overrides**; the authed layout reads them (`lib/permissions.ts`) and the app shell merges
   `override ?? default`. The whole menu always renders — unreachable items are muted, not hidden.
   A janitor edits the map from `/admin/roles` via a radio grid (`setAreaPermission`, janitor-gated).
3. **Marketing workspace** (renamed from "Studio", `/marketing/*`) = community `admin`/`janitor`
   **OR** a Studio staff member (the `team_members` axis kept for backward-compat). It now lives
   **inside the normal app frame** (full left nav + top bar) with a horizontal tab bar for its tools
   — the same pattern as Admin — instead of its own `hideAppNav` shell. The global right rail is
   suppressed on `/marketing` to give the workspace room.
4. **Micro-CRM** (`/crm`, host+): steward-scoped member cards (host→circles, guide→hub,
   mentor→nexus, admin/janitor→community) showing only public profile data + a Message action.
   Birthday / astrology / Human Design / wellbeing are surfaced as **opt-in channels (coming soon)**
   — no schema for them yet, so nothing sensitive is exposed.

**Consequences:** Adding a ladder role touches every exhaustive `Record<CommunityRole,…>` and the
many local `CommunityRole` re-declarations + host+ allow-lists; all were widened to include `admin`.
`area_permissions.min_role` is `text` (not the enum) because `visitor` is a valid access level but
not a community role. The generated `database.types.ts` enum was hand-edited to add `admin` pending
a real `supabase gen types`. Open: persisting per-area overrides for *extra* (Studio) sections,
editable role emojis/badges, and real opt-in CRM data channels.

---
### ADR-052 — Bold-warm contrast layer for the public site (ink + slat + light-strip)

**Status:** Accepted · **Date:** 2026-06

**Context:** DAWN reads beautifully in-app but too *soft* on the public/marketing pages —
light sections (`surface`/`marketing-canvas`/`surface-elevated`) sit within a few % of each
other, borders barely register, shadows are intentionally faint, and the "dark band" used the
warm-near-black `--color-text` (#1E1A13), which reads muddy rather than deliberate. Stakeholder
direction (with reference photography of Frequency's spaces — black wood-slat walls, warm LED
strips, teal water, lush greenery) was: **more contrast on the splash, "bold but warm," as a
full-site token system**, without disturbing the in-app feel that already works.

**Decision:** Add a contrast layer to DAWN (`app/globals.css`), not a new system:
1. **Ink tokens** — `--color-ink` (deep *near-neutral* warm black, #141210 light / #0E0C09 dark)
   plus `-elevated`, `-border`, and `--color-on-ink` / `-muted` / `-subtle`. The load-bearing
   dark half of the dark↔light contrast; replaces ad-hoc `bg-text` dark bands.
2. **Deeper `--color-marketing-canvas`** (#F7F3EA → #F2EAD9) so alternating sand↔white bands
   actually register.
3. **`--shadow-pop` / `-pop-lg`** — a marketing-only elevation step above the soft in-app scale,
   for the hero CTA, pricing tiers, and the demo device frame. **In-app `--shadow-*` is unchanged.**
4. **Signature motifs** drawn from the brand spaces: `.bg-slat` (vertical wood-slat texture over
   ink), `.light-strip` (glowing amber LED-style seam at dark↔light transitions), `.amber-glow`
   (radial warm glow). Token-driven, decorative only (no a11y dependence).
5. The shared kit (`Section`/`Statement`/`ZigZag`) gained an `ink` tone, and the site-wide closing
   `BetaCTA` is now a dark slat band with a light-strip seam + amber glow, so every public page
   ends on the same dramatic beat.

**Consequences:** The in-app experience is untouched (only `marketing-canvas`, which the app
doesn't use as a primary surface, shifts). All a11y rules (focus ring, reduced-motion,
`text-on-*` pairings) are preserved. The Puck blocks (`components/marketing/blocks.tsx`) were
updated to match so the visual-editor home renders identically to the hardcoded splash. Open:
optionally extend the `ink` tone through `SectionHeading` and roll deeper into Pricing/Demo
section rhythm.

**Follow-up — sitewide palette harmonization (subtle):** to make the whole product feel of a
piece without bringing the splash's bold contrast into the community, the shared tokens were
gently tuned: **dark mode** warmed toward dark wood (canvas/surface/border undertones shifted
golden-brown — the reference spaces are amber-lit espresso slats), **light mode** got a barely-
perceptible warm nudge (`canvas`/`surface-elevated`), and the **teal** secondary tint was
enriched a touch (amber still leads). Token values only — no structure, no contrast change in
the in-app community (which the stakeholder explicitly wanted left soft).

---
### ADR-053 — Agency redesign program: experimental direction, page-editor unpublish, component consolidation

**Status:** Accepted · **Date:** 2026-06

**Context:** A "virtual design agency" pass to make the already-working site feel like one
deliberate, modern product instead of cobbled-together. Discovery produced two source-of-truth
docs (`docs/CREATIVE-PLATFORM.md`, `docs/DESIGN-LANGUAGE.md`). Stakeholder direction: **balance
all three personas** + an **experimental** visual direction. During rollout we found the public
marketing pages were silently rendering **stale visual-editor (`published_data`) versions** that
shadowed the new coded designs — and the editor had no way to revert.

**Decisions:**
1. **Flagship-first execution.** Prove the experimental, motion-forward, story-led language on
   the **splash** (`app/page.tsx` + `components/marketing/motion.tsx`), then roll it across the
   site. Motion is opacity/transform only (no CLS), disabled under `prefers-reduced-motion` and
   `(scripting: none)`; built with `useSyncExternalStore` + callback updates (no setState-in-effect).
2. **Page-editor `unpublishPage` + Unpublish button.** The editor could publish but not revert;
   `unpublishPage(slug)` clears `published_data` (keeps the draft) so the public route falls back
   to the coded design. Button shows only when a page is currently published. This is what made
   the coded redesigns of The Lab / How it works / About go live.
3. **Component consolidation (kills the "cobble").** `DiscoverHero` now re-exports the marketing
   kit's `PhotoHero`; the duplicate `SectionHeading` in `components/discover/cards.tsx` re-exports
   the kit's single `SectionHeading`; removed the `success`/green palette leak on Discover events
   (amber-led). Added shared `PhotoHero`, `PullQuote`, `Stat` to the kit.
4. **`/beta` redesigned** to the system (photo hero + reassurance/founder-trust + honest scarcity)
   since it's every CTA's destination.

**Consequences:** The flagship + unpublish shipped **straight to `main`** (no PR) at the
stakeholder's "ship it live" direction; the QA fixes (#2–#4 above + `/beta`) go through a PR for a
preview. Remaining work (experimental rollout to all pages; shared `Button`/`Card` primitives +
codified rhythm per the Design-Language P1 backlog) is tracked in `docs/REDESIGN-STATUS.md`.
Gotcha (RESOLVED by ADR-054): publishing the `home` page in the editor would shadow the coded
splash flagship the same way — `home` is now code-locked out of the editor.

---
### ADR-054 — The splash (`home`) is code-locked, not editor-editable

**Status:** Accepted · corroborated by `lib/page-editor/data.ts` (`EDITABLE_PAGES` has no `home`)
and `app/page.tsx` (renders the coded splash unconditionally).
**Context:** ADR-053 shipped a Puck page-editor where a page's `published_data` shadows the coded
design. `home` was in `EDITABLE_PAGES`, so publishing it would replace the bespoke, motion-forward
flagship splash (live counts, parallax, broken-grid, `CountUp`) — which the generic block set can't
reproduce — exactly the trap ADR-053 flagged. A `home` row was in fact already published in prod;
it only stayed hidden because the splash is visually dominant and few looked logged-out.
**Decision:** Remove `home` from `EDITABLE_PAGES` and render the coded splash unconditionally
(dropped the `getPublishedData('home')` branch). Every editor surface (the `/edit` route, the
`/pages` directory, publish/draft/unpublish) gates on `isEditableSlug`, so one change excludes the
splash everywhere — the guard is structural, not a flag. The orphaned published `home` row is
harmless (never read; `home` no longer appears in the directory).
**Consequences:** The splash can only change in code — correct, since it's the design surface under
active iteration and isn't expressible in Puck. The other three marketing pages stay editor-
editable. A Puck-built home would be a deliberate re-add.

### ADR-055 — Standardized, categorized Puck block library (not content-named one-offs)

**Status:** Accepted · corroborated by `lib/page-editor/config.tsx` + `components/page-editor/blocks/*`
**Context:** The first editor palette was a set of **content-named one-off** blocks — `Pillars`
("What we're building band"), `BetaCTA`, `LiveStats (members/circles/events)` — modeled on the
splash's specific content rather than reusable design sections, with a flat, uncategorized left bar
and inconsistent per-block controls. A real page-builder offers generic, design-system sections the
way Webflow/Framer/Squarespace do.
**Decision:** Rebuild the palette as a **standardized library** with one shared control vocabulary
and left-bar **categories**:
- **Foundation** (`lib/page-editor/fields.tsx` + `components/page-editor/blocks/kit.tsx`): shared
  field atoms (`toneField` incl. Dark/Transparent, `widthField`, `alignField`, `imgField`), style
  resolvers, a universal `<Band>` section wrapper, and typographic atoms (`Eyebrow`,
  `DisplayHeading`, `CtaButton`). Every block threads the SAME "adjust" controls — **background,
  content width, alignment, spacing (above/below), responsive visibility** — plus image controls
  (crop/focal/radius/shadow) where relevant. Built on the existing `layout.ts`/`image-controls.ts`.
- **Blocks** (one file per group): **Layout** (Container, Columns, Spacer, Divider) · **Content**
  (Heading, Text, Statement, Quote, Buttons) · **Sections** (Hero, FeatureGrid, Showcase, StatRow,
  Checklist, Accordion, CallToAction) · **Media** (Image, Gallery, MediaText, Marquee) · **Dynamic**
  (LiveStats, LiveEvents, LivePosts). Blocks carry **variants** (Hero: image/split/minimal; Quote:
  pull/testimonial; FeatureGrid: icon/image/number). The content-named `Pillars` → generic
  **Showcase**; `BetaCTA` → **CallToAction**.
- **Content re-map** (`lib/page-editor/templates/*`): the-lab / how-it-works / about rebuilt as Puck
  `Data` from the standard blocks. The `/edit` route seeds from these when a stored draft is empty
  **or predates the new blocks** (`isRenderable` check) — a load-time default only; nothing is
  written to the DB until Publish, so old drafts using retired keys can't crash the editor.
**Consequences:** The editor and the public `<Render>` share one standardized, on-brand kit; the
janitor composes pages from design sections, not bespoke widgets. Retired block keys (`PageHero`,
`ZigZag`, `ImageBand`, `FeatureGallery`, `Pillars`) are gone — safe because nothing public depended
on them (home is code-locked per ADR-054; the other pages were unpublished drafts). Satisfies the
Design-Language P2 "Puck config exposes the canonical components" guardrail.

### ADR-056 — RLS convergence pattern: DEFINER RPCs for restricted-join reads, UPDATE-own policies, migration-before-deploy

**Status:** Accepted · corroborated by `supabase/migrations/20240307000000_notifications_rls_convergence.sql`
+ `app/(main)/notifications/actions.ts` (first converged surface).
**Context:** Phase 2 / Stage A migrates high-traffic paths off the service-role **admin client**
(which bypasses RLS, so authz lived in hand-written `recipient_id = me` filters) onto the
**user-scoped client** so the database enforces access. The first surface (notifications) exposed
the recurring snag: an owner-scoped read often **joins a table whose own RLS is narrower** — the
notification row joins the actor's `profiles`, but the profiles read policy only lets crew+ read
other in-region profiles, so a plain user-client select would null the actor for sub-crew/
cross-region viewers (a silent visibility regression).
**Decision:** A repeatable convergence pattern:
1. **Owner-scoped reads that join a more-restricted table → a `SECURITY DEFINER` RPC** (e.g.
   `my_notifications`) that scopes to the caller (`auth.uid()` → profile), bypasses RLS for the
   join, and returns only the **public fields** of the joined row (id/display_name/handle/avatar).
   Plain RLS selects are fine only when no restricted join is involved.
2. **Self-service writes → an `UPDATE`/`INSERT`-own policy** (`recipient_id = my profile` in
   USING + WITH CHECK), then move the write to the user client and drop the manual owner filter.
3. **Cross-actor writes stay service-role** (e.g. other people creating *your* notifications) —
   they legitimately write rows you don't own; keep them on the admin client + the existing
   "service role full access" policy.
4. **RPCs are `authenticated`-only** (`revoke … from public, anon; grant execute … to authenticated`).
5. **Deploy ordering is load-bearing:** the converged code calls the new RPC/policy, so the
   **migration must be applied (`supabase db push`) + types regenerated BEFORE the code deploys**.
   Shipping code first degrades the surface (empty reads, no-op writes) until the migration lands.
   Each surface ships as: migration (in-repo) → owner applies → regen types → merge/deploy code.
**Consequences:** Authz moves into the database, surface by surface, without the big-bang risk of
converting everything at once. Pure mapping logic (row→view-model) is unit-tested; row-level
isolation is verified by SQL checks shipped in each migration's footer (run post-apply, or via a
Supabase dev branch). The deploy-ordering coupling is the main operational cost — it's why this
work is staged one surface per PR, not batched.

---
### ADR-057 — In-app nav split: community sub-menu (top) vs. features/admin sidebar, with a faded full-site browse nav

**Status:** Accepted · corroborated by `lib/nav-areas.ts` (`placement` field),
`components/layout/community-nav.tsx`, `components/layout/nav-icons.ts`, and the
`AppShell` header/body in `components/layout/app-shell.tsx`.
**Context:** The app shell had one flat left sidebar built from `NAV_AREAS` that mixed the
day-to-day community loop (Feed, Circles, Events, Messages…) with feature and admin areas
(Vault, CRM, Marketing, Pages…), while the header carried the full-site browse nav
(`PrimaryNav`, the same Discover/About menu the splash uses). The community interaction —
the thing we most want members doing — had no visual primacy, and the site-browse nav
competed for attention with it.
**Decision:** Split the in-app chrome into three intentional surfaces, all still derived from
the single `NAV_AREAS` source of truth (so `/admin/roles` permission grid stays in lockstep):
1. **`placement` on each `NavArea`** (`'community' | 'sidebar'`) decides where it renders.
   `'community'` = Feed · Circles · Interests · Events · Broadcast · Messages.
2. **A horizontal community sub-menu** (`CommunityNav`) — a tab strip with an active
   underline — is **inset between the two rails** (it lives at the top of the center scroll
   column, not full-bleed under the header) and **sticks** to the top of the shared scroll,
   so it reads as the content's own nav. It scrolls horizontally on narrow screens, so it
   doubles as the mobile community nav.
3. **The left sidebar is features + admin only** (Library, Network, Progress, Manage). The
   desktop rail renders `placement === 'sidebar'` areas; the **mobile drawer renders ALL
   areas** (community + sidebar) so the hamburger remains the complete menu.
4. **The header full-site browse nav fades to ~40% opacity in the shell** ("community mode")
   and returns to full on hover/`focus-within`, so members can still reach the wider site
   with ease without it stealing focus from community interaction. Its **"Discover" dropdown
   is hidden in the shell** (`showDiscover={false}`) since the community sub-menu already owns
   discovery — there it's purely full-site browsing.
5. **Section labels are display-only** (sidebar grouping + permission grid); re-slotting
   areas across sections (`Community`→`Library`/`Network`) is safe and carries no behavior.
   The shared lucide icon map moved to `components/layout/nav-icons.ts` so the bar and the
   rail can't drift.
**Consequences:** Community interaction has clear visual primacy; the sidebar reads as a
calm features/admin rail; full-site browsing stays one hover away. All gating still flows
through `meetsAccess` + `permissions` overrides — unreachable areas mute identically in both
the bar and the rail. Adding/moving a link is still a one-line edit in `lib/nav-areas.ts`
(set `placement`); giving it an icon is a one-line edit in `nav-icons.ts`.

## ADR-058: Foreign-key covering indexes from the maintenance advisor sweep

**Status:** Accepted · corroborated by `supabase/migrations/20260602195255_fk_indexes.sql`
(pending apply) and `docs/maintenance/2026-06-02.md`.
**Context:** The first automated `/maintenance` Supabase advisor sweep (2026-06-02) flagged 45
foreign keys with no covering index — they force sequential scans on joins and on cascade
deletes. This is the same class of finding `20240305000000_perf_indexes.sql` addressed for hot
read paths, now extended to FK columns surfaced by the advisor.
**Decision:** Add a single covering index per flagged FK in one additive migration
(`CREATE INDEX IF NOT EXISTS`, idempotent, no access/behaviour change). The riskier advisor
findings are **deliberately excluded** because they change behaviour and need per-item review:
the 10 `rls_enabled_no_policy` tables (verify intentionally backend-only), `auth_rls_initplan`
×41 (rewrite `auth.uid()` → `(select auth.uid())`), and RPC `EXECUTE` revokes on SECURITY
DEFINER functions. The `rls_disabled_in_public` ERROR on `spatial_ref_sys` is a PostGIS system
table — acknowledged, no action.
**Consequences:** Index-only, so safe to apply anytime (`supabase db push`); slightly more write
overhead and storage, the standard FK-index trade-off. Maintenance findings now have a durable
home (`docs/maintenance/<date>.md`) and the routine that produces them is `/maintenance`
(see `docs/WORKFLOW.md`).

## ADR-059: The practitioner portal (The Collective) is a marketplace over Hook-hosted programs — Hook is the source of truth

**Status:** Accepted (strategy locked, build not started) · companion docs
`docs/HOOK-INTEGRATION.md` + `hook/docs/FREQUENCY-INTEGRATION.md` · first test client
**danieltyack.com** (Daniel Tyack — Healer & Guide).
**Context:** We want a practitioner portal — a shop of community-generated programs with
free / premium / tips payout structures — and to bundle each practitioner their own private
cohort + branded website. That is the union of two things already on the boards:
Frequency's **"The Collective" (vertical 7)** + **practitioner personas** (📐 designed), and
Hook's **courses, multi-tenant communities, per-host branding/custom domains, and Stripe
Connect creator payouts** (✅ built). The risk is building a second course engine + a second
Connect integration + a second design language inside Frequency and watching them drift.
**Decision:** Three **separate** web entities integrated **only through typed contracts, never
merged code**. **Hook is the single source of truth** for programs/courses, communities,
websites, and creator payments. **Frequency owns** discovery, the shop UI, payout splits, and
the gamified + in-person social layer. **The Collective becomes a thin marketplace *over*
Hook-hosted programs** — it indexes a signed per-creator **catalog feed** from Hook and routes
fulfillment/checkout to Hook's existing Connect flow (the creator's connected account; v0 may
be pure discovery / link-out at 0 fee, later an application fee for the marketplace cut). The
practitioner's **website + private cohort = a Hook tenant** (danieltyack.com is the first).
The four seams: **catalog feed** (Hook→Frequency), **provisioning** (Frequency→Hook spins up a
Hook community/site), **identity link** (persona ↔ Hook coach), **payout/Connect** (Hook holds
Connect). The digital programs shop sits on the **Labs / for-profit** side of the two-entity
partition, never the Foundation side.
**Consequences:** No duplicate course/payments stack; Frequency stays on its strengths
(discovery, engagement ledger, place-based movement). New work is mostly the seam, not new
primitives — Phases 0–1 (the website + programs) are Hook-side; Frequency's first real work is
**Phase 2** (consume the catalog feed, render the shop + persona). Open: identity/SSO model
(shared Supabase auth vs. federation/OIDC), and whether v0 brokers checkout or is pure
discovery. No cross-repo imports; design systems (DAWN vs. Frequency's) stay separate — the
seam carries data, not components.

---

## ADR-060: Refocus the top sub-menu as the "Broadcast bar"; community spaces move to the sidebar

**Status:** ~~Accepted~~ **Superseded by ADR-063** (the horizontal bar is retired in favour of a
single rail) · refines ADR-057 · `lib/nav-areas.ts`, `components/layout/community-nav.tsx`,
`components/layout/app-shell.tsx`.
**Context:** ADR-057's top sub-menu carried the whole social loop (Feed · Circles · Interests ·
Events · Broadcast · Messages). In practice that mixed two different jobs — *browsing spaces*
(Circles, Interests) and *time-sensitive comms* (Dispatches, Messages, Events) — in one strip,
and Feed didn't read as the anchor it is.
**Decision:** Keep ADR-057's `placement`-driven, single-source-of-truth model, but re-cut the top
bar as the **Broadcast bar**: **Feed** (the anchor — always available, rendered a touch bolder and
split off by a hairline) followed by the comms loop **Dispatches** (the `/broadcast` area,
relabelled from "Broadcast") · **Messages** · **Events**. **Circles** and **Interests** move to a
new **Community** section at the top of the left sidebar (`placement: 'sidebar'`). The comms items
get `section: 'Broadcast'` so the mobile drawer groups them sensibly; the desktop bar still renders
flat. No access levels or permission-grid wiring change — only `placement`, `section`, one `label`,
and the bar's render order/styling.
**Consequences:** The bar now has one clear purpose (what's happening / who's reaching me), Feed is
unmistakably the home, and the sidebar regains the browsable spaces under a "Community" heading.
Adding/moving an area remains a one-line `nav-areas.ts` edit.

---

## ADR-062: Bottom docks reveal from one shared, intent-driven controller

**Status:** Accepted · `components/sidebar/dock-reveal.tsx`, `components/layout/app-shell.tsx`,
`components/sidebar/game-stats-dock.tsx`, `components/layout/view-as-control.tsx`.
**Context:** The two bottom docks (left profile card, right stats dock) "rise" as the feed
scroll reaches its end. The original build was glitchy: each dock ran its *own* scroll listener
(`useFeedAtBottom`), so they drifted out of sync; the reveal was *position*-based, so expanding a
dock grew the scroll height, pushed the viewer off the bottom, and collapsed it again — a
flicker loop; the right dock was `sticky bottom-0`, which fought both its own expansion and the
intended "scroll up into view" behaviour; and the "hover the dock and scroll to open" affordance
was never built.
**Decision:** One `DockRevealProvider` (context) runs a single listener on `[data-feed-scroll]`
and drives both docks together. Reveal is **intent-driven, not position-driven**: a continued
downward gesture near the end reveals; only a clear upward gesture (or scrolling well clear)
collapses. A layout shift from expanding keeps `scrollTop` steady (no delta) and fires no wheel
event, so it can't feed back — killing the oscillation. It reads `wheel` (works when pinned at
the very end) **and** `scroll` deltas (covers touch / keyboard / scrollbar / momentum).
Per-dock `useHoverScrollReveal(ref)` adds hover-then-scroll reveal; each dock also keeps a manual
chevron toggle. Left dock stays pinned (non-scrolling rail); right dock drops `sticky` so it
scrolls up into view as the rail's top content leaves. The janitor **View-as** control moves to
the top of the left dock's slide-up menu; its role list renders through a **portal** (fixed,
above the trigger) so the panel's `overflow-hidden` (the rise/collapse clip) can't cut it off.
**Consequences:** Both docks stay in sync; no flicker; works across all input methods and
`prefers-reduced-motion`. The right compact bar is no longer permanently pinned — it appears on
reaching the bottom, by design. Reveal is a smooth ~500ms animation triggered by scroll (not a
pixel-scrubbed height), chosen for robustness over a scrub that would re-introduce the feedback
loop on the in-flow right dock.

> **Numbering note:** ADR-059 is the practitioner portal (above). This dock-reveal decision was a
> parallel-work numbering collision (originally also 059) and is **renumbered to ADR-062** here.

---

## ADR-061: In-app design overhaul — finish and enforce the kit, foundation-first

**Status:** Accepted · **Phase 0–1 shipped, Phase 2–3 swept (PRs #81–93, 2026-06-02)** · plan of
record in [`REDESIGN-INAPP.md`](REDESIGN-INAPP.md) · refines DESIGN.md
+ PAGE-FRAMEWORK.md. (ADR-060 is the Broadcast-bar nav change, in an open PR.)
**Context:** A full design-team audit (8 reviewers: design-systems foundation + 7 page clusters)
of every `(main)` interior page found that the "warm editorial community" standard and the three
shells (Stream/Index/Detail) are **right but half-adopted** — `DetailTemplate` is used by zero
pages, `IndexTemplate` by 2 of ~10, there is no `RoleActions` or single entity-card, and
`text-[10/11px]` + identical bordered boxes + missing cross-links recur in nearly every cluster.
That adoption gap — not the language — is the "clunky / too busy" feeling.
**Decision:** Do **not** invent a new language. Build the missing kit once (codified type/spacing/
radius scale; `EntityCard`; `StatCard` with deltas; `RoleActions` off the capability resolver,
built with its first detail-page consumer; borderless section/rail group; the existing Detail/
Index/Stream templates), then roll adoption page-by-page in phases: **0 foundation → 1 core member
loop (shell adoption) → 2 dynamic dashboards (Crew + operator) → 3 admin**, with descriptions,
cross-links, empty states, and resolver-routed role logic woven through. Cohesion pass (preserve
flows); dashboards made genuinely dynamic. Each phase is its own reviewable PR; no big-bang. Lens:
the CREATIVE-PLATFORM persona + voice (missed/exhale/home; "design for the body, not the dashboard").
**Consequences:** After the foundation lands, page redesign is assembly, not authoring — drift
can't re-accrue because everything composes from one kit. A few product decisions are pulled out
for the owner (Hubs/Nexuses social vs structural; remove `/groups`; rename The Vault; make the
streak UI weekly). Built-but-dark features (NearYou proximity, engagement_score, achievement
celebration) get surfaced as pages are touched.

---

## ADR-063: Collapse the in-app nav to a single left rail (retire the Broadcast bar)

**Status:** Accepted · **supersedes ADR-060** · realizes the single-rail vision in
[`IA-STRATEGY.md`](IA-STRATEGY.md) §1 · `lib/nav-areas.ts`, `components/layout/app-shell.tsx`,
`app/(main)/feed/page.tsx`; deletes `components/layout/community-nav.tsx`.
**Context:** ADR-060 split navigation across two axes — a vertical rail *and* a horizontal
"Broadcast bar" (Feed · Dispatches · Messages · Events) pinned under the header. That L-shape ran
two primary navs at once: members had to scan two places for a destination, and Feed living
horizontally while every other space lived vertically broke the mental model. It also misaligned
content — the centered Feed column pushed "Wednesday / Good morning" far right of the bar's first
item. IA-STRATEGY.md §1 had already prescribed the fix (one grouped rail, Feed as the headerless
home anchor); ADR-060 was an interim step away from it.
**Decision:** Retire the horizontal bar entirely and run **one vertical rail**. **Feed** is pinned
to the very top as the home anchor (`section: null`, rendered a touch bolder with a hairline below
it). The comms loop — **Dispatches · Messages · Events** — moves into the rail directly under Feed
as the **Broadcast** section. The `placement` field (and `NavPlacement` type) are removed from
`nav-areas.ts` since there is now a single surface; the desktop rail and mobile drawer render the
same `NAV_SECTIONS`. The Feed page's reading column drops `mx-auto` so it left-aligns with the rail
and with every other page (Circles, etc.), giving one consistent content edge. No access levels or
permission-grid wiring change.
**Consequences:** One nav, one mental model; the center column reclaims the ~44px the sticky bar
held; content left-edges are consistent across pages. Messages keeps its header popover for quick
peeks; the rail is its destination. The finer IA-STRATEGY re-grouping it also proposes (a CONNECT
cluster, pulling Hubs/Nexuses out of the member rail) is **not** done here — left as follow-up so
this change stays a pure consolidation. Adding/moving an area remains a one-line `nav-areas.ts` edit.

---

## ADR-064: Beta demo content is flagged, badged, and recedes — one `is_demo` contract

**Status:** Accepted · realizes the Beta seed (PRs: demo seed, demo badge)

**Context:** The Beta needs a community that already looks alive — members, circles, posts,
events across San Diego + five national metros — without those fakes ever being mistaken for
real members or polluting real surfaces (search, leaderboards). It also has to disappear cleanly
as real content seeds in.

**Decision:** A single per-row `is_demo boolean NOT NULL DEFAULT false` on the demo-able tables
(`profiles`, `circles`, `events`, `posts`, `practices`) is the whole contract. A global
`platform_flags.demo_mode` (public-read, service-role-write, like `gem_config`) gates whether demo
content surfaces. Teardown is uniform — `DELETE FROM <table> WHERE is_demo` — no UUID lists, no
special-casing. Demo members are **auth-less** (`auth_user_id NULL`), with last names that are
playful variants of "Demo" (Demo, Demø, Demonski, …) as the human tell. In the UI every demo row
wears one understated **Beta Demo** pill (`components/ui/demo-badge.tsx`) and **recedes** (demo
profiles/circles are greyed + desaturated) so real content always reads as primary. The feed RPCs
(`feed_for_viewer`, `scoped_feed_for_viewer`) gained an `is_demo` projection — projection only, the
reach predicate is unchanged. Programs are intentionally **not** seeded (they are file-based under
`content/programs/`, not a table).

**Consequences:** Demo content is self-cleaning — purge the flag and the badges/greying vanish with
it; nothing to untangle. Location search and "real circles only" surfaces filter on `NOT is_demo`
cheaply (partial indexes). The seed is idempotent (deterministic UUIDs + `ON CONFLICT DO NOTHING`),
so re-running is safe. There is no CI step that applies migrations — the seed and these RPC changes
were applied to production via the Supabase MCP; the migration files are the source of truth.

---

## ADR-065: Directory location search uses Photon (OSM) + a PostGIS `circles_near` RPC

**Status:** Accepted · owner-approved geocoder choice

**Context:** The Directory needed a "start typing your city and it autocompletes" search that
finds **real** circles near a place (or the viewer's location). Circles already carry a PostGIS
`geog` generated column + GiST index, but nothing used it for proximity, and the app had no
geocoder. The stack is deliberately key-free (MapLibre + OpenFreeMap).

**Decision:** Geocoding/autocomplete uses **Photon** (`photon.komoot.io`, OpenStreetMap-backed) —
free, no API key, CORS-enabled, so it runs straight from the browser and keeps the stack key-free.
Google Places (owner's first instinct) and Mapbox were rejected for the Beta because both require
an account, a key, and billing; Photon's city/town coverage is sufficient and we can swap providers
later behind `lib/geocode.ts` if quality demands it. Proximity ranking is a `circles_near(_lat,
_lng, _limit)` SQL function using the `geog` `<->` nearest-neighbour operator, which **hard-excludes
`is_demo` circles** (and non-active ones) so location search only ever surfaces real groups. The
search is URL-driven (`near`/`place`) and lives on `/people` (the "directory"); the component is
self-contained and portable to `/circles`.

**Consequences:** No new secrets, no billing, no vendor lock-in for the Beta. Results are correct
but sparse until real circles get coordinates (most lack them today) — the RPC + UI are ready for
that fill-in. If Photon rate limits or coverage become a problem, swapping to a keyed provider is a
single-module change.

---

## ADR-066: Vera integration — the bridge doctrine, a memory table, one concierge+help voice

**Status:** Accepted (design) · 2026-06-03 · extends ADR-049 (Vera persona), runs on ADR-041/028
(AI kernel + governance), is the AI layer of ADR-047 (onboarding). Spec: [AI-VERA.md](AI-VERA.md).

**Context:** We want Vera to do onboarding *and* act as a personal help bot that remembers a member
and helps them as they go — **without** members leaning on AI (time-in-chat is the failure mode, not
the goal). Three things were unspecified or open: how restraint becomes a build constraint rather
than a vibe; where her memory lives (the ADR-049 open decision); and how she relates to the separate
onboarding tour and help-center/RAG work so we don't build three different AI philosophies.

**Decision:**
- **The bridge doctrine is a hard constraint.** We optimize the *inverse* of a chatbot: minimize
  time-to-human, maximize deflection-to-human, and let Vera's footprint **decay** per established
  member. Enforced by five build rules — deterministic-first (every surface has a non-AI baseline
  and fallback), offer-then-step-back (short answers ending in a concrete real-world next action),
  contextual-not-a-home (no "Vera tab"/persistent open chat as a primary surface), cap-the-spiral
  (bounded turns before routing outward), point-at-people (name the human, offer a warm intro).
- **Memory = a dedicated `ai_member_context` table** (one row/member: rolling `summary`, `facts`,
  derived `milestones`, `interaction_count`), **not** `profiles.meta.ai`. Source of truth is
  `engagement_events` (memory can't disagree with analytics); summary regenerated on the Batch API;
  `facts` captured via a `remember_fact` tool; member-readable + one-click erasable; RLS own-row;
  data-minimized to Anthropic. (`profiles.meta` stays for tour state per ADR-047.)
- **One voice across surfaces on the shared kernel.** Vera *is* the onboarding concierge (Phase 2
  of ADR-047, the deterministic tour as fallback) and *is* the help center's voice (grounded + cited
  RAG over `content/help`, confidence-gated hand-off). Not separate bots.
- **Resolved ADR-049 open decisions:** autonomy = propose-and-confirm everywhere (act-and-undo only
  for trivially reversible self-facts), graduating per-action via the audit log; first non-onboarding
  surface = **help**, then encouragement.

**Consequences:** Onboarding, help, and the engagement loop converge on one persona + one kernel —
the kernel (`lib/ai/`) and the RAG help bot are the shared first builds (Phases A–B), so this and the
support-system/AI-search initiative are the same critical path. A new migration adds
`ai_member_context` (+ RLS). The doctrine reframes success metrics: the activation funnel,
deflection-to-human, and footprint-decay — **not** messages-to-Vera. All ADR-028 guardrails apply
unchanged: bounded typed tools, copilot-first, caps + kill switch, crisis→human, AI labeled, and
**no autonomous writes until the test/consent harness exists.**

---

## ADR-067: Support system — AI/RAG search and a living-docs loop on the docs-as-code help center

**Status:** Accepted (design) · 2026-06-03 · builds on the docs-as-code help center
([HELP-CENTER.md](HELP-CENTER.md)) + the docs router ([DOCS-PROTOCOL.md](DOCS-PROTOCOL.md)); runs on
the AI kernel (ADR-041/028); Vera is the voice (ADR-066). Spec: [SUPPORT-SYSTEM.md](SUPPORT-SYSTEM.md).

**Context:** We want a help desk that (a) lets members ask in natural language and get a trustworthy
answer, (b) documents every feature/category, and (c) keeps itself current as the product changes,
with **minimal ongoing management**. The help center already exists (docs-as-code, `featureKeys`
drift signal, drift hooks + CI, `/sync-docs`, CHANGELOG), pgvector + the Claude SDK are present, and
AI-STRATEGY already specs a RAG support bot — but search is substring-only, the drift signal only
*nudges a human*, there's no measure of coverage, and **no embedding pipeline is built (only the
`vector(384)` column).** We needed to lock the search approach, the embedding model, and the
auto-update/review model before building.

**Decision:**
- **AI search = RAG over `content/help` on the shared `lib/ai/` kernel** — embed → retrieve →
  Haiku answers **grounded only in retrieved chunks, with citations**, in Vera's voice,
  confidence-gated to a human hand-off; a deterministic substring fallback is always available
  (kill switch / over-budget / keyless safe). The "Ask Vera" tier of the support menu *is* this.
- **Embeddings = gte-small via a Supabase Edge Function** (Transformers.js): 384-d (matches the
  existing column), zero per-call cost, server-side, key-free — chosen over Voyage/OpenAI to stay
  on the anti-lock-in + cost posture. Standardized platform-wide; the same model embeds index + query.
- **A living-docs loop with PR-based staff review.** The `featureKeys` drift signal triggers an AI
  doc-writer that drafts the article + CHANGELOG line from the diff and opens/updates a **PR with a
  staff review checklist**; staff approve in GitHub; merge re-embeds. **Nothing auto-publishes**
  (ADR-028 copilot-first, applied to docs). An in-product Studio review queue is a deliberate later
  option, not the first build.
- **Coverage is measured**, not vibes: a canonical feature-key registry + a coverage matrix (every
  key → a published, fresh article; flag missing/stale), and the demand side logs every AI query +
  confidence (`ai_help_queries`) so recurring unanswered questions become the to-write list.

**Consequences:** New data: a `help_chunks` table + `match_help_chunks` RPC + an `ai_help_queries`
log + a gte-small Edge Function + a `pnpm help:index` CI step (the missing embedding pipeline). The
`lib/ai/` kernel and the RAG help bot are the **shared first builds with Vera** (ADR-066 Phases A–B)
— this and the Vera initiative are one critical path, not two. All ADR-028 guardrails apply
unchanged. Phase 0 (feature-key registry + coverage matrix + the support-menu launcher + backfilled
articles) needs **no AI** and is the highest-leverage first step.

---

## ADR-068: Beta induction — a deliberate, temporary onboarding gate (separate from launch onboarding)

**Status:** Accepted · 2026-06-03 · a scoped **exception** to the non-blocking onboarding model
([ADR-047](DECISIONS.md)/[ONBOARDING.md](ONBOARDING.md)); scripted in Vera's voice
([AI-VERA.md](AI-VERA.md)) ahead of the live AI kernel. Spec: [BETA-INDUCTION.md](BETA-INDUCTION.md).

**Context:** The beta cohort is not the general public — these are people who raised their hand to
*build and test* Frequency. We want them to (a) feel the weight of that ("I'm here to build this,
not browse it"), (b) get a fast, stoked orientation to the core of the product, and (c) hand us the
profile + CRM signal (who they are, where, what they're hoping for) — without a slow form. This is
in direct tension with ADR-047's "non-blocking, explore-first, no wizard" rule, which is correct for
the **public launch** but wrong for a founding cohort.

**Decision:**
- **Ship a distinct, throwaway "beta induction"** at `/onboarding/beta`, separate from the
  steady-state onboarding. It is the live path **only during beta**; `/onboarding` redirects into it
  behind a single flag (`BETA_INDUCTION_ACTIVE` in `lib/onboarding/beta-script.ts`). At launch we
  flip the flag and delete the route — ADR-047's progressive tour is the permanent model.
- **One deliberate gate: the Oath.** Three commitment checkboxes (unfinished / report bugs / here to
  build) must be accepted to enter. This is the *single* blocking step and the whole reason a gate is
  acceptable here — the friction is the filter. Consent is stamped to `profiles.meta.beta.oath`.
- **Vera runs hot, scripted.** All copy is deterministic, authored in Vera's **hot register**
  (AI-VERA.md §2) — conviction, not confetti. No live AI calls (kernel/kill-switch not required); the
  script is also the Phase-2 fallback when live Vera lands.
- **Capture does double duty:** identity (name/handle/avatar → `profiles`), place
  (`nexus_region_id`), and **one intent question** ("what are you hoping for here?") →
  `profiles.meta.beta.intent` — the CRM gold and the future `suggest_circle` seed. Mirroring intent
  into the CRM `contacts.meta` / `ai_member_context.facts` is a follow-up, not this build.
- **Feature only the core triad** (Feed → Circles → Events) as **disposable inline-SVG "renders"**
  (DAWN-tokenized, `components/onboarding/renders/`) — cheap to delete when the design changes; no
  commissioned art.

**Consequences:** No migration — everything rides `profiles.meta` (like ADR-047's `meta.tour`). A new
route + client flow + three render components, all clearly marked temporary. The Vera bible gains a
**hot register** (the beta is its first home) without weakening the "bridge, not destination"
doctrine. When live Vera (ADR-066 Phase D) arrives, the induction script becomes its fallback; when
launch arrives, the whole induction is deleted in one PR.

---

## ADR-069: Member Data Platform — a governed trait/tag layer projected off the event ledger

**Status:** Accepted (design) · 2026-06-03 · builds on the event ledger ([ADR-025](DECISIONS.md),
`engagement_events`) and the analytics source-of-truth split ([ADR-050](DECISIONS.md)/[ANALYTICS.md](ANALYTICS.md));
privacy posture extends the member-erase path (ADR-066). Spec: [MEMBER-DATA-PLATFORM.md](MEMBER-DATA-PLATFORM.md).

**Context:** We want a meaningful, durable library of per-member variables — for gamification ranks,
marketing (e.g. a *Web Beta* badge → discounts / early access), and product metrics — and to "fine-tune
the experience" with cohort/usage data. The hard part already exists: one append-only, typed event
ledger (the keystone, ADR-025) plus a rich `profiles` table. What's missing is a governed layer on top:
declarative **tags**, derived **computed traits**, reusable **segments**, and — critically — a **catalog**
that makes each variable defined, typed, owned, and privacy-classed instead of a junk drawer of columns.

**Decision:**
- **Project, don't fork.** Member traits are a *projection* of `engagement_events` (ADR-025 "many
  projections"), never a parallel tracking system. Raw events stay the source of truth.
- **Two kinds, kept separate.** *Tags* (declarative membership, time + source aware) in `member_tags`;
  *computed traits* (lifecycle, cohort, usage, WAM) materialized on a schedule (Phase 2, `member_traits`).
- **The registry is the library.** Variable *definitions* live in code/git (`lib/traits/registry.ts`,
  reviewed in PRs, the same governance pattern as the help feature-key registry); *values* live in
  Postgres. Assignment goes through `assignTag`, validated against the registry — typos can't mint tags.
- **Privacy-by-design from row one.** Every registry entry carries a `pii` class + `retentionDays`;
  members can VIEW their own tags (RLS) and tags are erased with the account (FK cascade), extending the
  Vera member-erase path.
- **Phasing:** (1) registry + `member_tags` + *Web Beta* backfill of the founding cohort ✅ this PR;
  (2) computed traits nightly off the ledger; (3) segments/audiences + Studio admin; (4) activation
  (segment → `campaigns`/`contacts` reverse-ETL); (5) consent records + experiment-assignment traits.

**Consequences:** Gamification ranks, marketing segments, and Vera's personalization all read one
governed catalog. Adding a variable = a reviewed registry entry (+ a derivation for computed), not an
ad-hoc column. The trait layer is dark-safe and additive; nothing depends on it until read.

---

## ADR-070: Engagement & Marketing Intelligence — one Studio face on the ledger + AI kernel

**Status:** Accepted (design) · 2026-06-03 · convergence of the first-party analytics dashboard
([ADR-050](DECISIONS.md)/[ANALYTICS.md](ANALYTICS.md)), the AI marketing operator
([MARKETING-AI.md](MARKETING-AI.md)), and the trait/segment layer ([ADR-069](DECISIONS.md)), on the
event ledger ([ADR-025](DECISIONS.md)) + AI kernel ([ADR-041](DECISIONS.md)). Spec:
[ENGAGEMENT-MARKETING-ENGINE.md](ENGAGEMENT-MARKETING-ENGINE.md).

**Context:** We want deep product + marketing intelligence: what members do, which features get
used, where navigation jams, how they progress through programs/circles/the game, plus AI that
analyzes strategy and drafts content — surfaced on a live janitor dashboard. Most of this is
already specced or prototyped across three docs; the risk is building it as a fourth parallel
system instead of one face on what exists.

**Decision:**
- **One brain, many faces.** This is a Studio *face* on the existing ledger + AI kernel, not a new
  system. Instrumentation feeds `engagement_events`; dashboards + AI reads are projections of it.
- **Dual-emit, taxonomy-governed.** A single `track()` helper records first-party (authoritative)
  and mirrors GA4; every event is named in one taxonomy module so coverage is reviewable.
  Server-authoritative events can't be spoofed from the client (`clientEmittable` gate).
- **Privacy-by-design.** All first-party + member-tied (no new cookies, per ADR-050); **marketing
  is aggregate-only** (never references an individual — recognition, not surveillance, per
  MARKETING-AI); **human-approves-anything-public**; consent/erase lands with ADR-069 Phase 5.
- **Phasing:** (A) instrumentation depth — `track()` + taxonomy + page-view capture ✅ this PR;
  (B) janitor dashboard (activation funnel + where-it-jams + WAM/retention + feature adoption);
  (C) program/circle/game outcome analytics; (D) AI reads (Engagement Read + live-kernel Market
  Read); (E) AI content → Action Queue → comms spine.

**Consequences:** Product analytics, marketing AI, and member data share one ledger and one
governance kernel. Adding tracking = a reviewed taxonomy entry + a `track()` call, not a new
pipeline. Ships incrementally and dark-safe.

---

## ADR-071: Open the beta now — "Join the Beta" goes straight to sign-in + induction (waitlist parked for the gated phase)

**Status:** Accepted · 2026-06-03 · supersedes the lead-capture routing of the primary CTA; builds on
the beta induction ([ADR-068](DECISIONS.md)) and the open passwordless auth.

**Context:** Until now the featured "Join the Beta" CTA pointed at `/beta` — a marketing + **waitlist**
page (`BetaForm` → `requestBetaAccess`, "we'll reach out when a spot opens"). The founder wants the
content flywheel moving *now*: anyone who clicks "Join the Beta" should land directly in the cinematic
beta induction and become a real, building member — no queue. The waitlist framing is for a **later**
gated phase, not today.

**Decision:**
- **Flip the one CTA constant.** `BETA_CTA_HREF` (`lib/site.ts`) → `/sign-in`. Every sitewide "Join
  the Beta" button reads this single constant, so the whole funnel opens with one change. Sign-in is
  open passwordless (magic link + Google) and **creates the account on first use**; the `(main)`
  layout then routes any member without `meta.onboarding_completed` into `/onboarding` →
  `/onboarding/beta` (ADR-068). Result: click → sign-in → induction → real member.
- **Park, don't delete, the waitlist.** The `/beta` page, `BetaForm`, and `requestBetaAccess` stay
  intact and reachable by direct link — they are the lead-capture surface for the **future gated
  weekly-cohort phase** (AI admits a batch on a metric, with automated onboarding emails). Reviving
  it is a routing change, not a rebuild.

**Consequences:** No migration, no new route — a one-line href change plus this record. The beta is now
self-serve. When the gated phase lands, the CTA can point back at `/beta` (or a new admission flow) and
the induction stays exactly as-is behind it. The future gated/cohort system (AI-driven admission +
automated onboarding email sequence) is the next design, tracked separately.

---

## ADR-072: Admin IA — one grouped catalog, one page shell, one guard

**Status:** Accepted · 2026-06-03 · a presentational/organizational refactor of the `/admin`
surface. No schema or behavior change. Builds on the role ladder ([ADR-017](DECISIONS.md)
capabilities, `lib/core/roles.ts`) and the nav-areas model (`lib/nav-areas.ts`).

**Context:** `/admin` had grown to 19 pages behind a flat horizontal tab bar with no grouping,
**five routes orphaned with no nav link at all** (engagement, outcomes, insights, segments, vera),
and heavy page-to-page redundancy: every page repeated ~12 lines of identical auth/role boilerplate
and hand-rolled its own header at an inconsistent width (`max-w-3xl` here, something else there),
several with manual "Back to admin" links. One page even re-implemented `StatCard` locally. There
was no defined home for a number of features, and nothing enforced consistency.

**Decision:**
- **One catalog is the source of truth.** `app/(main)/admin/sections.ts` declares every admin
  surface in five role-gated groups — **Community** (host), **Structure** (guide/mentor),
  **Insights** (janitor), **Vera** (janitor), **Platform** (janitor). Both the nav (`sub-nav.tsx`)
  and the Overview launchpad render from it via `visibleGroups(role)`, so a feature is declared once
  and **can never be orphaned again**. Groups telescope by role — a host sees Community; a janitor
  sees all five — mirroring "each role manages the people/surfaces under them."
- **One guard.** `lib/admin/guard.ts` `requireAdmin(min)` replaces the per-page auth boilerplate,
  built on the request-cached `getCallerProfile()`. Pages assert their own floor
  (`requireAdmin('janitor')`, etc.); the layout gates host+.
- **One shell.** `components/admin/admin-page.tsx` (`<AdminPage>` + `<AdminSection>`) gives every
  page an identical header, width, and rhythm. Stat tiles use the shared `components/ui/stat-card`
  (the local duplicate is deleted). The Overview gains a grouped **launchpad**
  (`components/admin/admin-launchpad.tsx`) — every reachable surface, visible from one home.

**Consequences:** No route moves, no logic change — links and gates are unchanged; only the chrome
and organization are unified. New admin pages now cost one entry in `sections.ts` + an `<AdminPage>`
wrapper, and inherit the nav, the launchpad, and a consistent look for free. CRM/Marketing/Outreach/
Pages remain sibling rail areas (out of scope here); a future pass may apply the same shell to them.

---

## ADR-073: Admin nav goes two-layer — categories in the rail, the active category's pages as sub-tabs

**Status:** Accepted · 2026-06-03 · refines [ADR-072](DECISIONS.md). The single horizontal bar there
held all ~19 admin destinations + five group labels in one scroll — legible, but long. No schema or
gate change.

**Context:** With every admin surface reachable (ADR-072), the one horizontal sub-nav became the jam:
19 leaves across five groups in a single scrolling strip. The fix is to spread the depth across two
layers instead of one.

**Decision:**
- **Layer 1 — the rail carries the categories.** The single `admin` nav-area is replaced by the five
  admin **categories** (`admin-community` host · `admin-structure` guide · `admin-insights`,
  `admin-vera`, `admin-platform` janitor) under the **Manage** section of `lib/nav-areas.ts`, each
  deep-linking to its landing page, beside CRM/Marketing/Outreach/Pages.
- **Layer 2 — the sub-nav shows only the active category's pages.** `sub-nav.tsx` derives the active
  group from the URL (`groupForPath`, `sections.ts`) and renders just that group's ≤7 leaves as a
  short tab strip (mirrors the marketing workspace). Switching categories happens in the rail.
- **Telescope Manage, don't grey it out.** The rail normally shows every area muted-if-unreachable;
  for **Manage** we hide unreachable categories instead (`app-shell.tsx`), because operator consoles
  aren't aspirational member features — so a host sees ~2 Manage entries, a janitor all nine. Neither
  layer jams.

**Consequences:** No route moves, no gate change — `sections.ts` stays the single catalog feeding the
rail categories, the sub-tabs, and the Overview launchpad. The permission grid (`/admin/roles`) gains
the five granular category rows automatically (a janitor can now gate Insights separately from
Community). Any stored `area_permissions` override keyed to the old `admin` key is harmlessly orphaned
(defaults apply).

---

## ADR-076: Public site — make the multipart model the spine, dedupe splash, sync the menus

**Status:** Accepted · 2026-06-04 · a strategic content/IA redesign of the public marketing site,
grounded in the mission ([PLATFORM-VISION.md](PLATFORM-VISION.md): "one community, one game, two
engines") and the marketing kit (`components/marketing/marketing-ui.tsx`). No schema change.

**Context:** The home page read as jumbled. Its "answer" section pitched three pillars — **The Lab /
The Network / The Model** — where the **game was entirely absent**, "community" was buried as "The
Network," and "The Model" (the economics) was an opaque label. The multipart model a visitor should
grasp (community → a game that pulls you offline → physical third places → built together) never landed.
Separately: bespoke broken-grid/collage layouts placed images in "weird spots"; `/demo` and
`/how-it-works` both just explained "how it works"; and `SITE_NAV_MEMBER` injected splash tabs (How it
works / The Lab / About) into the **in-app top bar**, so the marketing "main menu" and the in-app "feed
menu" were out of sync.

**Decision:**
- **Model-as-spine.** The home narrative is rebuilt: hook → the ache → **the model: ① The Community ·
  ② The Game · ③ The Lab** (the game is now first-class and named) → **how you join** (a new `Steps`
  block: pick an interest → join a Circle → show up) → Moonlight proof → **built together** (the
  flywheel + pay-it-forward, absorbing the old "Network"/"Model" muddle) → the exhale → live proof →
  join. The cinematic Moonlight beat and all live data (counts/events/posts) are preserved.
- **Images earn their place.** The two bespoke collage/broken-grid sections are replaced with the
  system `ZigZag`, each with one purposeful photo; the dark-band model pillars get the right images
  (community / in-person action / the Lab storefront).
- **Dedupe splash.** `/demo` is merged into `/how-it-works` (the interactive product tour + the "a day
  in Frequency" timeline move over); `/demo` now `permanentRedirect`s (308). Splash headers verified
  against their jobs.
- **Sync the menus.** `SITE_NAV_MEMBER = []` — splash is marketing-only and no longer appears in-app;
  the shared community core (Discover → Circles / Events / **Interests**, renamed from "Topics" to match
  the in-app rail) is what both menus share. New reusable `Steps` component added to the kit.

**Consequences:** The public site now states the model plainly and matches the in-app vocabulary; the
marketing nav = community core + splash, the in-app nav = community core + member tools, splash never
leaks onto the feed. Content/IA only — no route deletions (only the /demo redirect), no data changes.
SEO/AEO metadata + structured data is the next pass, now that the page structure is settled.

---

---
### Decisions intentionally NOT duplicated here

Already fully covered by the repo docs (no ADR needed): the RLS / admin-client
authorization model and server-action error contract (ARCHITECTURE.md); the `profiles`
universal-entity design, soft-hide/suspension, and FK-on-delete conventions (DATABASE.md);
the Circle/Hub/Nexus/Outpost hierarchy and role ladder (GLOSSARY.md); cron, notifications,
email, push, and SEO/AEO (ARCHITECTURE.md + ROADMAP.md / SEO-AEO-PLAN.md).
