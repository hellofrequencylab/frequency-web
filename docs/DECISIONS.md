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

## ADR-074: Onboarding hands off to the Vera concierge — connect the bridge, fix the feed first-run

**Status:** Accepted · 2026-06-03 · wiring change to the new-member flow. Builds on the beta induction
([ADR-068](DECISIONS.md)) and the Vera concierge ([ADR-066](DECISIONS.md) Phase D). No schema change.

**Context:** The induction captured a founder's identity + intent and **seeded Vera's memory** with
their interests/goals/neighborhood — then redirected to `/feed?intro=1`, an **orphaned** path: nothing
read `intro=1`, so the member landed on a quiet feed with no next step, while the concierge built to
bridge them to a circle (`/onboarding/vera`, already holding their interests in memory) sat unreachable.
Stage A's whole goal is *sign up → **join a circle** → attend → earn → WAM* — and the leading lever
(first circle join) had no guide pointing at it.

**Decision:**
- **Induction → Vera.** `completeBetaInduction` now redirects to `/onboarding/vera` instead of
  `/feed?intro=1`. The final beat's CTA is reframed from "Create your first post" to **"Meet Vera"** —
  a first *circle*, not a first *post*, is the activation step. Dark-safe: the concierge falls back to
  its deterministic script when the AI kernel is off, and "Skip to circles" always escapes (ADR-066 §3:
  never trap them on Vera).
- **Feed first-run as the fallback.** A `FeedWelcome` banner renders at the top of the feed for any
  signed-in member with **no circle yet** — a warm "find your first circle" with `Browse circles` +
  `Ask Vera`. It self-dismisses on first join; the sidebar "Getting started" checklist carries the
  remaining steps. This catches anyone who skipped the concierge and makes the first step visible on
  mobile (the sidebar checklist isn't).

**Consequences:** The already-built concierge is now on the happy path — Vera is genuinely "aware of
new people and feeds them in," the vision for the gated-cohort phase. No migration; `meta.beta` and
`ai_member_context` seeding are unchanged. The dead `intro=1` query param is retired (the feed never
read it). Next onboarding steps (in-flow profile completion via `set_profile_field`, activation-funnel
instrumentation) build on this seam.

---

## ADR-075: Instrument the new-member activation funnel + Vera profile-completion nudge

**Status:** Accepted · 2026-06-03 · follows [ADR-074](DECISIONS.md). Wires the activation funnel on
the governed taxonomy ([ADR-070](DECISIONS.md), `lib/analytics/events.ts`). No schema change.

**Context:** The engagement funnel (`/admin/engagement`) existed but its lifecycle steps were hollow:
`circle.joined`, `practice.adopted`, and `profile.completed` were **defined in the taxonomy but never
emitted** by any code path, and there was no onboarding-specific funnel — so "where do new founders
drop between induction → Vera → first circle → first practice?" was unanswerable.

**Decision:**
- **Emit the missing lifecycle events** via the governed `track()` helper (best-effort, never blocks a
  user action): `onboarding.induction_completed` + `profile.completed` (in `completeBetaInduction`),
  `onboarding.vera_opened` (the concierge page), `circle.joined` (in `joinCircle` — also fixes the
  broad funnel), and `practice.adopted` (in `adoptPractice`). Two new taxonomy entries added.
- **Add a `New-member activation` funnel** (`ACTIVATION_FUNNEL` in `lib/analytics/dashboard.ts`):
  induction → Vera → joined a circle → adopted → verified, computed from the same per-type actor
  counts as the existing funnel (no new query). Surfaced first on `/admin/engagement`, above the
  broad engagement funnel, via one shared `FunnelView`.
- **In-flow profile completion (light).** Vera's system prompt now treats finishing a thin profile
  (a one-line `bio` via `set_profile_field`, a photo via `/settings/profile`) as a *secondary* win —
  one gentle offer, never before a circle. The tool + propose-and-confirm path already existed.

**Consequences:** The activation funnel reflects real drop-off the moment events accrue — the PMF lens
Stage A needs. Events are server-authoritative (`clientEmittable: false`), so they can't be spoofed.
No migration. Profile-completion stays circle-first and consent-gated like every other Vera write.

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

## ADR-077: Mobile-responsive sweep + the standing responsive rules

**Status:** Accepted · 2026-06-04 · a QA/fix sweep of the mobile (PWA) web experience + a written
standard so the drift doesn't re-accrue. No native app (that's Stage C); "the mobile app" is the
responsive website. No schema change.

**Context:** A full sweep of the app at 320–390px. The codebase was already strongly mobile-built
(the app-shell collapses to a drawer + bottom bar; compose modals are bottom sheets; grids use
single-column bases; templates use `min-w-0`/`truncate`/`flex-wrap`). The sweep found a focused set of
real bugs rather than a systemic problem.

**Decision (fixes):**
- **Wide data tables scroll, not clip.** 7 admin/marketing tables wrapped their `<table>` in
  `overflow-hidden` (clips columns on a phone) → changed to `overflow-x-auto`
  (`/admin/engagement|members|outcomes`, `/marketing/contacts|beta`, `/pages`; the permission grid
  already scrolled).
- **Fixed widths that exceeded a 320px viewport** reduced/made fluid: the home model `Pillar` circle
  (`w-80`→`w-64` base), the induction profile card (`w-72`→`w-full max-w-72`), the discover hero stat
  row (`flex`→`flex-wrap`).
- **Marketing header gained a mobile menu.** The desktop `PrimaryNav` is `hidden md:flex`, so phones
  had no way to reach How-it-works/The Lab/Pricing/About/Discover — only the Join CTA. A hamburger
  sheet (`components/layout/marketing-mobile-menu.tsx`) now carries the full splash + Discover nav.
- **App main padding** `px-6`→`px-4 sm:px-6` for breathing room on phones.

**The standing rules (so it stays fixed):**
1. Every `<table>` lives in an `overflow-x-auto` wrapper.
2. No fixed `w-[..px/rem]`/`min-w-[..]` wider than ~300px on in-flow content — use fluid + `max-w-*` or
   a smaller mobile base that scales up at `sm:`+.
3. Multi-column grids start at `grid-cols-1` (or 2) and widen at breakpoints — never base `grid-cols-3+`.
4. Any nav hidden at `md:` needs a mobile equivalent.

**Consequences:** Verified by code review at small widths, not on-device — a few items are flagged for a
real-phone glance (induction cinematic headings at `text-5xl` base; hover-only affordances that are
invisible to touch; a couple of pre-existing `bg-white`/`text-white` token violations). Those are a
follow-up touch pass, not blockers. Rules added to [DESIGN.md](DESIGN.md).

---

## ADR-078: Home goes Lab-first (Place → People → Path), "Game" → "Quest", CTA enters the induction

**Status:** Accepted · 2026-06-04 · revises the splash spine set in ADR-076. Content/IA + one routing
change; no schema change.

**Context:** ADR-076 led the home with the abstract "third space" model and presented the Lab as one of
three co-equal pillars, with "the Game" in the middle. The differentiator (a real physical room) was
buried, and the engagement system was still called "the Game" in marketing even though the live product
already calls it "the Quest" (the stats dock shows a Quest section linking to `/crew/quests`).

**Decision:**
1. **Re-sequence the splash as Place → People → Path.** The **Lab leads** as the emblem — the hero is
   the thermal-circuit photo (`lab-thermal.jpg`), copy "We're rebuilding the third place." The ache is
   compressed to one beat so we don't sell solution-first into cold traffic, the **Lab** expands as the
   first feature, **community carries the "start anywhere" on-ramp** immediately after (so non-local
   visitors aren't stranded — North County San Diego is the named beachhead, not a gate), and the
   **Quest closes the feature arc** right before the CTA ("Real life is the high score").
2. **Rename "the Game" → "the Quest" in all member/visitor-facing copy** (home, help center, metadata),
   aligning marketing to the product's existing vocabulary. Internal code identifiers
   (`GameStatsDockClient`, `game-stats-dock.tsx`, the "Field game system" comment) are invisible to
   users and left as-is — not a code refactor.
3. **"Join the Beta" now enters the beta flow.** `BETA_CTA_HREF` carries `?next=/onboarding/beta`; at
   sign-in the validated same-origin `next` is stashed in a short-lived, httpOnly `fq_post_login` cookie
   (keeping `emailRedirectTo`/`redirectTo` the bare, **allowlist-safe** `/auth/callback` — so the auth
   provider's redirect-URL match is never affected). `/auth/callback` reads the cookie, re-validates the
   path, redirects, and clears it. New members land in the cinematic induction instead of the bare feed.
   Previously `next` was never propagated, so every new account defaulted to `/feed`.

Also fixed in the same pass: the white-on-white CTA in dark mode (`text-text` → `text-ink` on
white-over-dark pills — the marketing header, the in-app header, the onboarding step indicator).

**Consequences:** The front door now leads with the un-copyable thing (a real room), keeps the emotional
on-ramp, and gives non-local visitors a path — while routing every "Join" straight into the induction.
The `/the-lab` page stays the deep-dive; the home Lab beat is the trailer (links to it). Verified by
tsc + lint + 153 tests + a production compile/typecheck (page-data collection needs Supabase env, which
the Vercel build has). SEO/AEO structured-data pass still pending from ADR-076.

---

## ADR-079: "The Quest" is the game; the multi-step feature is an "Arc" (naming collision resolved)

**Status:** Accepted · 2026-06-04 · canonical vocabulary in [THE-QUEST.md](THE-QUEST.md) +
[GLOSSARY.md](GLOSSARY.md). Player-facing strings done; the `quest_* → arc_*` schema/route rename is a
**pending deliberate migration** (checklist in THE-QUEST.md), not done in this pass.

**Context:** ADR-078 renamed the marketing "Game" → "Quest". But the product already used "quest" for a
different thing — the multi-step seasonal journeys backed by `quest_chains` / `quest_steps` /
`quest_progress` (surfaced in the stats dock as "Quest", linking `/crew/quests`). With the *game* now
called "The Quest", that lowercase "quest" became a collision.

**Decision:** The **game as a whole is "The Quest"** (seasonal, 13-week cycle on the natural calendar).
The **multi-step feature is an "Arc"** (e.g. "The Connector"), with **Steps** inside it. No player-facing
surface calls an Arc a "quest". Canonical currency/feature terms: **Zaps** (in-person XP → ranks),
**Gems** (durable spendable), ranks `ghost → runner → operative → agent → conduit → luminary`,
**Challenges** (community-wide), **Achievements**, **Streaks**, **Domains** (Mind/Body/Spirit/Expression).

**Consequences / what's left:** The internal schema still says `quest_*`; renaming it to `arc_*` is a
migration that touches generated types, the `/crew/quests` route, symbol names, and analytics keys — so
it's staged as its own refactor (THE-QUEST.md). **Until that ships, the in-app dock still shows "Quest"
for what is now an Arc** — the one remaining player-facing instance of the collision. Marketing copy
(home, help) already uses "The Quest" correctly for the game.

---

## ADR-080: Content architecture — Channels = 4 Domains over the existing posts substrate; rank for real-world connection

**Status:** Accepted · 2026-06-04 · blueprint in [CONTENT-ARCHITECTURE.md](CONTENT-ARCHITECTURE.md). Foundation shipped (migration `20260604010000`); reach/UI + ranker staged.

**Context:** The vision is "Facebook-level content with a clean way to find what you need." A deep mapping pass found the activity substrate already exists: `posts` (polymorphic `scope_id` + `visibility`) is the unified content table, comments are self-referential posts, and `feed_for_viewer`/`scoped_feed_for_viewer` (SECURITY DEFINER RPCs) are the safe query layer (base `posts` RLS is crew+-only). Wall and Feed are already two lenses over it.

**Decision:**
- **Channels = the 4 Domains (Mind/Body/Spirit/Expression)** as the top taxonomy layer (`domains` table); the existing `topical_channels` become the **Interests/Topics** underneath (`domain_id`); multi-topic tagging via `circle_topics` (then `event_topics`/`post_topics`). Naming: "Channel" = domain, "Interest/Topic" = topical_channel, the legacy `channels` table (hub/nexus/outpost streams) is a separate internal concept.
- **Don't rebuild the substrate** — extend the existing RPCs + tagging for Channel reach; keep Wall/Feed/Channel/Circle as queries over `posts`.
- **The ranker is "an algorithm you get to choose":** explicit Channels are the primary signal; a transparent, tunable score (recency-decay × affinity × locality × in-person bias) ranks within them.
- **Guardrail:** optimize for **real-world connection, never engagement-time.**

**Consequences:** Foundation is additive + non-breaking (new tables/column, public-read, writes via service_role). Staged next: Channel reach (`get_my_tuned_domain_ids`) + Channel browse pages + IA re-label, `event_topics`/`post_topics`, ranker v1. The 7 seeded interests were backfilled onto the 4 domains (editable data).

---

## ADR-081: Vera onboarding moves into a lightbox over the feed, and continues from induction

**Status:** Accepted · 2026-06-04 · extends ADR-066 (Phase D). Shipped.

**Context:** Post-induction we redirected the new member to a standalone `/onboarding/vera`
page whose concierge opened cold ("What brought you here? And don't say 'just looking'"). But
by then induction has already gathered who they are, where they are, and what they came for
(`profiles.meta.beta`: `intent`, `interests`, `location`, plus `display_name`), and seeded
Vera's memory. Asking again read as the system not listening, and a separate page pulled the
Founder out of the product on their first second inside.

**Decision:**
- After induction (and legacy onboarding), redirect to **`/feed?welcome=vera`** — the real
  product — and render Vera's onboarding as a **lightbox over the feed**, not a separate page.
- The lightbox is a short, personalized **deck → chat**: an inspirational continuance slide that
  reflects the member's own induction words back, one instruction ("Circles are your people.
  Show up."), then Vera's chat **seeded with a warm opening that picks up the thread** and points
  at the one next action (a real circle). She never re-asks what we already know.
- The opening + slides are built by **pure, dark-safe functions** (`lib/onboarding/vera-welcome.ts`),
  so the continuance works identically whether or not the AI kernel is live; unit-tested.
- Doctrine preserved (AI-VERA §3): one-tap escape to `/circles`, never trap them on Vera; the
  feed first-run banner still catches skippers (its "Ask Vera" now opens the lightbox too).

**Consequences:** The standalone `/onboarding/vera` page remains as a direct-nav fallback. The
lightbox reads `meta.beta` only on `?welcome=vera` (no cost on normal feed loads). Continuance
quality scales with induction data richness and degrades gracefully (intent → interests → bare
welcome).

## ADR-082: "Join the Beta" opens the induction immediately — no login wall; sign-in deferred to the final step

**Status:** Accepted · 2026-06-04 · supersedes the signed-out `BetaWelcome` gate. Shipped.

**Context:** Signed-out visitors who clicked "Join the Beta" hit `BetaWelcome` — a "Become a
Founder" sign-in card — *before* experiencing anything. It read as a login wall on a marketing
CTA and bled momentum at the exact moment intent is highest.

**Decision:** Signed-out `/onboarding/beta` now renders the **full cinematic induction
unauthenticated** (`BetaInduction deferred`). They run oath → reel → identity → place with no
login. Sign-in is collected at the **final "step in" beat** (email magic-link or Google). The
answers are stashed across the auth round-trip — text in a short-lived httpOnly cookie
(`fq_pending_induction`), the avatar (too big for a cookie) as a data URL in `localStorage` —
and written at the new auth-gated `/onboarding/beta/complete`, which uploads the avatar, calls
the shared `writeBetaInduction` core, clears the stash, and drops them into `/feed?welcome=vera`
(the Vera lightbox, ADR-081). The proxy already bypasses the whole `/onboarding/beta` prefix.

**Consequences:** No write happens until the member is authenticated (oath/avatar/handle checks
are deferred or run read-only). `completeBetaInduction` (authed direct path) and
`finalizePendingInduction` (deferred path) share one write core. **Known limitation:** a magic
link opened on a *different* device loses the browser-local stash (cookie + localStorage), so
that visitor restarts induction — acceptable for beta; same-browser and Google OAuth are
seamless. `BetaWelcome` is now unused (left in place; removed with the rest of the beta induction
at launch).

## ADR-083: Vera Marketing Intelligence Phase 2 — deterministic grounded forecasts + strategy, no model call

**Status:** Accepted · 2026-06-04 · builds on Phase 1 (`lib/analytics/marketing-intel.ts`). Shipped.

**Context:** Phase 1 shipped the deterministic marketing data spine (the `mkt_*` aggregates
surfaced on the janitor-only `/admin/intel` page): growth, interest demand, geo, content, and
leader signal. The page led with raw tables and stopped at the facts. The doctrine in those file
headers is firm: the findings stay deterministic, and the model only ever narrates them. Phase 2
needed to turn the facts into a forecast and a prioritized plan without taking a dependency on the
AI kernel being live.

**Decision:**
- Add a pure, unit-tested module `lib/analytics/marketing-forecast.ts` operating only on
  `MarketingIntel`. It exposes `projectGrowth` (least-squares linear trend for the next 4 weeks
  with an `accelerating`/`steady`/`slowing` momentum label from the recent vs earlier half of the
  series, guarded against fewer than 2 points), `demandGaps` (ranks interests where demand outruns
  supply; a channel with demand but zero circles is the highest-priority uncaptured gap),
  `topMomentumCity`, `staleLeaders` (oldest-to-act leaders to nudge), and `buildStrategy` (a
  prioritized `now`/`watch`/`hold` list derived solely from those grounded findings).
- Render a new top "Forecast & strategy" `AdminSection` on `/admin/intel`: projected next-4-week
  members/circles/events with momentum labels, then the prioritized strategy mapped to the
  PRESENTATION legend (✅ now / ⏳ watch / ⚠️ hold). Leads with the answer; degrades to plain text.
- No model call. Everything is deterministic and dark-safe: identical output whether or not the AI
  kernel is live. House style enforced: no em dashes in any returned copy (covered by a test).

**Consequences:** The forecast quality scales with how much weekly history exists and degrades
gracefully (the section says so and still emits a strategy from current demand/geo/leader signal
when the trend is ungrounded). The **Vera-narration layer remains a future enhancement**: it will
wrap these grounded findings, never replace them. New tests added in
`lib/analytics/marketing-forecast.test.ts`.

## ADR-084: Beta members get Crew (full gamification) for free; Launch limits the unpaid

**Status:** Accepted · 2026-06-04 · flag `BETA_MEMBERS_GET_CREW` in `lib/onboarding/beta-script.ts`.
Code shipped; Launch half is spec.

**Context:** Crew is the first paid tier ($10/mo) and the gate for the whole Quest (dashboard,
arcs, store, gem economy). During the Beta we want everyone *in* the game — racking up zaps/gems,
forming the founding leaderboard — not paywalled out of it.

**Decision:**
- **Beta = Crew for free.** Every member who completes induction is granted `crew`
  (`grantBetaCrew` in `app/onboarding/beta/actions.ts`, gated by `BETA_MEMBERS_GET_CREW`). Only
  members are upgraded — leaders (host+) and existing crew are untouched; role writes go through
  the admin client because the `prevent_role_self_escalation` trigger blocks non-`service_role`
  changes. Existing real members were backfilled to crew.
- **Downgrade anytime.** The existing `/upgrade` toggle (`toggleCrewRole`) already switches a
  member ↔ crew (never touching host+), so members can step down whenever they like.
- **The "Upgrade to Crew" sidebar box** is the re-upgrade pitch — it only shows to `member`
  (i.e. someone who downgraded), one-time, collapsing to a tab.
- **Launch transition (spec):** flip `BETA_MEMBERS_GET_CREW` OFF. New members default to Member;
  any member left **unpaid** keeps their earned gems but loses the Crew surfaces and the ability
  to **spend** gems (the store/redeem gates on crew + entitlement). The carrot to convert: unlock
  the game they already have points in. Ties into the freemium/Vault entitlement work (Section K).

**Consequences:** During the Beta the upgrade box is effectively dormant (almost everyone is
crew). The Launch gem-spend lock needs the entitlement/payment input on the capability resolver
(ADR-037) before it can switch on; until then this is a one-flag policy + a backfill.

## ADR-094: QR campaign challenges reuse the gamification engine (one join)

**Status:** Accepted · 2026-06-05 · migration `20260605030000_qr_campaign_challenges` (applied to prod), `lib/achievements.ts`, `app/q/[slug]/route.ts`, `app/(main)/admin/qr/campaigns.tsx` + `campaign-actions.ts`

**Context:** Phase 4 — QR scavenger hunts / marketing campaigns ("scan a set of codes → earn a
reward"). The repo already has a mature gamification engine: `season_challenges` (criteria jsonb +
target + zaps_reward) + `challenge_progress`, advanced by `advanceChallenges` off the
`engagement_events` ledger via `processGamificationEvent`, displayed on `/crew/challenges`, with
zap/gem rewards on completion. Building a parallel challenge system would duplicate all of it.

**Decision:** Model a campaign as a `season_challenges` row with `criteria {"type":"qr_scan"}` +
`target N`, scoped to a code set by **one new join** (`challenge_qr_codes`). The `/q` resolver emits a
`qr_scan` gamification event **idempotent per (code, member)** — so progress counts DISTINCT codes
("scan N of these"). `advanceChallenges` gained a `qr_scan` branch that increments only when the
scanned code is in the challenge's set. Everything else is reused unchanged: progress rows,
completion, `awardChallengeZaps` + `challenge_complete` gems, and member display on
`/crew/challenges`. Admin authoring is a new **Campaigns** tab in the QR Studio (create with
collect-all / collect-N + a code multi-select; delete is guarded to `qr_scan` challenges only so a
seeded challenge can't be removed).

**Consequences:** "Collect all" and "collect N" are the same mechanism (target = set size vs explicit
N). New campaigns appear on the existing crew challenges surface automatically (season =
current). Future: per-campaign time windows (add `valid_until` to `season_challenges`), partner-scoped
campaigns, and surfacing the hunt's codes/map to members.

---
## ADR-093: Server-side GA4 mirror (Measurement Protocol) closes the tracking loop

**Status:** Accepted · 2026-06-05 · `lib/analytics/ga-server.ts`, `lib/analytics/track.ts`, `lib/analytics/events.ts`. No migration.

**Context:** The analytics spine (ADR-070) dual-emits on the **client** — `trackClient` mirrors to
GA4 via `gtag` and records first-party. But **server-side** `track()` only wrote first-party; the
GA4 comment even said "mirroring happens client-side." QR funnel events are server-authoritative
and often never touch the browser (a scan at `/q` redirects off-site; referral attribution runs at
onboarding; gift-a-zap is a server action), so they were invisible to GA.

**Decision:** Add a server GA4 mirror over the **Measurement Protocol** (`sendGa4Event`) and call it
from `track()`, so every server event mirrors to GA4 just like the client half — closing the loop
without a parallel path. Inert unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` **and** `GA_API_SECRET` are set
**and** `NODE_ENV==='production'` (matches the client tag; dev/preview never hit the property).
`actorProfileId` becomes the GA `client_id` + `user_id` for grouping/cross-device. Added QR events to
the taxonomy (`qr.scanned`, `qr.referral_signup`, `qr.gift_zap`, client `qr.code_designed`) and fired
them from the resolver/actions. Names are dot→underscore-normalized for GA's rules.

**Consequences:** GA4 now sees the full QR funnel (scan → signup/gift) plus all other server events,
alongside the internal `qr_scans` + `engagement_events` ledgers. Best-effort + fire-and-forget — never
blocks a redirect or action. GA respects `anonymize_ip` + disabled ad signals (ADR-048).

**Update (2026-06-05): consent-gated (ADR-069).** The server mirror skips a signed-in member who has
opted OUT of the `analytics` scope (`hasConsent`), and the authenticated layout renders `GaConsentGate`
which sets gtag's native opt-out (`window['ga-disable-<ID>']`) for them client-side. Anonymous visitors
carry no account, so the scope doesn't apply and acquisition tracking is unaffected. (Default is
opt-out / granted, so this only changes behaviour for members who explicitly turned analytics off.)

---
## ADR-092: Crew marketing-funnel codes (≤3, owner + purpose-null)

**Status:** Accepted · 2026-06-05 · `lib/qr/marketing.ts`, `app/(main)/codes/marketing-codes.tsx`, `app/(main)/codes/actions.ts`. No migration.

**Context:** Crew members want to run their own outreach funnels — a styled, tracked QR on a
flyer/post that drives people to a circle or event they're promoting. This is distinct from the
three personal `purpose` codes (connect/referral/gift) every member gets (ADR-091).

**Decision:** A crew marketing code is a `qr_codes` row with `owner_profile_id = the member` and
**`purpose IS NULL`** — which cleanly separates it from the per-purpose personal codes (whose
unique `(owner, purpose)` index doesn't apply) and from admin dynamic links (which have no owner).
**No migration.** Each points at a circle/event via a root-relative `target_url` validated by
`isValidMarketingPath` (only `/circles/<slug>` or `/events/<slug>` — on-mission, not arbitrary
links); the picker (`listMarketingTargets`) offers the member's circles + hosted upcoming events.
Capped at **3 per member** (counted in `createMarketingCode`), crew-gated (`requireCrew`), with
full create/edit/delete + the Phase-2 styler, all on `/codes`. Codes encode `/q/<slug>`, so they're
tracked + retargetable like every managed code.

**Consequences:** Members now own two kinds of code — personal (purpose set) + marketing (purpose
null); both are owner-scoped and server-mediated. Referral-credit chaining (a marketing code that
also attributes signups) is a natural future enhancement. Per-code scan analytics show on the card.

---
## ADR-091: Per-member codes + referral attribution

**Status:** Accepted · 2026-06-05 · migration `20260605020000_member_qr_codes` (applied to prod), `lib/qr/member-codes.ts`, `lib/qr/referral.ts`, `app/(main)/codes/`, `app/q/[slug]/route.ts`, `app/(main)/g/[slug]/`

**Context:** Phase 3 of the QR platform. Every member should have an editable personal code
tied to The Quest + personal outreach; codes should also support in-app member actions
(referral, gift-a-zap), not just URL/node redirects.

**Decision:** Each member owns up to three persistent `qr_codes` keyed by a new `purpose`
column (`connect` | `referral` | `gift_zap`), lazily provisioned by `ensureMemberCodes`
(unique `(owner_profile_id, purpose)` index = idempotent). They're managed + restyled by the
member on `/codes` (the Phase-2 `StyleEditor`, gated by an ownership check in
`updateMyCodeStyle`); the member's avatar is dropped in as the default center logo. The
`destination_type` CHECK gains **`action`**, and the `/q/[slug]` resolver became a **route
handler** (so it can set cookies) that branches on `purpose`: **referral** drops an `fq_ref`
cookie → sign-in, attributed once at onboarding (`applyReferralAttribution` sets
`profiles.referred_by_profile_id` + rewards the referrer via the ledger's `invite_accepted`
zaps, idempotent on the pair); **gift_zap** routes a signed-in scanner to a confirm page
(`/g/[slug]`) whose action awards the owner a zap, idempotent per giver/day. All member codes
encode `/q/<slug>`, so they're tracked + retargetable like every managed code.

**Consequences:** `referred_by_profile_id` is a reusable growth signal (referral counts, viral
loops). Codes now span url/node/**action**; new action kinds slot in behind `purpose`. The /q
page→route conversion moved the dead-end UI to `/code-unavailable`. Crew "marketing funnel"
codes (next) and Google-Analytics tie-in build on this.

---
## ADR-090: Beautiful codes via an isomorphic styled SVG renderer (no new dep)

**Status:** Accepted · 2026-06-05 · `lib/qr/style.ts`, `lib/qr/render-styled.ts`, `app/(main)/admin/qr/style-editor.tsx`. No migration (reuses `qr_codes.style` jsonb from ADR-089).

**Context:** Phase 2 of the QR platform. The owner wants visually rich codes — brand colors +
gradients, center logo/avatar, module & eye shapes, a "scan me" frame. The `qrcode` dep only
renders plain black/white. Options: add a styling library (`qr-code-styling` is browser/canvas-
oriented, awkward server-side and pulls weight) or render our own SVG over the QR matrix.

**Decision:** Render our own. `QRCode.create()` already exposes the module matrix; a small
**isomorphic** function (`renderStyledQrSvg`) builds a designed SVG from it — drawing every data
module in the chosen shape, redrawing the three finder eyes as equivalent concentric shapes
(scanner-tolerant), optionally a gradient fill, a center logo (bumps ECC to 'H' + carves a quiet
box), and a CTA card frame. Style is a sanitized `QrStyle` persisted on `qr_codes.style`
(`parseStyle`: validated hex, https/data-image logos only, escaped label). Because it's
isomorphic, the **live editor preview (client)**, the Studio list, and `/api/qr?code=` downloads
emit identical SVG. No new dependency.

**Consequences:** The same styler now applies across **`qr_codes`** (dynamic links + member +
marketing) **and `nodes`** (check-in codes, `nodes.style`, backlog #5), and member connect codes
ship a styled default (avatar logo). Styled
**downloads are SVG** (vector, ideal for print); a **styled PNG** is now also available (backlog #4,
`lib/qr/raster.ts` via `@resvg/resvg-wasm` — remote logos inlined as data URLs, plain-PNG fallback).
Historical note: PNG was plain until a server-side SVG
rasterizer is added (logged as a follow-up). Phases 3–4 (per-member codes, challenges) inherit
the styler for free.

---
## ADR-090: Page-template kit completed — five shells, one `PageHeading`, declarative rail chrome

**Status:** Accepted · 2026-06-05 · `components/templates/` (`page-heading`, `focus-template`, `dashboard-template`, `index.ts` barrel + refactored `index`/`stream`), `lib/layout/page-chrome.ts` (+ `.test.ts`), `components/layout/app-shell.tsx`

**Context:** The page framework (this doc) defined three templates (Stream / Index / Detail) and an informal "Focus mode," but a design-team audit of every interior `(main)` page found it **half-adopted**: ~40 of ~75 pages hand-rolled their header, "Focus" was a hardcoded `pathname` list inside `app-shell.tsx` (so ~9 compose/edit/operator pages wrongly carried the global rail and crowded their content), and operator workspaces (Marketing/CRM/Crew) re-implemented stat tiles with no shared shell. The drift kept re-accruing because the system had gaps, not because the language was wrong.

**Decision:** Finish the kit so a page is *two lines of decision — pick a template, register a rail*:
- Promote **Focus** and **Dashboard** to real templates alongside Stream/Index/Detail; route all five through one `PageHeading` grammar (same type scale, eyebrow, description, action slot). `DashboardTemplate` is the no-rail operator sibling of `<AdminPage>`.
- Make the rail **declarative**: `lib/layout/page-chrome.ts` exports `railFor(pathname) → 'global' | 'scoped' | 'none'`; the shell shows the global rail iff `=== 'global'`. The old `SCOPED_SECTIONS` + `showSidebar` conditionals are gone. Reframing a route is a one-line edit there (locked by `page-chrome.test.ts`), never a shell edit.
- Export everything from a `@/components/templates` barrel; codify the decision tree in PAGE-FRAMEWORK §8 and the guardrail in `AGENTS.md`.

**Consequences:** Adopting `FocusTemplate` simultaneously fixed the wrong-rail bug on `/events/new`, `/practices/*/edit`, `/upgrade`, `/crm`, `/outreach`, `/codes`, `/connections/*`, `/g/*`, `/n/*` (one config, nine pages). Interior pages now become *assembly, not authoring*; remaining work is mechanical adoption tracked in [REDESIGN-INAPP.md](REDESIGN-INAPP.md). No data-fetching or capability gating changed — this is presentational chrome + a rail map only.

---
## ADR-089: Dynamic QR links as a first-class `qr_codes` entity (the "Both" model)

**Status:** Accepted · 2026-06-05 · migration `20260605010000_qr_codes_dynamic_links` (applied to prod), `app/q/[slug]/`, `app/(main)/admin/qr/` (Dynamic links + Analytics tabs), `lib/qr/{codes,analytics}.ts`

**Context:** Phase 1 of the QR platform (after ADR-088). The owner wants retargetable
"dynamic links" + scan analytics, alongside the in-app earning codes — and a code should be
able to point *either* at an action *or* at any URL ("Both"). The node engine (`nodes`) is
purpose-built for verified physical capture (secrets, coords, anti-cheat) and shouldn't be
overloaded with arbitrary external redirects.

**Decision:** Introduce **`qr_codes`** as the managed, retargetable code the Studio edits,
distinct from `nodes`. A code encodes a stable short link `SITE_URL/q/<slug>`; the resolver
`app/q/[slug]` logs the scan then redirects to the *current* destination, set by
`destination_type`: **`url`** (redirect anywhere — marketing links) or **`node`** (forward to
`/n/<node_id>`, reusing the whole verified earn pipeline). So one entity spans both worlds with
no reprint. **`qr_scans`** is the append-only analytics log; the `record_qr_scan` SECURITY
DEFINER RPC appends a scan + bumps a cached `scan_count` atomically. Both tables deny client
access via RLS (like `nodes`); the resolver + Studio use the service role. A `style` jsonb
column is reserved now so the Phase 2 visual editor needs no re-migration. Slugs are
auto-generated from an unambiguous alphabet (`lib/qr/codes.ts`), custom slugs allowed;
analytics roll-up is pure + unit-tested (`lib/qr/analytics.ts`).

**Consequences:** `/q/<slug>` is the canonical dynamic entry going forward; `/n/<id>` stays for
the node engine, and a `node`-type dynamic link is the bridge (styled, analytics-tracked,
retargetable wrapper over an earning node). Migration applied to prod 2026-06-05; types
regenerated. Phases 2–4 (beautiful editor on `style`, per-member referral/action codes,
challenges/campaigns) build on this entity.

---
## ADR-088: QR Studio authors codes on the existing node engine (no new schema)

**Status:** Accepted · 2026-06-04 · `app/(main)/admin/qr/`, `lib/qr/`, `app/api/qr/`, `app/(main)/codes/`

**Context:** The owner asked for a "QR code generator" tied to members, activities, and
gamification, with an admin editor and easy member access. The physical-engagement engine
already exists — `nodes` (qr/nfc/ghost) + `captures`, server-authoritative verify → ledger →
zaps → `practice.verified` / partner redemption (ADR-020/023). What was missing was the
**authoring surface** and **image generation** (no QR library was installed), not the backend.

**Decision:** Build the studio *on top of* the engine rather than a parallel system. A "code"
is a `nodes` row; **no migration**. (1) `lib/qr/links.ts` builds the only thing a code encodes —
a stable same-site URL (`/n/<nodeId>` for earning, `/people/<handle>` for a member's connect
code) — so every code is **dynamic**: edit its behaviour in the DB, never reprint. (2)
`lib/qr/render.ts` renders SVG/PNG via the pure-JS `qrcode` dep (no `sharp`). (3) `/admin/qr`
(host+, in the Community admin group) creates/edits/retires codes with inline QR preview; (4)
`/api/qr` serves print downloads, gated to signed-in callers and **same-site links only** (not
an open generator); (5) `/codes` gives every member their personal connect QR.

**Consequences:** The feature ships functional against the live DB today (qr/nfc, no
`location`/`secret` authoring). Deferred, each clearly seamed: ghost-node geo authoring (needs
a `SECURITY DEFINER` node-upsert RPC to build the PostGIS point), signed payloads (the `/n`
claim flow must forward `?s=`), and first-class binding of a code to a specific event/activity
entity (a `nodes.entity_type/entity_id` column). `qrcode` + `@types/qrcode` added to deps.

---
## ADR-087: "Journeys" = the open member library; the gamified engine → "Quests"

**Status:** Accepted · 2026-06-04 · migration `20260604180000_rename_journeys_engine_to_quests`. Engine rename shipped; the open Journeys library is backlog §Q1.

**Context:** A new feature (backlog §Q1) lets members curate practice-combos by Pillar and
share them into an open, free library — the product owner calls these **"Journeys."** That name
was taken by the Crew-gated, gamified, seasonal tracked engine (`journey_chains`, `/crew/journeys`,
in *The Quest* nav). Two "Journey" things would confuse the free/paid line.

**Decision:** The member-facing **"Journeys"** becomes the **open, free, user-built** health-path
library. The gamified tracked engine reverts to its original name **"Quests"** — it lives in *The
Quest* nav and is the zaps/badge/season machine, so the name fits. Renamed `journey_chains/steps/
progress → quest_*` (dropping the stale `quest_*` backward-compat views first), `/crew/journeys →
/crew/quests` (with redirects from `/crew/journeys` and `/crew/arcs`), nav key `journeys → quests`,
and all engine-context "Journey(s)" copy → "Quest(s)" (the-quest marketing, admin, dock, crew
dashboard). The feed's `JourneyBoard` keeps the **Journey** name — it's the personal/open concept.

**Consequences:** The `journey_*` table namespace is now **free** and reserved for the open
Journeys library (§Q1). This is the engine's third name (quest → arc → journey → quest); it returns
home. The library remains free (rides the practice loop); only the Quest engine stays Crew-gated
(ADR-084). `docs/ECONOMY-AND-JOURNEYS.md` is now partly mis-titled — see its header note; a full
pass lands when §Q1 builds.

---
## ADR-086: Vera dialed as a persistent, attuned companion (presence + depth)

**Status:** Accepted · 2026-06-04. Persona/voice shipped; persistent launcher pending build.

**Context:** Vera was built onboarding-first and routing-biased — the system prompt said *"get
out of the way fast"* and *"not a follow-up question that farms another turn,"* and the §3
doctrine forbade *"persistent open-ended chat as a primary surface."* The product owner wants
Vera to be a **loving, welcoming companion** — present, emotionally attuned, with real
conversational depth — that always nudges toward action and positive expression.

**Decision:** Rebalance (not discard) the bridge doctrine on three axes:
1. **Presence → persistent companion.** Vera should be one tap away on every member page via a
   single docked launcher (AI-VERA §4.0), which also absorbs the floating help launcher's three
   tiers so there's *one* bubble, not two. *(Persona/voice landed now; the launcher is the next
   build.)*
2. **Depth → guided multi-turn.** She stays in a real back-and-forth for a few turns (remembers
   the session; facts persist via `ai_member_context`) instead of one-shot ejecting. Bounded
   turn caps stay; the prompt no longer punishes caring follow-ups.
3. **Job → attune → nudge → teach → bridge.** Every exchange: read the feeling and make the
   person feel met *first*, then nudge toward one real next step (practice, circle, person,
   gathering, a kind word), teaching how the place works as needed, and bridging to a human when
   one can help better. Warmth is honest, never confetti; the dry edge and the no-cruelty serious
   gear remain.

Also locks the **always-reachable** rule: when Vera names a feature she makes it tappable in the
same breath (tool proposal / link / named human) — a bare mention is a bug.

**Consequences:** Updated `buildSystemPrompt` (`lib/ai/vera/agent-claude.ts`), the default
greeting (`config.ts`), the lightbox companion framing, and AI-VERA.md §§1–4. The standalone
`/onboarding/vera` page is retained as a no-JS / deep-link fallback to the concierge (the feed
lightbox stays primary). The two parallel crew-gating components were also consolidated into one
`UpgradeLightbox` (cleanup, not a decision).

---
## ADR-085: Arcs renamed to Journeys (full DB + route rename)

**Status:** Accepted · 2026-06-04 · migration `20260604170000_rename_arcs_to_journeys`. Shipped.

**Context:** The multi-step seasonal tracks were "Quests" → renamed "Arcs" (ADR-079) → now
**Journeys**, the product name that reads as a guided coaching program (see
ECONOMY-AND-JOURNEYS.md). Half-renames (label only) breed confusion, so this is the full rename.

**Decision:** Rename the tables `arc_chains/arc_steps/arc_progress → journey_chains/journey_steps/
journey_progress` (renaming keeps policies/indexes/FKs attached; no function/RPC referenced them,
so it's clean), the route `/crew/arcs → /crew/journeys` (with a redirect stub at the old path),
the nav area key `arcs → journeys`, and all user-facing "Arc(s)" copy → "Journey(s)" (nav,
breadcrumbs, dashboard, dock, the-quest marketing, admin). Types regenerated.

**Consequences:** Old `/crew/arcs` links 301 to `/crew/journeys`. Any `area_permissions` override
keyed `arcs` is orphaned (reverts to the `crew` default — the intended baseline). The DB still has
constraint/index names containing "arc" (cosmetic; functional).

## ADR-088: Community communication architecture — six surfaces, Channels as feed+room, 1:1 DM with group→rooms, location-first feed

**Status:** Accepted · 2026-06-04 · spec in `COMMS-STRATEGY.md`. Staged build A→E; no code shipped yet.

**Context:** Community communication had grown three overlapping concepts — topical Channels
(a feed/discovery taxonomy), Rooms (`visibility` public/private/scoped, Discord-ish), and a
`conversations` table that served **both** 1:1 and group DMs. The product intent is a *local-first,
always-alive* place: a newcomer should see nearby activity and Circles, the feed should niche from
global → local as they engage, and messaging should have one obvious 1:1 DM plus a community board
for everything multi-party. The overlap made "where does X live?" ambiguous and blocked a clean AI
layer.

**Decision:** Collapse communication into **six non-overlapping surfaces** (Feed, Channels, Circle
[+Hub/Nexus], Dispatch, Rooms, Direct Messages — see `COMMS-STRATEGY.md` table) with these rulings:
- **Channel = feed + one open public room.** A topical Channel gets both its content feed and a
  single always-on public room anyone tuned-in can post to — the answer to "engage even without a
  related Circle." Circles stay the local/real-world unit; Channels the global/topical unit.
- **DM is strictly 1:1.** `conversations` becomes 1:1-only; existing group conversations are
  **migrated to `rooms`** with `visibility='private'` ("private chat room = group message").
  Public rooms remain Discord-style threads (`room_messages.parent_id` activated).
- **DM security = hardened, server-readable** (RLS + TLS, **message requests** for strangers,
  disappearing-message option, block/report UX) — **not** E2E, deliberately, so AI + moderation can
  extend to messaging later.
- **Location-first feed.** Member location becomes first-class (promote `profiles.meta.beta.location`
  to geo columns + PostGIS; member joins the map, not just Circles). `feed_for_viewer` gains
  distance ranking + a `radius_m` param driven by a **member radius slider**; home location with an
  optional **live-GPS toggle**.
- **Dispatch ceiling.** Add `global` to `dispatches.audience_scope` gated to **staff/janitor only**;
  Circle/Hub/Nexus leaders keep their scoped reach.
- **Room AI (all four jobs):** catch-me-up summaries, topic menu + semantic search (reuse the
  gte-small embeddings already running for help search, over `room_messages`), Q&A over history,
  and intent-driven surfacing of Circles/events/Quest actions — under the existing per-feature AI
  budget ledger.
- **Liveness without fatigue:** real-time push only for the personal (DMs, dispatches *to you*,
  @mentions, your event RSVPs); ambient activity rolls into a "near you" pulse/digest via the
  durable `notification_queue`. Ship all four liveness signals (presence, typing, near-you-now
  counter, recent-activity markers).
- **Open-room moderation = AI pre-screen + human escalation** (reuses `moderation_actions`).

**Consequences:** First build (Phase A) is member geo + nearby-first feed + the join/start
onboarding. Group-DM→private-room is a one-time, reversible data migration needing a participant/
message-integrity verification pass. Choosing server-readable DMs trades maximal privacy for an
extensible AI/moderation surface (revisit if E2E becomes a requirement). `feed_for_viewer` and the
`dispatches` enum change are additive/backward-compatible.

## ADR-089: Member-visible hierarchy + always-offer "Start a Circle" (supersedes IA-STRATEGY hide-and-join-only)

**Status:** Accepted · 2026-06-04. Supersedes the "Circle + Interest only, hubs/nexuses contextual"
and "join, don't found" guidance in `IA-STRATEGY.md` (update that doc on build).

**Context:** `IA-STRATEGY.md` deliberately hid Hub/Nexus jargon from members and steered newcomers
to *join* (not found) Circles, to avoid a map littered with thin/empty Circles. The communication
strategy (ADR-088) instead wants the full place-tree to feel real and navigable, and wants every
newcomer offered *both* "join nearby" and "start here" from day one — reinforcing the local,
go-build-it intent.

**Decision:**
- **Surface the full hierarchy.** Circle → Hub → Nexus are member-visible, navigable layers (not
  just backstage context).
- **Always offer join + start.** New members see "Join a Circle near you" and "Start a Circle here"
  side by side, regardless of nearby density.
- **Empty-Circle guardrail.** Mitigate the thin-Circle risk from `IA-STRATEGY.md` by **deferring a
  Circle's heavier surfaces** — its private room and richer tooling — until it crosses a small
  activity/size threshold (auto-provision on momentum). Founding stays easy; ghost Circles stay
  lightweight.

**Consequences:** `IA-STRATEGY.md` must be updated (it currently states the opposite). More
vocabulary for newcomers to learn (Hub/Nexus); offset by clearer sense of scale. Circle-creation
volume rises — the momentum-gated room provisioning (ADR-088) is the pressure valve.

## ADR-090: Demo content v2 — a year-old, viral, local Encinitas community

**Decision.** Replace the first-generation demo seed (the old North County SD `c…`
cast and the five out-of-area national metros `d…`) with one fully-local demo
community centered on **Encinitas**: ~250 auth-less members across 12 circles,
modeling a community that is one year old and "went viral" but stayed inside the
North County border (Oceanside / Vista / San Marcos / Poway / La Mesa / San Diego
proper). Migration series `20260605000001`–`…000300`. Casting bible + build spec:
[DEMO-CAST.md](DEMO-CAST.md).

**Why.** The brief wanted a believable, *bounded* local community, not a national
sprinkle. The story is carried by **maturity signals** (deep streaks, full trophy
cases, a 10-event history with attendance, dense reply threads, a real rank
pyramid 3/12/30/55/80/70) rather than inflated headcounts — counts stay **honest**
(see the DemoNotice below). National metros were out of scope, so teardown retires
them.

**Practices got a real schema (migration …000000).** `practices` gained
`header_image, summary, body, category, icon, cadence, reward_zaps, reward_note`.
`logPractice` applies a practice's `reward_zaps` as the per-log override — so the
reward attaches to the *doing*, and a cold plunge can be worth more than a journal
entry. The 16 existing practices were backfilled and 18 new ones added.

**Programs reward the doing, not the reading.** Program frontmatter gained
`header_image` + `reward`; the detail page renders the image and a "what you earn"
callout whose copy points at the circle-lifecycle zaps (start +50, activate +40,
host +50, attend +25, invite +30). Completing a program still records progress
without awarding points — preserving the North-Star guardrail.

**Controls + the tell.** Reuses the existing `is_demo` contract, the
`platform_flags.demo_mode` kill switch, and the `/admin/demo` toggle+purge. The
demo tell is now a small **yellow ⚡ bolt** badge across members/circles/posts/
events/practices, and a right-sidebar **DemoNotice** card explains it and shows
the honest *"N demo members + N real ones — Help us make this real!"* count
(self-hides when demo is off or purged).

**Validation.** Every v2 migration was executed against a throwaway PG16 cluster
(minimal schema mirroring the real constraints) before commit. This caught a wrong
`circle_practices` ON CONFLICT target (10 files), two misaligned `VALUES` aliases,
and a duplicate handle — none of which static review had surfaced.

**Consequences.** All demo content carries `is_demo` and purges in one
`DELETE … WHERE is_demo`; `demo_mode` hides it in one flip. Set-generated
engagement (reactions, RSVPs, achievement unlocks, streaks, member-practice
adoptions) is deterministic + idempotent and cascades away with the cast.

---

## ADR-091: Demo Seed Studio + the seed -> claim -> decay model

**Decision.** Evolve demo content from a one-off hand-seeded cast into a
repeatable **growth engine**. Three pillars: (1) a janitor-only **Seed Studio**
wizard that generates a believable community for any new area on demand; (2) a
template + variable **generation engine** (`lib/demo/engine.ts`) that produces
people with *journeys* (tenure + rank drive what they post and when),
conversations between them, events, and gamification; (3) a **claim -> decay
lifecycle** so demo content converts to real and disappears as an area
propagates. Guiding principle: **demo content is scaffolding, not furniture** —
it exists to make an empty area feel alive long enough for real people to take
root, then dissolves on its own.

**Why these shapes.**
- **Service-role server actions, not SQL.** The Studio seeds through the admin
  client (`auth.role() = 'service_role'`), which satisfies the
  lock_economy_columns guard — sidestepping the SQL-editor / MCP-approval / guard
  problems that blocked the raw bundle. Economy columns are still written to
  their *designed* values so the achievement-award trigger cannot drift them.
- **Area = geo centre + radius (PostGIS geog), no schema change.** Seeding,
  per-area purge, and the future decay cron all operate on a geo cohort, so the
  feature ships without a migration.
- **Templates by default, AI optional.** Curated per-channel template pools with
  seeded RNG are deterministic, free, offline, and controllable; an AI-polish
  toggle (Vera) is wired for later as an enhancer, never the dependency.
- **Honesty invariant.** Counts stay real, every demo row keeps the yellow bolt,
  `demo_mode` + purge remain master switches.

**Phasing.** P1 (this ADR): engine + Seed Studio (preview + seed + per-area
purge). P2: member-facing **"Claim this Circle"** — a real member converts a
demo circle in place (`is_demo -> false`, host -> them) via a short wizard ("If
this were your circle, what would it be about?"), inheriting a furnished circle.
P3: a nightly **decay cron** computing each area's real/demo ratio and
auto-receding then purging demo as real content grows (sprouting -> established
-> self-sustaining).

**Consequences.** Operators can light up a new metro in minutes; the long-term
cleanup is automatic; the same `is_demo` contract governs everything. Large
"thriving" seeds make hundreds of inserts via sequential server-action calls and
may need a background job (noted for P1b).

---

## ADR-092: Retire the hand-built 250-cast; the Seed Studio is the demo seeding path

**Decision.** Abandon the one-off 250-person Encinitas demo cast — its seed
migrations (`20260605000001`-`…000300`) and the `DEMO-CAST.md` casting bible are
removed. All demo content is now generated on demand by the **Seed Studio**
wizard (ADR-091) and cleaned by the purge button + nightly decay. The practices
rich-content schema (`20260605000000`) is kept; the demo practice rows are purged
with the rest. The live database is swept of all `is_demo` content via the
`/admin/demo` purge.

**Why.** A static hand-seeded community proved brittle to apply (SQL-editor /
MCP-approval / economy-guard friction) and is not the product direction. The
wizard makes any area seedable, previewable, and reversible — so we keep the
engine, not the one-off cast. Supersedes the *seeding* portion of ADR-090
(its `is_demo` / `demo_mode` / purge infrastructure still stands).

**Consequences.** Fresh databases no longer ship a prebuilt demo community;
operators seed areas via the Studio. `is_demo` + purge + decay remain the
contract. `lib/demo/generate.ts` looks practices up at runtime (no hard-coded
seed UUIDs) so it survives the purge.

---

## ADR-093: Seed Studio generates the full connection web — AI palette + templates, zero side effects

**Decision.** The Seed Studio engine (`lib/demo/engine.ts`) seeds the *whole* web
of local-community connections, not just circles/people/posts: an event **cadence**
(two past + one upcoming) with going RSVPs, a circle practice with member adoptions
and recent `practice_logs`, post **reactions** from circle-mates, **attendance
streaks**, **achievements**, and open **Journeys** (`journey_plans` + items +
adoptions). Generation is **demographic-aware** via a *palette + templates* hybrid:
ONE cheap Haiku call per area (`lib/demo/ai-palette.ts`) returns locale-fitting
names, real local activities, a vibe phrase, and journey titles; the deterministic
`buildPlan()` expands that palette into every row. The AI pass is an opt-in wizard
toggle (default on) that **fails soft** to the built-in template pools — seeding
never depends on it.

**Why.** Demographic believability wants intelligence; reliability and cost want
determinism. One palette call per *area* (not per row) gives both: an Encinitas
seed reads surf/wellness with fitting names, a Midwest town reads different, and a
"thriving" seed is still one model call. Richer connection types make the demo read
*lived-in* (attended events, streak-backed practices, an adopted Journeys library)
instead of a wall of posts.

**Unobtrusive contract (two senses).** (1) **No real-world side effects** — writes
go direct via the admin client, never through the app's award/notify helpers, so no
automations fire; RSVP reminders are **pre-stamped** (`reminder_*_sent_at`) so the
cron never emails; seeded achievements are **zero-reward** so the award trigger is a
no-op and the economy can't drift. (2) **Recedes/cleans up** — every parent row is
`is_demo` (children cascade). The one exception, `journey_plans`, carries no
`is_demo` flag and its `author_id` is `ON DELETE SET NULL`, so a shared
`deletePlansByAuthors()` (`lib/journey-plans.ts`) removes demo plans by their demo
author **before** the profiles in every teardown path — per-area purge, global
purge, and the nightly decay pass.

**Consequences.** Journey tables aren't in the generated `Database` types yet, so
journey writes go through the untyped admin handle (repo convention,
`lib/journey-plans.ts`). Large "thriving" seeds still make hundreds of sequential
inserts (the ID-capturing loops); the heavy engagement rows are batch-inserted, but
a background job remains the path for very large areas (carried from ADR-091).

---

## ADR-094: Beta induction sequences — one template, audience-targeted copy, cohort tags

**Decision.** The beta induction (ADR-068) becomes **audience-parameterized** rather
than one-size-fits-all. A *sequence* (`lib/onboarding/beta-sequences.ts`) bundles a
public **splash** (`/beta/<slug>`) with the induction's **voiced copy** (Vera's HOT
register) and a **marketing tag**. Three ship at launch: `early-adopter` (the
original — followers from Daniel's video), `personal` (Daniel's hand-invites into
"the dream"), and `founding-partner` (collaborators + businesses, "Founder energy").
The induction template already accepted a `copy` override, so a sequence just *feeds*
it — no rewrite. The splash CTA carries the audience via `?seq=`; a 30-day
`fq_beta_seq` cookie keeps it across the deferred sign-in round-trip; on completion
`writeBetaInduction` records `meta.beta.sequence` and stamps the cohort's marketing
tag. A janitor-only **splash-page creator** at `/admin/beta-sequences` lists +
previews every sequence (copy, the tag, and the shareable link).

**Why.** Same product, very different doorways: a stranger from a video, a personal
friend, and a prospective business partner each need a different first sentence to
feel *spoken to*. One induction engine with swappable copy keeps the cinematic flow
DRY while letting the voice change per audience. Tagging at the door means the
founding cohort stays **segmentable by entry path forever** — even after the beta
flow itself is deleted at launch (the tags are durable; the sequences are not).

**Mechanics.** `typeof VERA` is all readonly string *literals*, which rejects any
different wording, so a widened `VeraCopy` type (same shape, `string` leaves) is the
contract for sequence/operator copy. Marketing tags are governed: they're declared
in the trait registry (`lib/traits/registry.ts`) as snake_case keys
(`beta_early_adopter`, `beta_personal`, `beta_founding_partner`) — `assignTag`
refuses unregistered keys, so a typo can't create an orphan tag. Tagging is
best-effort and never blocks onboarding. Operator copy overrides from `/admin/vera`
still apply to the **default** (early-adopter) sequence — that's what they were
authored against; the other sequences use their own copy.

**Consequences.** Sequence copy lives in code (reviewed in PRs), not yet a DB-backed
editable layer — the creator page is read/preview for v1; an editable override
(vera_config pattern) is the noted follow-on. The whole module is TEMPORARY by
design and deleted at public launch, leaving only the durable cohort tags behind.

---

## ADR-095: Acquisition attribution — first-touch capture at the edge, governed source tags

**Decision.** Capture **how every visitor first reached us** and persist it on the
member/lead, following marketing best practice: **capture-on-arrival, first-touch
primary, never overwrite.** A new `lib/attribution/` module owns one channel
taxonomy (`donor`, `referral`, `qr_scan`, `event_guest`, `video`, `social`,
`search`, `email`, `organic`, `direct`). The **edge proxy** (`proxy.ts`) writes an
immutable `fq_attr` first-touch cookie on an anonymous visitor's first request —
utm_* params, `gclid`/`fbclid`, referrer, landing path, timestamp — plus an
`fq_src` channel hint on the person-driven entry routes (`/join`, `/events`; the
`/q` resolver sets `qr_scan`). At member/lead creation `resolveAcquisition()` folds
the cookies into one canonical record; the **first-touch channel** becomes the
governed tag `source_<channel>` (`lib/traits/registry.ts`) and the full record
(first-touch detail + converting/last-touch channel + signals like the referrer
profile id and beta sequence) is written to `profiles.meta.acquisition` /
`contacts.meta.acquisition`.

**Why.** Attribution that's collected at signup-time has already lost the truth —
the campaign and referrer that brought someone are only knowable on their *first*
request, and they must survive the whole sign-in round-trip. Capturing at the edge
into an immutable cookie is the standard fix. **First-touch primary** credits the
founding cohort's true origin (the choice for this stage); last-touch is still kept
for multi-touch analysis. Modeling the channel as a governed `source_*` **tag**
(one boolean per channel, exactly like the `beta_*` cohort tags) makes every origin
instantly segmentable in `/admin/segments` with zero new query code, while the rich
utm/referrer detail rides `meta` where free-form JSON belongs.

**No migration.** It rides existing surfaces only — `member_tags` (governed tags),
`profiles.meta`, `contacts.meta` — so it sidesteps the type-regen / migration-drift
issue entirely. Tags are validated against the registry (`assignTag` refuses
unregistered keys), keys are snake_case (`source_qr_scan` mirrors `channelTag()`),
and all writes are best-effort — attribution never blocks signup.

**Scope.** `donor` and `event_guest` are **plumbing only** for now: the channels +
resolver are wired so they attribute the moment those flows exist; `event_guest` is
already set on anonymous event-page visits, but no donations product or guest-RSVP
flow is built yet. Channel derivation is pure + unit-tested
(`lib/attribution/channels.test.ts`). A **backfill** (`lib/attribution/backfill.ts`)
infers a source for pre-capture members from `referred_by_profile_id` +
`meta.beta.{heard_about,sequence}` (idempotent; honest — uninferable members stay
untagged, not mislabeled `direct`); a **rollup** (`lib/attribution/rollup.ts`) groups
the `source_*` tags into the channel-mix view on `/admin/intel` with a one-click
backfill button. Both are migration-free reads/writes over `member_tags` + `meta`.

---

## ADR-096: Member authoring — practices editor + Journeys builder, personal-free / library-paid

**Decision.** Members can **author**, not just consume. Two halves:

- **Practices editor (free).** A member can fully edit a practice they **created**
  (name, summary, description, full markdown guide, cadence, pillar, category, icon,
  header image) at `/practices/<id>/edit`. To change a library practice they don't
  own, the library offers **"Customize"** — `forkPractice()` makes a **private copy**
  they own (`is_public=false`) and opens the editor on it. Quick-create then routes
  straight into the editor ("add a basic practice, then modify it"). **Rewards
  (`reward_zaps`/`reward_note`) are NOT member-editable** — the economy stays
  admin-governed; that's the "partial flexibility" line.

- **Journeys builder (personal-free / publish-paid).** The Journeys editing suite
  lets a member assemble a path of practices with **per-item cadence + note**
  overrides, reorder, and edit the plan's title/summary/cover. Building and using a
  **personal** journey (private/unlisted) is **free**; the **public library /
  marketplace is the Crew (paid) surface** — publishing a journey, and adopting or
  forking someone else's public journey, require Crew. (Closes the loophole where a
  free member could fork-then-adopt around a paywalled adopt.) Per-item cadence adds
  one additive column, `journey_plan_items.cadence` (null = the practice's default).

**Why.** "A way to turn the people near you into community" wants members shaping
the practice content, not just admins. Editing **your own** + **fork-to-customize**
gives real flexibility while protecting the shared library (you never mutate a
practice others adopted). Gating on **the library, both sides** (publish + consume)
is the coherent monetization the owner chose — "paid = the library" — and matches
the ADR-084 economy (Crew is the paid tier; free in Beta via `BETA_MEMBERS_GET_CREW`).
Keeping rewards out of the member editor protects economy integrity (ADR-037/084).

**Mechanics.** All writes go through the service-role lib behind app-code authz
(`created_by`/`author_id` ownership), the repo convention for the untyped
practices/journey tables. The Crew check reuses the role ladder (`atLeastRole`,
`lib/core/roles.ts`); the paywall surfaces via the existing CrewGate pattern.
Per-item cadence is the only schema change (additive column, applied via MCP);
everything else rides existing tables.

**Consequences.** A markdown textarea (not a WYSIWYG) for practice bodies in v1 —
the Puck block editor is heavier than a personal practice guide needs; can upgrade
later. Forked practices are private by default; a "share my practice to the library"
(publish a member practice) is a follow-on. Backlog **S7** (uniform right rail on
every interior page) will give these new editor/detail routes the standard shell.

---

## ADR-098: Profile Creator — a new owner-scoped intake entity (`network_contacts`)

**Status:** Accepted · `supabase/migrations/20260606000000_network_contacts.sql`, `lib/connections/*`, `app/(main)/connections/*`, `lib/ai/connections-ai.ts`. See [NETWORK-CRM.md](NETWORK-CRM.md). AI kill-switch operator surface (addendum): `supabase/migrations/20260606010000_platform_flag_events.sql`, `app/(main)/admin/ai/*`, [AI-CONTROLS.md](AI-CONTROLS.md).

**Context.** Stewards wanted to capture people they meet — snap a business card or
poster, harvest the details, cut out a profile photo, draft a connection note + tags
— with manual entry + Vera assist as the fallback, and a system built for *many
sources* with *routing/sorting*. Critically: **personal captures must not bleed into
public data.** Neither existing table fits. `profiles` is real members with PUBLIC
read (a scanned lead isn't a member; public read = leak). `contacts` is the
marketing list (consent + campaigns, service-role, no ownership/privacy axis).

**Decision.** A new entity, `network_contacts` (+ `network_contact_notes`,
`network_contact_tags`), deliberately separate from both. `owner_id` is the privacy
primitive; `visibility` (`private` → `shared` → `network`) gates promotion; `source`
(`card_scan`/`poster`/`manual`/`import`) and `status` carry the routing/sorting.
Photos & original scans live in a **private** Storage bucket (`network-contacts`,
`public=false`) served only via short-lived signed URLs — never the public
avatars/posts buckets. RLS: owner CRUD on own rows; only `visibility='network'` rows
are readable beyond the owner; notes/tags inherit the parent's ownership. The tool
is gated to stewards (host+) **or** Studio staff (`team_members`), but every record
stays owner-scoped regardless. AI harvest goes through the existing kernel
(`getAnthropic`, kill switch, per-feature budget caps, usage ledger) and **degrades
to plain manual entry** when AI is off or a call fails — the product never depends on
the model being up (mirrors `lib/studio/winback.ts`).

**Model tiering.** Per the cost doctrine (`lib/ai/models.ts`, AI-STRATEGY), the
*vision* OCR of a card runs on **Sonnet** (`connection-scan`, cap $3/day) and the
*text-only* Vera assist on **Haiku** (`connection-assist`, cap $1/day) — not Opus on
every scan, which would blow the budget governance. The model returns a structured
payload via a forced tool call (`save_contact`), including a normalized face
bounding-box; the client crops the photo on a `<canvas>` (no server image lib /
new dependency). All model output is re-validated by `coerceExtraction()` before it
touches the form — never trusted raw.

**AI kill-switch addendum.** The platform-wide AI switch (`platform_flags.ai_enabled`)
becomes operable from the Janitor menu (`/admin/ai`) instead of SQL-only, with a new
append-only `platform_flag_events` audit table (who/when/old→new). The page also
surfaces per-feature daily spend from `ai_usage`. A mobile `+` quick-add (stewards/
staff) jumps straight to `/connections/new`.

**Consequences.** New tables aren't in `database.types` yet, so the store talks to
them through the untyped admin handle (repo convention, cf. `lib/studio/contacts.ts`)
— regenerate types after applying. Promotion *into* public/network surfaces
(`linked_profile_id` / `linked_contact_id`) is scaffolded in the schema but kept a
deliberate, owner-initiated act behind its own review — that's where leak risk
concentrates. A scanned card's base64 is passed to Sonnet via the private-bucket
download; the temp scan is deleted after extraction (we keep only the cropped
avatar). Adds a Steward rail item (`/connections`, "Profiles").

---

## ADR-097: Left-nav IA refresh — two member worlds (Community + The Quest) + Steward/Platform

**Decision.** Collapse the member rail from five groups (Community · Practice ·
Connect · The Quest) into **two worlds**, and fold the four axis-grouped admin
sections into **two** (Steward + Platform). Driven by an owner screenshot review;
edits `lib/nav-areas.ts` (the single source of truth shared with the permission grid).

- **Community** (belong & gather): **Broadcast** (the local-happenings board, leads
  the group) · Channels · Circles · Events · Messages · Directory.
- **The Quest** (the game + practice, one integrated world): **Dashboard** ·
  Practices · Journeys · **Programs** · **Store**. Crew-gated items (Dashboard,
  Store) preview for non-crew → full at crew.
- **Steward** (host+ / staff axis): Overview · CRM · Marketing · Hubs & Nexuses.
- **Platform** (janitor): Insights · Vera · Members · Pages.
- **Friends** moves out of the rail to a **top-right header icon** (it already lived
  in the account dropdown). **Outreach** drops as a standalone rail item and is
  surfaced inside the admin **Overview** launchpad. Steward + Platform telescope
  (hidden unless reachable); the two member worlds mute/preview as before.

**Naming decisions (owner-delegated).** **Programs** belongs in **The Quest** (it's
the same family as Journeys/Practices — leader-run curricula + a shared library, not
a separate "Practice" world). The Quest spend surface is **"Store"** (the in-game
economy + Vault); the future real-money merch e-commerce gets the distinct name
**"Shop"** — reserving the cleaner word for the surface that takes real money avoids
confusing play-currency with cash. ("Outfitters" was floated as on-theme flavor;
"Store" wins on clarity.)

**Why.** The five-group rail over-fragmented a small set of destinations; "Practice"
and "Connect" each held 2–3 items that read better merged. Practice IS the Quest
(the WAM loop feeds the game), so one world removes a false boundary. Folding
Structure/Studio into Steward matches how a steward actually works (community +
business in one place); operator-only tools stay isolated under Platform. This
supersedes the 5-world nav notes in ADR-089/ADR-095.

**Consequences.** Deeper follow-ons are logged, not done here: Broadcast as a true
local-happenings **dashboard** (the route exists; its content is the next step), the
real-money **Shop** e-commerce build, and fully weaving Outreach **content** into the
Overview page (only the nav entry moved). `nav-icons.ts` already had every key. No
schema change; per-area permission overrides for the dropped `friends`/`outreach`
keys simply no longer apply.

---

## ADR-099: Scan-to-invite — shared-CRM lead, one-time intro email, referral credit

**Status:** Accepted · `supabase/migrations/20260606020000_scan_invite.sql`, `lib/connections/{crm-sync,invite,lead-unsub}.ts`, `lib/email.ts` (`sendScanIntroEmail`), `app/u/scan/route.ts`. Extends ADR-098. See [NETWORK-CRM.md](NETWORK-CRM.md).

**Context.** A scanned personal contact (`network_contacts`) should join the shared
Studio CRM, get a single intro/invite, and credit the steward when the person joins
— **without** an unlawful blast to people who never opted in.

**Decision.** On save (email present), upsert the lead into `contacts` with
`source='scan_invite'`, `consent_state='unknown'` — added but **never
auto-subscribed** (no marketing until they opt in). Link it via
`network_contacts.linked_contact_id`. Optionally (a per-scan checkbox) send **one**
transactional intro from the steward, gated behind the operator flag
`scan_invite_email_enabled` (**default off**). The email's join CTA is the steward's
own **referral** QR link (`/q/<slug>`, ADR-091): an anonymous click drops `fq_ref`,
and signup runs the existing `applyReferralAttribution` → `awardZapsForAction(ref,
'invite_accepted')`. So **points-on-join is automatic with zero new economy code.**

**Legal posture.** The intro is a single, person-initiated introduction (the steward
met them) — not bulk marketing. It carries a working one-click unsubscribe
(`/u/scan`, HMAC over `contacts.id` → `consent_state='unsubscribed'`, RFC 8058
headers), a non-member footer (doesn't claim membership), and an optional
`COMPANY_POSTAL_ADDRESS` for CAN-SPAM. `invited_at` guards against re-sends;
suppressed/unsubscribed addresses are never re-mailed.

**Consequences.** Live sending needs `RESEND_API_KEY` + the operator flag on
(toggle on Marketing → Contacts, audited in `platform_flag_events`); otherwise the
flow degrades to CRM-sync only. `emailShell` gained an optional custom footer. Set
`COMPANY_POSTAL_ADDRESS` for full CAN-SPAM compliance on the intro.

---

## ADR-100: Marketing pages → editor = live; `Tiers` block unblocks Pricing

**Status:** Accepted · `lib/page-editor/templates/{the-community,the-quest,pricing}.ts`, `components/page-editor/blocks/collections.tsx` (`Tiers`), `lib/page-editor/{config,data}.tsx`, `app/(marketing)/{the-community,the-quest,pricing}/page.tsx`. Extends ADR-054 / ADR-055. See [PAGE-EDITOR-SPEC.md](PAGE-EDITOR-SPEC.md) §12.

**Context.** The public marketing pages were bespoke-coded; the Pages editor only
listed a subset, so "what's in the editor" drifted from "what's live." The owner
asked for **editor = live**: every marketing content page editable from the block
library, with its styling faithfully preserved. The splash (`/`) and `/about` stay
code-locked (ADR-054) — their live counts / crafted rhythm aren't block-expressible.

**Decision.** Port each remaining public content page (The Community, The Quest,
Pricing) into a faithful **standardized-block template** seeded by the editor, and
add each slug to `EDITABLE_PAGES`. Each page route renders `getPublishedData(slug)`
through `@measured/puck/rsc` `Render` when a published doc exists, else falls back to
the coded `Legacy<Page>`. Pricing's priced membership cards had **no** block
equivalent, so rather than approximate them (losing prices/badges) or code-lock the
page, we added a standardized **`Tiers`** block: per-tier price + struck price +
cadence + note, a `Featured` highlight (lift/ring + "Most popular" ribbon), an
optional Founder badge, a feature checklist, and a CTA — built from tokens and
threaded through the universal `<Band>` adjust controls like every other block.
Bespoke sections with no 1:1 block (PillarNav nav-chrome, ProductTour, timelines,
the "free during beta" banner) are omitted or approximated with FeatureGrid /
Statement, and all selectable icons map to the curated 16-icon set.

**Consequences.** All four public content pages (The Lab, The Community, The Quest,
Pricing) are now editor-editable; only the splash and About remain code-locked. The
block catalog grows to 24 (`Tiers` in **Sections**). Templates are code defaults —
nothing is written to the DB until a janitor Publishes, so opening the editor always
shows the page rebuilt from standard sections. Faithful-but-not-pixel-identical
approximations are documented in each template's header for reviewers.

---

## ADR-101: Demo posts reach every viewer's feed (not just demo-circle members)

**Status:** Accepted · `supabase/migrations/20260605050000_feed_demo_visible_to_all.sql`. Amends ADR-064/065 + the feed RPC reach model. See [DEMO-SYSTEM.md](DEMO-SYSTEM.md).

**Context.** A signed-in member reported seeing **no demo content in the home feed**
even though `demo_mode` was on and 100+ demo profiles / 3 demo circles / 69 demo
posts existed. Root cause: the Seed Studio writes demo posts as **`group`-visibility**
posts inside the demo circles, but `feed_for_viewer` / `scoped_feed_for_viewer` only
surface `group` posts whose `scope_id` is in the viewer's joined circles. A real
member who hasn't joined a demo circle (the common case — you don't join sample
circles) therefore matched none of them, so the demo layer never made their feed
feel "alive" — the exact job it exists to do (DEMO-SYSTEM.md: demo posts surface in
the home + circle/profile feeds).

**Decision.** Add `or p.is_demo` to the visibility reach-clause in both feed RPCs.
Demo posts are still gated by the existing `(not is_demo or demo_mode)` predicate, so
`demo_mode = false` removes them in one flip, and the per-viewer header toggle
(`fq_hide_demo`, filtered in `FeedList`) still hides them for an opted-out member.
Net: when `demo_mode` is on, demo posts appear in **every** viewer's feed regardless
of circle membership, and on a demo circle's wall for any viewer (so the claim flow
shows a furnished, not empty, circle).

**Alternatives considered.** (a) Seed some `public` demo posts — rejected: the demo
posts intentionally live in demo circles as group chatter, and a parallel public set
would double the teardown surface. (b) Auto-join new members to a demo circle —
rejected: pollutes real membership data and the decay logic. (c) Leave as-is and rely
on members joining a demo circle — rejected: brand-new members join nothing first,
which is precisely when the feed most needs to look alive.

**Consequences.** Demo content is now genuinely community-wide filler while the Beta
runs. No new columns or app code — one SQL migration recreating the two existing feed
functions. Real `group`/`cluster` reach for non-demo posts is unchanged.

---

## ADR-102: CRM pipeline suite — a generic sales pipeline over the unified contact book

**Status:** Accepted · `supabase/migrations/20260605060000_crm_pipeline.sql`, `lib/crm/pipeline.ts`, `app/(main)/crm/**`. Extends the Studio CRM (ADR-027) + the unified `contacts` record.

**Context.** `/crm` was a read-only member roster scoped by steward role; there was no
way to track opportunities (prospective members, partners/sponsors, upgrades) through
stages. The owner asked to expand it into a full CRM suite with a sales pipeline,
**unified** across members + leads + scanned network contacts, with a **generic**
(configurable-stage) pipeline plus deal records, activities/tasks, and analytics.

**Decision.** Three additive, **service-role-only** tables (no RLS policies — accessed
behind the host+ CRM guards, like `contacts`/`team_members`):
- `crm_stages` — reorderable stages with a `kind` (`open`/`won`/`lost`); seeded
  Lead → Contacted → Qualified → Proposal → Won → Lost.
- `crm_deals` — an opportunity: `title`, `value`/`currency`, `stage_id`, `status`
  (mirrors the stage kind), `expected_close_date`, `owner_id`, `created_by`, and the
  unified contact links — `contact_id` (→ `contacts`) and/or `profile_id` (→ member),
  with a denormalized `contact_name` so a card always renders even without a linked row.
- `crm_activities` — notes/calls/emails/meetings + due-dated **tasks**
  (`due_at` + `completed_at`) on a deal.

UI = the `/crm` route turned into a tabbed suite (`CrmTabs`): **Pipeline** (KPI row +
a horizontally-scrolling stage board; deals move via ◀/▶ or the stage select) and
**Contacts** (the prior roster, now a launch point for `createDealForProfile`). Deal
detail (`/crm/deals/[id]`) edits fields, moves stages (incl. quick Won/Lost), and runs
the activity/task timeline. The `crm_*` tables aren't in the generated DB types yet, so
reads/writes go through the untyped-client cast (the lib/studio + lib/page-editor pattern).

**Alternatives.** Bolt the pipeline onto the Marketing/Studio console, or onto the
Steward roster only — rejected for the **unified** ask (one pipeline over members +
leads + network contacts). Generic stages chosen over a fixed membership/partner
pipeline so one board holds any deal type.

**Consequences.** A genuinely functional v1 CRM suite (board + deal records +
activities/tasks + analytics), gated to host+ like the prior roster. Visibility is a
shared org pipeline for now; per-owner/role scoping and stage editing in-app are the
obvious next iterations. Regenerate DB types to drop the untyped casts later.

---

## ADR-103: Seed Studio generates a naturally-grown neighborhood (hub/guide, walls, friendships, dispatches)

**Status:** Accepted · `lib/demo/engine.ts`, `lib/demo/decay.ts`, `app/(main)/admin/demo/**`, `supabase/migrations/20260605090000_hubs_is_demo.sql`. Extends ADR-091/092/093.

**Context.** The Seed Studio produced circles + in-circle conversation + events +
practices + journeys, but the result read as isolated circles, not a *community*.
It set no `circles.host_id`, had no Hub/Guide layer, no cross-circle wall/feed
chatter, no friendship graph, and no Dispatches — so the seeded area didn't look
like it had grown naturally.

**Decision.** Rebuild the generation engine to write the full social web, on-brand
with Frequency's voice ("show up", "your people", "be missed"):
- **Hierarchy:** one **Hub** (neighborhood) run by a **Guide** (`community_role='guide'`),
  over the circles, each with its **Host** now stamped on `circles.host_id`. The
  Guide is a member of the first circle and knows every Host.
- **Walls & feed:** members write on each other's **walls** (public posts scoped to a
  profile) and post to the **public feed** — the cross-circle chatter.
- **Friendships:** an accepted friendship graph (within-circle, cross-circle bridges,
  Guide↔Hosts), canonical-ordered to satisfy the `user_a_id < user_b_id` constraint.
- **Dispatches:** published broadcasts from Hosts (circle scope, incl. event promos)
  and the Guide (hub scope).
- Richer, deterministic content corpus + event descriptions.

**Teardown.** `dispatches`, `friendships`, and wall posts are all `ON DELETE CASCADE`
from the demo author, so purging the demo profiles sweeps them. `hubs` had no
`is_demo` and `guide_id` is `SET NULL` (not cascade), so a purged guide would orphan
its hub — fixed by adding **`hubs.is_demo`** and deleting demo hubs *after* their
circles (`circles.hub_id` is `NO ACTION`) and *before* profiles, in both purge paths;
the nightly decay also sweeps orphaned demo hubs. The new column isn't in the
generated DB types yet, so the purge code uses the untyped-client cast.

**Consequences.** A seeded area now reads as a lived-in neighborhood with leadership,
relationships, and broadcasts — not a set of disconnected circles. Determinism and
the unobtrusive contract (no automations, pre-stamped reminders, zero-reward
achievements) are preserved. Regenerate DB types to drop the `hubs.is_demo` cast later.

---

## ADR-104: Economy re-strategy — Gems for web, Zaps for in-person/outreach; rebalanced amounts

**Status:** Accepted · `supabase/migrations/20260605100000_economy_rebalance.sql`, `lib/zaps.ts` (fallbacks), `lib/engagement/currency.ts` (routing, unchanged). See [ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md) §3.

**Context.** Two currencies exist with the right *routing* already (`currencyForSource`:
web→gems, in-person/outreach→zaps), but the per-action amounts hadn't been thought
through as a season-level system, and a couple of zap actions (`circle_start`,
`circle_activate`) had no tunable config row (code-fallback only).

**Decision.** Keep the split, and rebalance amounts so the two currencies play
distinct roles:
- **Zaps = the rank/status currency** (drives `current_season_zaps` → season rank).
  Real-world presence + outreach, biggest rewards off-screen:
  found a circle 100 · host an event 60 · activate a circle / an invite joins 40 ·
  show up (verified check-in) 25 · outreach task 20 · log a practice 12 · node 10.
- **Gems = the spendable currency** (Vault), web/on-platform care, **daily-capped** so
  it can't be farmed: Arc 30 · challenge 15 · welcome 8 · RSVP/join 5 · post 3 (≤3/day)
  · reply 2 (≤5/day) · login 2 (1/day) · react 1 (≤5/day); achievements grant zaps,
  season-convert handled by `reset_season()`.

Tuned against the `lib/season-ranks.ts` ladder (Operative 300 · Agent 750 · Conduit
1500 · Luminary 3000) for a ~13-week reference season: casual → Operative, regular →
Agent, leader → Conduit/Luminary. Amounts live in `gem_config`/`zap_config` (tunable);
`ZAP_AMOUNTS` in `lib/zaps.ts` mirrors the zaps as the missing-row fallback.

**Consequences.** Season progression now reflects real-world contribution, gems are a
slow spendable stash, and every action is a tunable config row (incl. the two new zap
rows). Season length is admin-controlled (`reset_season`), so the ~13-week figure is a
design reference, not a hardcode. No app-logic change — purely amounts + one fallback.

---

## ADR-105: NFC parity — Web NFC writer + per-scan medium attribution

**Status:** Accepted · `supabase/migrations/20260605120000_qr_scan_medium.sql`,
`app/(main)/admin/qr/nfc-writer.tsx`, `lib/qr/links.ts` (`withMedium`), `app/q/[slug]/route.ts`.
Extends the QR platform (ADR-089→094) and the physical `nodes` engine.

**Context.** `nodes` already supported `type='nfc'`, and the verify/capture/award
pipeline is type-agnostic — but there was no way to actually *program* a physical NFC
tag, and a tag tap on a **dynamic link** (`/q/<slug>`) was indistinguishable from a
printed-QR scan in `qr_scans`. So "NFC" existed in the engine but not as a usable,
measurable channel in the Studio. Issue #221 calls for NFC parity.

**Decision.** Two additions, no new entity:
- **Writer (client, Web NFC).** `NfcWriter` writes a code's URL to a tag via
  `NDEFReader.write()` (Chrome-for-Android only; degrades to a plain "NFC (Android)"
  hint everywhere else — the QR still covers those scanners). Surfaced on every code
  card that already offers a download: dynamic links, member profile codes, marketing
  codes, and check-in nodes.
- **Medium attribution.** A written dynamic-link tag encodes `?m=nfc` (helper
  `withMedium(url, 'nfc')`); the `/q` resolver reads it and forwards `p_medium` to
  `record_qr_scan`, which stores it on a new, defaulted `qr_scans.medium` column
  (`'qr' | 'nfc'`, default `'qr'`). Analytics (`summarizeScans`) split totals by
  medium, surfaced as an **NFC taps** stat. Check-in **nodes** carry their channel via
  the node's own `type`, so their tags are written with the plain URL (no marker).

**Alternatives.** A separate `nfc_taps` table (rejected — medium is one column on the
existing scan log); inferring NFC from the User-Agent (rejected — unreliable, and a tag
URL is the authoritative signal). Native/Expo NFC reader is out of scope here (web only).

**Consequences.** Operators can mint NFC tags for any code from an Android phone, and
QR-vs-NFC performance is now measurable per code. The default keeps every existing row
and every non-NFC caller correct. Signed anti-spoof payloads on tags and node-level NFC
tap attribution (in `captures`) remain open follow-ups.

---

## ADR-106: Location-aware earning — geofence authoring + device-location claim

**Status:** Accepted · `supabase/migrations/20260605130000_node_geo.sql`,
`app/(main)/admin/qr/actions.ts`, `app/(main)/admin/qr/qr-studio.tsx` (NodeForm),
`app/(main)/n/[nodeId]/{actions,claim-button}.tsx`. Surfaces the existing `nodes`
proximity engine (ADR-088 capture pipeline).

**Context.** `nodes` already had `location` (PostGIS geography) + `proximity_m`, and
`verifyCapture` already enforced proximity via the `node_within_range` RPC — but
nothing **authored** a geofence (the Studio form omitted location) and the `/n` claim
flow never **forwarded** the device's location, so the path was dead. A code couldn't
require "you must actually be here to earn."

**Decision.** Close both ends, no schema change:
- **Author.** A "Location-aware" toggle on the check-in NodeForm sets lat/lng + radius
  (with a "use my current location" helper). PostgREST can't build a geography from
  lat/lng, so writes go through a new SECURITY DEFINER `set_node_geo(id, lng, lat, m)`
  RPC; the editor reads coords back via `nodes_geo()` (the geography column can't be
  selected as lat/lng otherwise). Null lat/lng clears the fence.
- **Claim.** `ClaimButton` requests `navigator.geolocation` (best-effort: null on
  denial/timeout) and passes it to `claimNode` → `captureNode({ location })`. A
  geofenced code with no location returns `location_required`; out of range →
  `too_far` (both already surfaced in the button). Non-geofenced codes ignore it.

**Alternatives.** Trust an IP-geo lookup (rejected — city-level, trivially wrong/spoofed
for a "be here" gate); store lat/lng as plain numeric columns (rejected — loses PostGIS
distance + the existing `node_within_range` RPC). Radius clamped 5–5000 m.

**Consequences.** Operators can make a check-in earn only on-site (event door, plaque,
shopfront). Verification stays server-authoritative. Device location is used only at
claim time, never stored. Ghost (invisible GPS) nodes + signed payloads remain the next
steps on this engine.

---

## ADR-107: UTM / source passthrough — per-code source tag + acquisition persisted at signup

**Status:** Accepted · `supabase/migrations/20260605140000_qr_source_passthrough.sql`,
`lib/attribution/acquisition.ts`, `app/q/[slug]/route.ts`, `app/onboarding/actions.ts`,
`app/(main)/admin/qr/{link-actions,dynamic-links}.tsx`. Extends first-touch attribution (ADR-095).

**Context.** First-touch capture (ADR-095) already wrote UTM/referrer/landing into the
`fq_attr` cookie at the edge — but (a) a QR/NFC scan carried no per-code identity, so two
posters of the same campaign were indistinguishable, and (b) the cookie was never
**persisted**, so once it expired the acquisition was lost and un-queryable. The ask:
"a signup traces back to the specific poster."

**Decision.** Two additive columns, no new entity:
- **`qr_codes.source_tag`** — an operator label per code (e.g. `downtown-poster-a`), set
  in the dynamic-link form. On an **anonymous** scan the `/q` resolver stamps it into the
  first-touch cookie (`utm.campaign = source_tag`, `code = slug`) — but only when no
  prior `fq_attr` exists, preserving ADR-095's *first-touch-wins* rule.
- **`profiles.acquisition` (jsonb)** — at onboarding, `persistAcquisition` decodes
  `fq_attr` + the `fq_src` channel hint and snapshots them onto the profile **once**
  (skips if already set). Best-effort, never blocks signup.

**Alternatives.** A dedicated `acquisitions` table (rejected — one immutable snapshot per
profile is a column, not a table); stamping every scan regardless of prior touch (rejected
— breaks first-touch immutability, last-poster would clobber the real entry point).

**Consequences.** Acquisition is now permanently traceable to a campaign / poster / code,
queryable off `profiles.acquisition` long after the cookie expires. Reporting UI over the
snapshot (a per-source signup leaderboard) is the natural follow-up. Regenerate DB types
to formalize the two new columns later.

---

## ADR-108: Google Wallet pass for member codes — env-gated, dependency-free JWT

**Status:** Accepted · `lib/wallet/google.ts`, `app/api/wallet/google/route.ts`,
`app/(main)/codes/{page,member-codes}.tsx`. Apple Wallet deferred.

**Context.** Issue #221 asks for an Apple/Google Wallet pass for a member's profile code.
Apple Wallet requires a signed `.pkpass` (a PKCS#7 signature over a zip, needing the WWDR
+ Pass Type ID certificate chain); Google Wallet only needs an **RS256-signed JWT** linking
to `pay.google.com/gp/v/save/<jwt>`. We have neither set of credentials in this environment.

**Decision.** Ship **Google Wallet**, **config-gated**, and **dependency-free**:
- Sign the Save-to-Wallet JWT with **`node:crypto`** (`createSign('RSA-SHA256')`) — no new
  package. The pass is a Generic card whose barcode is the member's connect URL.
- **Env-gated** on `GOOGLE_WALLET_ISSUER_ID` + `GOOGLE_WALLET_SA_EMAIL` +
  `GOOGLE_WALLET_SA_PRIVATE_KEY`. `isGoogleWalletConfigured()` drives everything: when any
  is missing the `/api/wallet/google` route 404s and the "Add to Google Wallet" button is
  hidden. So it ships **dark** and is enabled by config alone — zero impact until then.
- The route gates on ownership (only the code's owner, or host+, can mint a pass that
  carries the owner's identity).
- **Apple Wallet deferred** — it needs the pkpass cert toolchain; documented as the follow-up.

**Alternatives.** Add `google-wallet`/`jsonwebtoken`/`passkit-generator` deps (rejected —
`node:crypto` covers RS256; fewer deps); pre-create the WalletClass via the API (rejected —
the class is embedded inline in the JWT, so no server-to-Google round trip at issue time).

**Consequences.** Members can add their profile code to Google Wallet **once credentials are
provisioned** — the code is complete but **unverified end-to-end without real Google
credentials**, which is the explicit trade-off of shipping it gated. Apple Wallet + a
scan-tracking "pass installed" signal remain open.

---

## ADR-109: Community Library — unify Practices, Programs, Journeys (create → approve → catalog → rank)

**Status:** Accepted (Phase 1) · `supabase/migrations/20260605120000_community_library.sql`, `lib/library.ts`, `app/(main)/library/**`, `lib/nav-areas.ts`. Builds on practices/journeys + ADR-104 (zaps).

**Context.** The three content types were disconnected: practices (a personal real-world
activity), programs (file-based operator playbooks), and journeys (ordered practice
bundles). The owner wanted them tied together — **anyone** can create any of them, a
leader **approves** it into a **community pool**, and a **best-of algorithm** surfaces
the strongest. Practices + Programs both earn **Zaps** (real-world).

**Decision (Phase 1).**
- **Programs become a DB type** (`programs` + `program_adoptions`), member-creatable;
  the 4 markdown playbooks stay as official guides. Adopting a program earns Zaps
  (`program_run` = 30) — real-world outreach.
- **One approval lifecycle.** Added `status`/`reviewed_by`/`reviewed_at` to practices,
  journeys, and programs. Personal creation stays private/usable; **submitting to the
  Library** sets `pending`; a **circle Host or any Guide+** approves (flips the item
  public so existing browse filters surface it) or rejects. Existing public rows are
  grandfathered `approved`.
- **One ratings signal** (`content_ratings`, a generic love over `content_type/id`).
- **Unified ranked catalog** at **`/library`** via the `community_library` RPC — a UNION
  of the three approved types scored by **3·adoptions + 2·completions + 4·ratings +
  recency + endorser-rank**, filterable by type/pillar. A Host/Guide+ **review queue**
  lives at `/library/review`.

**Alternatives.** A single polymorphic `content` table (rejected — practices/journeys
already have their own item/adoption tables; columns + a UNION RPC reuse them with far
less migration risk). Hierarchical per-author approval (deferred — host+ queue ships the
loop; refine later).

**Consequences.** A complete create→approve→catalog→rank loop ships for Programs;
practices + journeys participate in the catalog, ranking, ratings, and review now, with
a one-line `submitToLibrary` action ready to wire a "submit my private one" button onto
their detail pages (Phase 2). New tables/columns aren't in the generated DB types yet →
untyped-client casts. Ranking weights live in the RPC (tunable).

---

## ADR-110: Practice library expansion — balance the four Pillars; seed as system content

**Status:** Accepted · `supabase/migrations/20260606130000_practices_library_expansion.sql`. See [getting-started/practices.md](../content/help/getting-started/practices.md) (member-facing).

**Context.** The starter library shipped 5 core practices (`20240228000000_practices.sql`,
enriched in `20260605000000_practices_rich_content.sql`). But those 5 only covered two of
the four Pillars (Body ×2, Spirit ×3) and three of the six categories — **Mind and
Expression had no core practice**, and the **human-relating** category was empty. A member
landing on the library saw a lopsided picture of what a practice can be.

**Decision.** Add **16 system-owned, public, rich-content practices** (created_by null,
is_public true) so every Pillar and category is represented: Mind +7 (Deep work block, Read
ten pages, Digital sunset, Plan tomorrow tonight, Appreciate someone, Call a loved one,
Listen fully), Expression +4 (Make music, One photo a day, Voice journal, Dance one song),
Body +3 (Daily walk, Strength session, Time in nature), Spirit +2 (Phone-free meal, Evening
reflection). Each carries the full content shape (summary + "How to do it" / "Why it works"
body + cadence + per-log reward) and is linked to its Pillar (`domain_id`). Pillar is
assigned **by meaning**, not by category — category and Pillar need not align (cf. Breathwork,
a `holistic-health` practice on the **Spirit** Pillar).

**Consequences.** Library grows 5 → 21 core practices; Pillar filters and the Expression /
Mind / human-relating surfaces are no longer empty. **No schema or app-logic change** — the
migration is pure data, idempotent (`INSERT … SELECT` guarded by `NOT EXISTS` on title, the
safe re-run guard since `practices.title` has no unique constraint). Rewards stay
admin-governed via the per-practice `reward_zaps` override (ADR-104); heavier asks (deep
work, strength, real outreach) get a touch more, like surf/cold already do.

**Future (not in this ADR).** A larger, creator-driven library — deep **sub-categories +
tags** (applied by members and auto-suggested by Vera), **popularity-based ranking** so used
practices rise, and **creator usage rewards** — is a separate design tracked in
[ROADMAP.md](ROADMAP.md); this ADR only covers the content seed that balances the Pillars.

---

## ADR-111: Practice library — taxonomy + ranking foundation (creator-library, Phase 1)

**Status:** Accepted · `supabase/migrations/20260606140000_practice_taxonomy_foundation.sql`, `lib/practices.ts`, `app/(main)/practices/*`, `components/practice/practice-editor.tsx`.

**Context.** The library is moving from a small curated seed toward a **large, open,
creator-driven** surface: practices organized deeply under the 4 Pillars, tagged by
people *and* (later) by Vera, with popular practices rising to the top and — eventually —
creators rewarded for usage. The model had only the 4 flat Pillars (`domains`) and a loose
`category` text tag; no sub-tier, no practice tagging, no popularity signal.

**Decision (Phase 1 — structure + ranking, no economy change).** Build the foundation in
four layers under each Pillar, reusing existing patterns rather than inventing:
- **Sub-categories** — `practice_subcategories` (a curated, extensible tier scoped to a
  Pillar; e.g. Body → Cardio/Strength/Mobility/…), with `practices.subcategory_id`. Seeded
  ~5 per Pillar; the existing 21 practices backfilled.
- **Tags (hybrid)** — `practice_tag_defs` (canonical curated vocabulary + member-proposed
  folksonomy) joined to practices via `practice_tags`, each attachment carrying a `source`
  (`author` | `member` | `vera`). Mirrors the member-tags pattern (ADR-068). Authors set
  their tags in the editor; new labels auto-create non-canonical defs.
- **Embeddings** — `practices.embedding vector(384)` + HNSW + `match_practices()`, mirroring
  `room_messages` (ADR-088). Column/infra now; **populated by Vera in Phase 2** (no-op until).
- **Popularity** — a server-only `practices_ranked` view (distinct adopters + 30-day logs →
  score, `security_invoker`, granted to `service_role` only). `listPublicPractices(sort)`
  reads it; library gains **Trending** (default) / **All-time** / **New** sorts plus a
  Pillar → sub-category filter, all URL-driven (shareable, no client JS).

Authz unchanged: public read on library taxonomy, writes via the service-role admin client
behind app-code authz (owner for author tags/sub-category).

**Relationship to ADR-109 (Community Library).** Complementary, not a replacement. ADR-109
gives the *cross-type* catalog at `/library` (practices + programs + journeys), the approval
lifecycle (`status`), ratings, and a UNION ranking RPC. This ADR adds what that catalog does
not have — **sub-categories, tags, and embeddings** — and a **practices-specific** browse on
`/practices`. The two ranking signals are intentionally different: the `community_library`
RPC scores cross-type *adopt/complete/rating + recency*, while `practices_ranked` scores
*repeated doing* (30-day logs), which is the truer signal for a daily practice. They coexist
(`/practices` vs `/library`); folding sub-categories/tags into the catalog filters, and
unifying the two scores, is a deliberate follow-up — not done here.

**Consequences.** Practices are now organized two tiers deep and surfaced by real usage,
end-to-end with no economy change. The `source` column and the embedding/match function are
the seams Phase 2 (Vera auto-suggests Pillar/sub-category/tags on create, propose-and-confirm
per ADR-028; semantic "similar"/dedupe) and Phase 3 (**creator rewards = gems per *new
distinct adopter* of a public practice — daily-capped, no self-reward, admin-tunable**,
which needs its own ADR + economy guardrails per ADR-104) slot into without a migration.

---

## ADR-112: Scarcity / capacity codes — a total-claim cap on check-in nodes

**Status:** Accepted · `supabase/migrations/20260605150000_node_max_claims.sql`,
`lib/engagement/verify.ts`, `app/(main)/admin/qr/{actions,qr-studio}.tsx`. Extends the capture pipeline.

**Context.** `capture_rule` covered once-per-user / once-global / repeatable, but not
"first **N** win" — the natural mechanic for a launch drop or an event prize where only
the first N claimers earn.

**Decision.** Add a nullable `nodes.max_claims`. When set, `verifyCapture` counts verified
captures and rejects with a new `capacity_reached` reason once the cap is hit (surfaced on
the claim button). Authored on the NodeForm ("Limit total claims"); the card shows an
`N/max claimed` badge. Null = unlimited (today's behavior), so every existing code is
unaffected.

**Alternatives.** A separate counter table (rejected — `count(captures)` is authoritative
and already indexed); a per-day cap (deferred — a different, future rule).

**Consequences.** Operators can run scarce, first-come drops. The cap is checked on the
verify path so it's race-safe enough for prizes (a tiny over-claim window under extreme
concurrency is acceptable for this use; a hard guarantee would need a transaction/lock).

---

## ADR-113: Scannability guardrails — advisory design warnings in the editor

**Status:** Accepted · `lib/qr/scannability.ts` (+ test), `app/(main)/admin/qr/style-editor.tsx`.

**Context.** The beautiful-code editor (ADR-090) lets operators pick colors, gradients,
and a logo — which means they can also design a code that **won't scan** (low contrast,
light-on-dark, no quiet zone) and only discover it after printing a batch.

**Decision.** A pure, isomorphic `scannabilityWarnings(style)` flags the real-world
killers — WCAG contrast < 4 (using the worst gradient stop), inverted light-on-dark,
quiet-zone margin < 2, and a logo atop weak contrast. Surfaced as an **advisory** amber
banner in the editor; it never blocks saving.

**Alternatives.** Hard-block bad designs (rejected — too paternalistic; edge cases scan
fine); actually decode a rendered preview (rejected — heavy, and the heuristics catch the
common failures cheaply).

**Consequences.** Fewer dead printed codes. Pure + unit-tested; reusable anywhere a style
is edited.

---

## ADR-114: Acquisition analytics — roll up first-touch snapshots on the stats page

**Status:** Accepted · `lib/qr/acquisition.ts` (+ test), `app/(main)/admin/qr/stats/page.tsx`.
Cashes in the data captured by ADR-105 (medium) + ADR-107 (`source_tag` / `profiles.acquisition`).

**Context.** We started persisting `qr_scans.medium` and `profiles.acquisition`, but nothing
turned them into a decision — there was no screen answering "which poster/channel actually
brings signups?"

**Decision.** A pure `summarizeAcquisition(rows)` tallies attributed signups by channel, by
source/campaign (campaign preferred over source), and by code slug. The stats page adds an
**Acquisition** section: channel + source rankings, a QR-vs-NFC split, and a per-code
**scan → signup conversion** table (signups ÷ scans by slug).

**Alternatives.** A materialized view / rollup table (rejected — volumes are small; an
in-memory tally over `acquisition is not null` is fine and stays consistent).

**Consequences.** Operators can see which physical placements convert, not just which get
scanned. Time-windowing + CSV export are the obvious next iterations.

---

## ADR-115: Signed anti-spoof payloads — end-to-end through the /n claim

**Status:** Accepted · `lib/qr/links.ts` (`nodeUrl` secret), `lib/engagement/verify.ts` (already checked),
`app/(main)/admin/qr/actions.ts`, `app/(main)/n/[nodeId]/{page,claim-button,actions}.tsx`,
`app/api/qr/route.ts`, `app/print/qr/page.tsx`. Completes ADR-088's `secret` field.

**Context.** `nodes.secret` and the `verifyCapture` signature check existed, but nothing
**authored** a secret or **carried** it — so a `/n/<id>` URL guessed/forged from just a
node id (or a leaked id) could claim, which undermines location-aware earning (ADR-106).

**Decision.** A "Require a signed code" toggle mints a random `secret` (`node:crypto`
`randomBytes`) on the node; `nodeUrl(id, secret)` then encodes `/n/<id>?s=<secret>` into the
QR image, print sheet, NFC tag, and copy/open links. The `/n` page reads `?s=` and forwards
it through `claimNode → captureNode`; `verifyCapture` rejects a mismatch with `bad_signature`.
The secret is minted once and kept (re-minting would invalidate printed codes); clearing the
toggle nulls it.

**Alternatives.** Rotating HMAC-over-time (rejected for static print/NFC — the physical tag
can't rotate; a static per-node secret is the right tool and already makes the URL
unguessable). True replay defense needs dynamic NFC and is out of scope.

**Consequences.** A forged or guessed node URL can't claim; combined with proximity
(ADR-106) and capture rules, location/earn codes are meaningfully harder to farm. A leaked
*image* of the real code still works — that's the inherent limit of static codes, mitigated
by once-per-user + geofence + caps.

---

## ADR-116: Claimable practice templates — a Vera-guided "make it yours" wizard

**Status:** Accepted · `supabase/migrations/20260606150000_practice_templates.sql`, `lib/practices.ts` (`claimPractice`, `getRankedPractice`), `lib/ai/practice-wizard.ts`, `app/(main)/practices/[id]/page.tsx`, `components/practice/claim-practice.tsx`, `app/(main)/practices/actions.ts`, `lib/zaps.ts`. Applies the demo-circle claim (ADR-091) to practices; builds on the practice taxonomy (ADR-111) + Community Library (ADR-109) + AI core (ADR-041).

**Context.** The library was a flat list of system practices with no member-facing
page — the rich write-ups + steps only showed in the owner-only editor, and the only
way to "make one yours" was a silent `forkPractice` ("Customize"). The owner's vision:
people get *excited* to claim a practice and earn points — gamified healthy living —
and Vera helps them shape it. We already had every primitive: a claim wizard pattern
(`claimCircle`), a Claude-backed AI layer with cost guardrails (`lib/ai`), and fork +
ranking + tags on practices.

**Decision.**
- **`is_template` flag.** Every system-owned, non-demo, public practice is a *template*.
  The 5 core + 16 expansion + 2 new starters (Hydrate first, Single-task hour) are
  templates; member-created and demo practices are not. Every practice also gets a
  **topical header image** (keyword-based placeholder, plain `<img>` — no next/image
  host coupling; swap for curated/licensed art before GA).
- **A detail page** (`/practices/[id]`, Detail template) is the home for the picture,
  the full markdown write-up (steps + why), a **stat band** (reward · cadence · who's
  practising · times logged), tags, and the claim/adopt/log/edit CTAs. Cards link to it.
- **The claim wizard** (mirrors `ClaimCircle`): goal + realistic schedule → **Vera
  personalizes** the title/cadence/steps to the member (Haiku, forced-tool structured
  output, propose-and-confirm per ADR-028; degrades to the template's own content when
  AI is off — claiming never depends on the model) → review/edit → `claimPractice`
  forks a private, owned, adopted copy with the personalized content.
- **Gamification.** First claim awards `practice_claim` zaps (member-keyed idempotency
  → fires once, no farming); the ongoing loop is logging (existing practice reward +
  streak). New action lives in `ZAP_AMOUNTS` fallback only (no `zap_config` row needed).

**Alternatives.** "Generate from scratch" Vera (deferred — personalizing a template is
cheaper, more grounded, and harder to get wrong) and a bespoke claim mechanic (rejected —
`forkPractice` + `updatePractice` + `adoptPractice` compose the whole flow).

**Consequences.** A template becomes something you claim, personalize, and start earning
on in one wizard. Vera is now wired into practices via the embedding/assist seams ADR-111
anticipated. Pure-additive: one nullable flag, no economy config change, no schema break.
Image URLs are topical placeholders, not curated art. The claim produces a normal private
practice, so the existing edit + Community-Library submit (ADR-109) paths "share or post
it to the repository" with no extra work.

---

## ADR-117: Profile editor keeps the community rail; guided spotlight onboarding tour

**Status:** Accepted · `lib/layout/page-chrome.ts`, `app/(main)/settings/profile/page.tsx`,
`lib/onboarding/spotlight.ts`, `components/onboarding/spotlight-tour.tsx`,
`components/feed/feed-onboarding-guide.tsx`, `app/onboarding/tour-actions.ts`.

**Context.** Two onboarding gaps. (1) `/settings/profile` is the one "me" surface that read as
a stranded, rail-less Focus form — there was no standard sidebar and no way to jump from editing
to *viewing* your public profile. (2) The in-site activation system had a persistent checklist
box (ADR-047) and passive one-at-a-time coachmarks, but no **guided** walkthrough — new members
had to discover each surface on their own.

**Decision.** (1) `railFor` special-cases `/settings/profile` back to the `'global'` community
rail (overriding the `/settings` Focus prefix), and the editor header gains a "View profile" link
to `/people/<handle>`. Editing your identity is a standings-adjacent "me" surface, so the rail
belongs beside it. (2) A scripted **spotlight tour**: the feed onboarding box launches a guided,
pausable overlay that dims the page and lights one real surface at a time (feed → composer →
circles → practices → events → profile) via `data-tour-anchor`, narrated in Vera's voice.
Progress persists to `profiles.meta.tour.spotlight` (+ localStorage) so it resumes where paused;
it degrades to a centered card when an anchor isn't on screen (small-viewport drawer nav). The box
still only graduates when the four activation steps are done.

**Alternatives.** A purpose-built profile-preview rail (rejected: the standard community rail is
what "standard sidebar" means and is less work to keep consistent). Live-AI Vera narration per stop
(deferred: scripted copy is deterministic, testable, and works with AI off — Phase 2 can upgrade).

**Consequences.** One route deviates from the "settings = Focus" convention by design; documented
here so it isn't "fixed" back. The tour reuses the existing anchor + tour-state plumbing, so adding
a stop is a one-line data edit in `lib/onboarding/spotlight.ts`.

---

## ADR-118: Practices library as a scalable dashboard — server-side search/sort/paginate + admin curation

**Status:** Accepted · `app/(main)/practices/page.tsx`, `lib/practices.ts` (`searchLibraryPractices`, `countPublicPractices`, `setPracticeFlags`, `deletePractice`), `app/(main)/practices/actions.ts`, `components/practice/practice-admin-menu.tsx`. Builds on the taxonomy/ranking (ADR-111) and templates (ADR-116); reuses the Circles/IndexTemplate browse pattern.

**Context.** The library rendered as one long vertical list: it loaded **every** public practice via `listPublicPractices`, enriched tags/sub-categories for all of them, and filtered in memory. With a community library heading for thousands of entries that does not scale (payload, memory, no paging), and it lacked search and any admin curation.

**Decision.**
- **Push the work to the database.** New `searchLibraryPractices()` queries the `practices_ranked` view with `count: 'exact'` + `.range()` so a page fetches and enriches **only one screen** (24) of rows. It supports text search (`ilike` over title/summary/description), Pillar / sub-category / tag filters, sort (Trending / All-time / New / A–Z), demo hiding, and an admin "include hidden" flag. `countPublicPractices()` is a head-count for the stat band.
- **Dashboard layout** (mirrors the Circles page): `IndexTemplate` with a stat band, a toolbar (search + sort + admin toggle), faceted filter rows, and a responsive **EntityCard grid** (image, badges, context, stats) linking to the detail page, with prev/next **pagination**. The personal column (your activity + your practices) stays a readable list; the library is the full-width grid. All state is URL-driven (shareable, no client JS) — page resets on any filter change.
- **Admin curation**, gated on `admin.access` (host+, the app's existing admin gate) and re-checked in every action: a per-card menu (`PracticeAdminMenu`) to edit-any, toggle template, hide/show (`is_public`), and delete; plus a "Show hidden" toggle. No new capability or column — operates on existing `is_template`/`is_public`.

**Alternatives.** Keep client-side filtering (rejected — does not scale); cursor pagination (deferred — offset `.range()` is fine at this size and gives a total + page numbers); a dedicated capability like `practice.curate` (deferred — `admin.access` already models "admin").

**Consequences.** The library scales to thousands with constant per-request cost, gains search + advanced sort + admin curation, and is code-only (no migration). Offset pagination can drift under heavy churn — acceptable now; revisit with keyset if needed. Admins can edit/hide/delete any practice (editor + `updatePractice`/`setPracticeTags` actions now allow `admin.access`, not just the owner).

---

## ADR-119: Platform staff manage any circle; "Edit circle" button; edit demo circles without claiming

**Status:** Accepted · `lib/core/capabilities.ts`, `app/(main)/circles/[slug]/page.tsx`,
`app/(main)/admin/circles/{page.tsx,circles-client.tsx}`. Builds on the capability resolver
(CAPABILITIES-AND-MOBILE.md) and the demo-claim flow (ADR-091). Parallels ADR-118's "admins
curate any practice."

**Context.** Circle management (`circle.editSettings` and friends) was granted to the host, the
guide/mentor who leads the parent hub/nexus, and **janitor** — but not **admin**, even though
admin sits one rung below janitor and shares its operational keys. So admins couldn't edit
arbitrary circles. Separately, a demo circle only offered the **claim** flow (which flips
`is_demo=false`, installs the claimer as host, and awards zaps) — there was no way for staff to
*edit* a demo circle in place, and the circle page's old `?edit=true` "Edit info" link was inert
(nothing read the param).

**Decision.**
- **Staff = admin OR janitor lead any circle.** The resolver's circle `leads` predicate uses
  `isStaff = atLeastRole(role, 'admin')` instead of `isJanitor`, so admin gains the same
  `editSettings`/`moderate`/`assignTask`/`broadcast` grant janitor already had. Pure-policy, one
  predicate; the server re-checks it before mutating (capabilities are law, not just UX).
- **An explicit "Edit circle" button** on the circle page header, shown to staff, deep-links to
  the full admin editor focused on that circle (`/admin/circles?edit=<id>`, which now auto-opens
  the row). It renders on demo circles too.
- **Edit demo without claiming.** Editing via the admin `updateCircle` patches name/about/type/
  cap/hub/status/host and **leaves `is_demo` untouched**, so staff can fix up a demo circle in
  place; claiming stays the separate, intentional "make it real" path.

**Alternatives.** Build a bespoke inline edit form on the circle page (rejected — the admin editor
already exists and is the source of truth; deep-linking reuses it). Extend admin to hub/nexus
management too (deferred — out of scope; this is the circle request, mirroring ADR-118's
practice-only scope).

**Consequences.** Admins join janitors as full circle operators; the dead "Edit info" link is
superseded by a working staff path. A demo circle can be tidied without un-demoing it. The admin
`updateCircle` still defaults an empty `host_id` to the caller, so reassigning the host on a
host-less circle is possible — noted, not changed here (the editor pre-fills the existing host).

---

## ADR-120: Mobile navigation is a bottom tab bar (not a header hamburger); shared header balances on mobile

**Status:** Accepted · `components/layout/app-shell.tsx` (`MobileTabBar`, `MobileLeftDrawer`),
`components/templates/page-heading.tsx`, `components/layout/brand-mark.tsx`. Builds on the
five-template / one-header framework (PAGE-FRAMEWORK §8) and the single-rail nav model
(`lib/nav-areas.ts`).

**Context.** On mobile the only way to reach a section was the top-left **hamburger → full-screen
overlay drawer**; the bottom bar was spent on profile + rewards (not navigation). Switching
sections therefore cost two taps and a reach to the top corner. Separately the shared `PageHeading`
laid the title and its header action on one `items-end justify-between` row at a fixed `text-2xl`,
so on a narrow screen a long title was crushed against the action button, and the header chrome
(wordmark, right-cluster icons) sat flush to the screen edges — content read as "falling off."

**Decision.**
- **Primary nav → a bottom tab bar.** `MobileTabBar` pins the four core community destinations
  (Feed · Circles · Channels · Events) in the thumb zone, plus a **Menu** tab that opens the drawer
  for the long tail. The most native mobile pattern, and it **keeps full content width** — nothing
  is permanently carved off the side of a narrow screen (the explicit reason we rejected a
  persistent left mini-rail). Icons come from `AREA_ICONS` so the tab bar stays in lockstep with
  the desktop rail and the drawer.
- **The header hamburger is removed;** the bottom Menu tab owns drawer-open. This declutters the
  top bar and lets the wordmark anchor the top-left.
- **The drawer carries identity + rewards** (the avatar/role card → profile, the bolts/gems pill →
  Dashboard) that used to live in the bottom bar, above the full nav list.
- **`PageHeading` balances on mobile:** the action **stacks below** the title block under `sm`
  (`flex-col … sm:flex-row sm:items-end sm:justify-between`), the title is responsive
  (`text-xl sm:text-2xl`) and `text-balance`, matching the Detail context band. Edge breathing room
  added to the wordmark (`pl-3.5`) and the header right-cluster (`px-2.5`).

**Alternatives.** A persistent slim left icon-rail that folds out on tap (what was first floated —
rejected: it permanently eats ~48px of an already-narrow viewport, working against the "feels
cramped / falling off the edge" complaint). Keep the hamburger and only polish the drawer (rejected
— leaves section-switching a two-tap top-corner reach).

**Consequences.** Section-switching is one thumb tap; the top bar is lighter; titles never crush on
mobile. Settings/Billing/Help stay reachable via the top-right account menu (unchanged, still shown
on mobile). `hideAppNav` shells (e.g. Studio) drop the four destination tabs and keep only Menu.
Desktop is unchanged — the left rail and `ProfileCard` still own navigation and identity there.

---

## ADR-121: Opt-in slide-in side rail (mobile) + Vera drafts the new circle

**Status:** Accepted · `components/layout/app-shell.tsx` (`MobileSideRail`, the drawer toggle),
`components/compose/new-circle-compose.tsx`, `app/(main)/circles/actions.ts` (`suggestCircle`),
`lib/ai/circle-wizard.ts`. Builds on the mobile bottom-tab nav (ADR-120) and the
forced-tool AI assist pattern (`lib/ai/practice-wizard.ts`, ADR-116).

**Context.** Two follow-ups from on-device review. (1) The feed felt bare down its sides on a
phone, and quick-nav meant reaching the bottom tab bar each time. (2) The "Start a circle" modal
asked for a name + about cold — a blank-page moment right where Vera (Frequency's guide) should be
helping.

**Decision.**
- **An opt-in slide-in side rail.** Superseded by ADR-122's unified model — the left nav rail and
  right stats rail now share ONE behavior (`useRailReveal`): **hidden at the top of scroll**, a
  **super-minimal tab** slides in once scrolled into the feed, **tap opens the full panel**, and
  **scrolling snaps it back to the tab**. Fixed overlays (not body columns), so they never
  permanently inset the feed. Per-device pref `freq-rail-nav` (default on), hydrated after mount.
  Mobile only; suppressed under `hideAppNav`.
- **Vera drafts the circle.** A "Suggest" affordance appears in the modal once the practice is known
  (the channel we're in, or the picked Interest). `suggestCircle()` calls `suggestCircleDraft()`
  (Haiku, forced `suggest_circle` tool, usage-ledgered) and **falls back to a deterministic draft**
  when AI is off/over budget — so the affordance always returns an editable name + about. It only
  **fills the fields**; creating the circle is still the host's explicit submit (propose, don't
  commit). "Lightweight suggest," not the full conversational concierge — chosen deliberately for
  this pass.

**Alternatives.** A persistent (always-visible) left rail (rejected — width cost, ADR-120). Embedding
Vera's live concierge in the create flow (deferred — heavier; the one-shot suggester is the
shippable first step). A purely deterministic suggester with no AI (rejected — Vera should feel real
when the kernel is on; the deterministic path is the fallback, not the default).

**Consequences.** The side rail is always-present-but-quiet (an icon strip), discoverable (the
chevron expands it to labels), and reverts to icons on scroll so the feed isn't held narrow while
reading; the master toggle turns it off entirely. Users who dislike it turn it off once. The circle
modal has a real assist with a guaranteed-useful fallback and no new
commit path (the server still authorizes `createCircle`). New AI feature key `circle-create` flows
through the existing usage ledger + daily-cap machinery.

---

## ADR-122: Mobile right-edge stats menu (the gamification counterpart to the left rail)

**Status:** Superseded by ADR-135 (the scroll-reveal / opt-in-toggle interaction). The right-edge
stats menu and its reuse of `GameStatsPanel` / `loadGameStats` stand; only the *interaction* (the
scroll-revealed light tab + per-device drawer on/off) changed — both edges now carry an
always-visible tab that opens on click, with a shared Micro/Full size. · `components/layout/app-shell.tsx` (`MobileStatsMenu`),
`components/sidebar/game-stats-dock.tsx` (`GameStatsPanel`), `components/sidebar/right-sidebar.tsx`
(`loadGameStats`, `MobileGameStats`), `app/(main)/layout.tsx`. Mirror of the left rail (ADR-121);
reuses the desktop progress-cockpit (`GameStatsDock`).

**Context.** On desktop the member's stats / streaks / gamification live in the bottom dock of the
right rail (`GameStatsDock`). On mobile the right rail isn't rendered, so that cockpit was
unreachable. We wanted a **matching menu on the right** of the left nav rail to host it.

**Decision.** Both edge rails (left nav · right stats) share **one interaction** (`useRailReveal`,
driven by the feed scroll container):
- **Hidden at the top of scroll.** Nothing shows until the member scrolls into the feed — then a
  **tall (`h-[33vh]`), very-light (`opacity-50`) tab** (`EdgeTab`) floats onto each edge. It's an
  **overlay** that does **not** push the content — it sits over the margin.
- **Tap the tab → the side menu opens** (left = nav, right = stats panel).
- **One-use menu:** selecting a link, clicking anywhere on the panel, or tapping the **light
  backdrop** (`bg-black/10`) closes it; scrolling also closes it.
- On/off is a **per-device setting in the Menu drawer** (two `RailToggle`s, prefs `freq-rail-nav` /
  `freq-stats-rail`, default on). *(Open question: the ask was to move this control into "admin"; for
  now it stays the per-device drawer toggle.)*
- **Reuse, don't re-author.** The dock's panel body is factored into a shared **`GameStatsPanel`**
  (today's move · 7-day streak · rank progress · journey arc · the Vault · full-dashboard link), and
  the data assembly into **`loadGameStats(profileId)`** — both consumed by the desktop dock *and* the
  mobile menu. The layout streams `MobileGameStats` into the shell behind `<Suspense>` (the donut
  pattern: client menu shell, server-rendered stats child), so it **never blocks the shell** and costs
  the same single query the desktop dock already pays.

**Alternatives.** A push-content right panel like the left rail's old expand (rejected — the cockpit
needs ~`w-72`; pushing would crush the feed). Always-visible paired columns (rejected — they inset the
feed on both edges; the hidden-at-top / minimal-tab model keeps the feed full-width while reading).
Re-fetching stats client-side on open (rejected — the layout already streams it; reuse
`loadGameStats`). Duplicating the stats markup for mobile (rejected — `GameStatsPanel` is the source).

**Consequences.** While reading (scrolled or at top) the feed is unobstructed; the rails bracket it
only as the member scrolls, and each opens its full panel in one tap. Either rail can be switched off
from its tick and back on from the drawer. The desktop dock is unchanged (same `GameStatsPanel`); both
rails are `md:hidden` so desktop is untouched.

---

## ADR-123: Live search overlay (type-ahead) replaces the submit-to-reload search

**Status:** Accepted · `components/search/search-overlay.tsx`, `app/api/search/route.ts`,
`components/layout/app-shell.tsx` (header triggers + ⌘K). The `/search` page stays as the
"see all" destination.

**Context.** Search meant navigating to `/search` and submitting a form that reloaded the page per
query — not "active." We wanted results as you type, reachable from anywhere.

**Decision.**
- **A full-screen overlay** opened from the header search pill/icon and **⌘K**. Typing
  (debounced 200ms) hits a new **`/api/search`** route that returns a small slice of
  **people / posts / events** as JSON; results render live, grouped, with a **"See all results"**
  link to the existing `/search?q=` page. Mobile-first (fills the screen on a phone, centers on
  desktop); Esc / backdrop / × close it.
- **Mounted only while open** (`{searchOpen && <SearchOverlay/>}`), so its state resets each open —
  no reset-in-effect.
- **`/api/search`** mirrors the `/search` page queries (admin client, `ilike`), auth-gated, caps at
  6 per type, and strips `(),` from the term so a stray char can't break the PostgREST `or()` filter.

**Alternatives.** Live-search the `/search` page in place (rejected — an overlay is reachable from
every page, not just after navigating). A new typed search RPC (deferred — reuse the page's existing
query shape now; revisit if search needs ranking/perf work).

**Consequences.** Search is instant and global. `/search` remains the deep/linkable results view (and
the overlay's "see all" target), so nothing is lost. New `/api/search` is the first read endpoint for
in-app search; if abused it can move behind the AI/RPC boundary later.

---

## ADR-124: Reusable in-page Table of Contents (`PageContents`) — a section navigator for long pages

**Status:** Accepted · `components/templates/page-contents.tsx`, applied on
`channels`, `practices`, `events` (scroll-spy) and `circles` (filter/drill-down).
The "smart menu that sorts a page's sections."

**Update — two modes.** `PageContents` now takes EITHER `sections` (scroll-spy: jump to on-page
sections, track the active one) OR `links` (filter/drill-down: chips are links that set a URL param,
so tapping one shows just that category's items — the "pages within"). Same sticky chip chrome both
ways. **Circles** uses the filter mode — `?channel=<slug>` chips (All · Mind · Body · Spirit ·
Expression, with circle counts) drill the grid into one Channel; **Practices/Events** use scroll-spy.
This realizes the "table of contents with pages within" across both sectioned and grid pages.

**Context.** Long index pages (Channels has four Channels, each with many Interests) had no quick way
to jump between sections on mobile — you scrolled past everything. The ask: a reusable "table of
contents" that sorts a page's sections (Channels, Circles, practices…) and can apply everywhere.

**Decision.**
- **`PageContents`** — a sticky, horizontally-scrollable bar of the page's sections that **jumps to
  them and tracks the active one on scroll** (IntersectionObserver scroll-spy, rooted on the
  `[data-feed-scroll]` container). Purely additive: the page renders normal sections with `id`s, and
  passes `{ id, label, count }[]`; the component is the navigation layer over them. Sticks under the
  app header, full-bleed within the page padding, mobile-first (the *bar* scrolls, not the page).
- **Proven on Channels first** (the four Channels as the TOC), with `scroll-mt-20` on each section so
  the sticky bar never covers a section heading on jump. Reusable as-is for any sectioned page.

**Alternatives.** Per-page bespoke jump-lists (rejected — that's what existed, desktop-only, in the
Channels aside; this generalizes it). Filtered sub-routes per section / "pages within" as real routes
(deferred — anchor + scroll-spy is the lighter first step; can grow into routed drill-down if needed).
A heavier filter/sort toolbar (deferred — start with navigation; sorting can layer on).

**Consequences.** Channels is navigable in a tap on mobile; the same one-liner adds a TOC to any long
page. This is the first piece of the broader "section navigator" the product wants applied site-wide;
generalizing it (Circles, practices) is now a per-page `sections` array, not new UI.

---

## ADR-125: Personas + lead flows — the self-identified intake rework

**Status:** Accepted · `lib/onboarding/personas.ts`, `lib/onboarding/lead-flows.ts`,
`app/(marketing)/start/**`, `app/onboarding/beta/{induction,page,actions}.tsx`,
`lib/traits/registry.ts` (5 `persona_*` tags). Builds on the beta induction (ADR-068),
beta sequences, the tag registry/MDP (ADR-068), and acquisition attribution (ADR-095).
Full spec: [LEAD-FLOWS.md](LEAD-FLOWS.md).

**Context.** Intake had one mechanism doing two jobs: a beta *sequence*
(`early-adopter` / `personal` / `founding-partner`) was both the marketing splash
*and* the induction's copy skin, and **which one you got was decided by which link you
clicked** — we never asked the visitor who they were. That conflated "founding partner"
businesses, investors, and builders into one lump, and gave us no structured signal to
route people down different marketing tracks (practitioner tools vs. a partner loyalty
program vs. the regular visitor pitch).

**Decision.** Split intake into **two layers with persona as the spine.**
- **Persona** (`lib/onboarding/personas.ts`) — five self-identified types: **Visitor**
  (default), **Practitioner**, **Partner business**, **Community builder/Volunteer**,
  **Investor/Lab champion**. Each carries its picker pitch, a persona-true **value reel**
  (reuses the three product renders with new captions — no new components), a **marketing
  track** (what we show + a learn-more link), and a **registered marketing tag**.
- **Lead flow** (`lib/onboarding/lead-flows.ts`, surfaced at `/start/<flow>`) — an
  **assignable top-of-funnel** you drop behind any entry point (QR, IG bio, partner
  button). It sets the frame, asks the persona, records the lead (`captureLead` →
  `contacts.meta.persona`), and routes into the induction carrying `?persona=`. Generalizes
  sequences: the visitor *tells* us instead of us guessing from the link.
- **Persona-aware induction.** The fork is captured in the lead flow **and re-confirmed in
  the induction's Welcome beat** (chosen "both" — strongest signal, no dead ends). Folded
  into the existing beat, so **beat count stays 6** (no renumber). The persona branches the
  tour reel and is persisted at completion: top-level **`profiles.meta.persona`** + a
  `persona_*` tag (mirrors the cohort-tag + `fq_beta_seq` cookie pattern via a new
  `fq_persona` cookie that survives the deferred sign-in round-trip).

**Alternatives.** A dedicated persona *beat* (rejected — renumbering every `setBeat()` in a
careful flow is error-prone for no UX gain over folding it into Welcome). A DB-backed,
operator-assignable lead-flow editor now (deferred — chose **code-first**, type-safe and
reviewed; a `vera_config`-style DB override layer can come later without changing callers).
A promoted `persona` **column** on `profiles`/`contacts` (deferred — JSONB `meta` + a
governed tag match the existing `meta.beta` pattern, zero migration, and the tag already
gives queryable segmentation; promote to a column if query needs grow). Sending a
persona-specific nurture email from `captureLead` (deferred — no persona nurture series
exists yet; recording the lead without mailing avoids mis-sending generic beta copy).

**Consequences.** New public surface `/start/<flow>` (three starter flows: `welcome`,
`event`, `partner`); bare `/start` redirects to the welcome router. Every member now leaves
intake with a `meta.persona` + a `persona_*` tag, so marketing can segment by who they said
they are and the site/Vera can tailor later. Five new system-managed tags are registered in
the MDP (`assignTag` throws on unknown keys, so registration is mandatory). The beta
sequences are untouched and still tag cohorts in parallel — persona is an orthogonal axis,
not a replacement. Operator-facing "how to assign a lead flow" guidance belongs in Notion
(Training & Strategy), linked back to LEAD-FLOWS.md as source of truth.

---

## ADR-126: Entry Points & Campaigns — the distribution layer

**Status:** Accepted (design; Phase 1 to follow) · planned in `lib/entry-points/**`,
`app/(main)/codes` → "My Entry Points", `app/(main)/marketing/campaigns/**`, an extension of
`qr_codes` + a new `entry_campaigns` table. Builds on personas + lead flows (ADR-125), the QR
engine (`lib/qr/**`), attribution (ADR-095), and the zaps ledger. Full spec:
[ENTRY-POINTS.md](ENTRY-POINTS.md).

**Context.** We want a "lead page / funnel" system — the best of Leadpages / ClickFunnels /
Linktree-Beacons / Mailchimp, kept *simple* — that integrates with our membership, points, and
QR. The headline finding: **~60% already exists.** We ship a branded QR engine that emits
**vector SVG + PNG** (`renderStyledQrSvg` / `renderStyledQrPng` / `/api/qr`), a scan resolver
(`/q/[slug]`), first-touch attribution, owner-credit on signup (`applyReferralAttribution` →
`invite_accepted` zaps), an idempotent points ledger, a CRM, a Puck visual editor, and the new
personas/lead-flows. What's missing is a **template + flyer layer** and **two surfaces** (a
dead-simple crew builder; an advanced admin campaign builder). Today's crew "marketing codes"
are a narrow special case (owner `qr_codes`, ≤3, circles/events only).

**Decision.** Unify crew marketing codes, the personal connect/referral code, and the `/start`
lead flows under one concept — the **Entry Point** (a door: short link + branded QR + flyer +
destination + owner + campaign + analytics + points credit) — grouped by **Campaigns**, built
from **Templates**.
- **Name:** crew-facing **"Entry Points"**; admin grouping **"Campaigns"** (the existing
  `campaigns` table is email broadcasts, so the new table is `entry_campaigns`).
- **Destinations: both, the template decides** — an entry point points at a *place* (circle /
  event / profile / url) *or* a **persona lead flow** (`/start/<flow>`, ADR-125) that captures
  + routes. Crew get power without a blank canvas.
- **Two surfaces, one engine:** a ruthlessly simple crew portal (evolves `/codes`:
  template → 3–4 slots → link + QR + **flyer SVG/PNG** in under a minute) and an advanced admin
  builder in `/marketing/campaigns` (Puck landings, template curation, bulk generation, A/B,
  automations). The crew tool never exposes a layout editor.
- **Flyer = on-brand SVG** composing brand frame + slots + the styled QR; outputs vector **SVG**
  + high-res **PNG**; design-token-driven so it's beautiful by default.
- **Points (simple, anti-farm):** a small **first-N-capped** `entry_point_created` zap grant,
  the existing 40-zap `invite_accepted` credit when an entry point drives a signup, and a
  `referral_activated` bonus when that signup *activates* (first practice). All through
  `recordEngagementEvent` (exactly-once). A crew leaderboard by signups driven.
- **Reuse-first data model:** extend `qr_codes` (add `campaign_id`, `template_id`, broaden
  `destination_type` + `lead_flow_slug`/`persona`, lift the crew cap for `purpose='entry_point'`);
  new `entry_campaigns`; a **code-first template registry** (`lib/onboarding/lead-flows.ts`
  pattern) with a DB-override layer later. Build order: **spec + ADR (this), then Phase 1** (crew
  MVP), then admin builder, then growth.

**Alternatives.** A net-new entry-point table instead of extending `qr_codes` (rejected — the
QR engine, scan resolver, and referral credit are all keyed on `qr_codes`; extending reuses the
whole pipeline). A third-party builder (Leadpages/ClickFunnels) embedded (rejected — no points/
persona/QR integration, off-brand, recurring cost). A drag-and-drop editor for crew (rejected —
the explicit ask is *simple*; templates + slots beat a blank canvas; the canvas lives in admin
via Puck). Convert-only points (rejected per product — we want a reward for *participating*, so
create-credit is included but capped to stay anti-farm). Dollar monetization à la Beacons
(out of scope — points are our native currency).

**Consequences.** Crew can make a branded flyer with a working QR + tracked link in under a
minute, and earn zaps for it; every signup it drives credits them automatically (the `fq_ref`
pipeline already does this). Operators get a real campaign builder reusing `/marketing` + Puck.
New surface area is small: a template registry, a flyer-composition layer, the two builder UIs,
a `qr_codes` extension migration, and an `entry_campaigns` table — migrations written but applied
in a separate reviewed step. Personas/lead flows are the routing layer underneath; Entry Points
are the distribution layer on top. Operator playbooks live in Notion, linked to ENTRY-POINTS.md.

---

## ADR-127: Site-admin roles — a functional "operations" axis (Owner · Admin · Operations · Marketing · Accounting · Support · Analyst)

**Status:** Accepted · **model + capability matrix + assignment UI shipped**
(`lib/core/staff-roles.ts`, `lib/staff.ts` `requireStaffCap`, `/admin/roles`
`StaffRoleManager` + `setStaffRole`/`addStaffMember`, migration
`20260606000100_team_member_roles.sql`, tests `lib/core/staff-roles.test.ts`).
**Enforcement (in progress):** the staff-gated surfaces now run on the capability
model — the **marketing** gates use `staffCan('marketing')` (actions + layout), and
nav surfacing (`meetsStaff`) + the Profile Creator (`connectionsOwnerId`) use
`staffCan('profiles')`. The `/admin` guard is now an **additive, fail-closed union**
(`requireAdmin(min, { staff })` also admits a staff role holding that capability domain,
write), wired for the **Community group** (Overview · Circles · Channels · Events ·
Broadcasts · Crew tasks · Gamification · Moderation) + nav/launchpad/sub-nav — so
Operations/Support reach the community admin pages. **Sensitive groups stay
community-janitor only** (Roles · Members · AI · Platform · Vera have no `staffDomain`).
**Write-action parity (community) shipped:** the community-surface mutations in
`admin/actions.ts` (circle/channel/event/dispatch/crew-task create·update·archive·
delete + verification approve/reject) now authorize via `authorizeAction(caller,
'host', 'community')` — community host+ OR staff community-write. The **sensitive
mutations stay community-only** (assignRole, deactivateMember, member/account actions).
**Structure · Insights · QR shipped:** Structure (hubs/nexuses — pages + `createHub`/
`updateHub`/`createNexus`/`updateNexus`) and QR (pages + all `qr/*` actions) union the
`'structure'`/`'qr'` capability (write); **Insights** (engagement/intel/outcomes/AI-read/
segments) unions `'insights'` at **read** level (so Analyst can view, not mutate). The
`/admin` floor is now `requireAdminFloor()` (community host+ OR any staff that can read
an admin group). **Sensitive groups remain community-janitor only** (Roles · Members ·
AI · Demo · Vera have no `staffDomain`). The capability model is now the authoritative
gate across the admin surfaces. Extends ADR-027; layers over `ADMIN_GROUPS` +
`area_permissions`.

**Context.** Two axes exist: the **community trust ladder** (member→…→admin→janitor, community
standing) and a separate **staff/operations** axis (`team_members`: analyst→marketer→admin→owner,
ADR-027). The staff axis is a strict ladder, which is wrong for **functional departments** —
Operations and Accounting aren't "more/less than" each other.

**Decision.** Keep the two axes. Reshape the staff axis into **two spanning levels + four
department roles + one read-only**:

| Role | Scope |
|---|---|
| Owner | Everything incl. billing ownership, transfer/close org, grant roles |
| Admin | All operations + assigns roles below Owner (not ownership-only) |
| Operations | Circles · channels · events · hubs/nexuses · broadcasts · moderation · members roster · QR. No finance/roles |
| Marketing | Marketing · CRM · outreach · segments · intel; insights read |
| Accounting | Billing · subscriptions · payouts · reports; members read-only |
| Support | Moderation · member assist · help-gaps; insights read |
| Analyst | Read-only across insights/analytics/CRM |

Permissions stay **data-driven** (role→capability map over `ADMIN_GROUPS` + `area_permissions` +
the resolver), not hardcoded per page. **Janitor stays** the top community super-steward; a person
may hold both a community role and an operations role. Migration is incremental: `analyst→Analyst`,
`marketer→Marketing`, `admin→Admin`, `owner→Owner`; **add** Operations, Accounting, Support.

**Alternatives.** Extend the single strict ladder (rejected — departments aren't ranks). Put ops
roles on the community ladder (rejected — conflates community standing with business operations,
the exact thing ADR-027 separated).

**Consequences.** A clean operations org model. Implementation = a migration adding the role enum
values + a role→capability map + the `/admin/roles` UI; gating already flows through
`meetsAccess`/`meetsStaff` + the resolver. Built after the page admin dock (ADR-128).

## ADR-128: Page admin dock (`PageAdminDock`) — inline admin as a movable edge tab (Phase 1)

**Status:** Accepted (Phase 1) · `components/layout/page-admin-dock.tsx`,
`components/layout/app-shell.tsx`. Realizes the inline-admin model (CAPABILITIES-AND-MOBILE.md §2)
as a dock.

**Context.** Admin/edit actions for a page were scattered (the Admin tab, per-page menus). We want
them **always readily available in one tab on the page itself**, for whoever's allowed.

**Decision.** Operators only (`meetsAccess('host')` or any staff; never a member). The panel of
per-page admin actions is unchanged (Edit info → section editor by route, Group dispatch,
Settings/Admin home, janitor: Members · Pages · Roles; Layout template + Basic styles are **"Soon"**,
Phase 2). The **chrome differs by platform** (revised after the first cut cluttered mobile):
- **Desktop:** a **light, unobtrusive** vertical tab on the right edge (was opaque — corrected).
  Opening slides a right panel in, in one of two **persisted modes**: **Push** (the shell pads the
  content over so the whole page stays visible) or **Overlay** (panel floats over). **Width is
  drag-resizable** (left-edge handle). Mode + width persist site-wide (`freq-admin-mode` /
  `freq-admin-width`).
- **Mobile:** **no edge tab** — the panel opens from a **Shield button in the top header** and shows
  as an overlay sheet (push doesn't apply on a phone).
- The shell owns open/mode/width (so Push can pad `[data-feed-scroll]` via a `--admin-pr` var at
  `md+`).

**Alternatives.** The first cut (an always-present **opaque, repositionable** edge tab on every
viewport — rejected: it cluttered the mobile site; mobile now triggers from the header, desktop tab
is light). Keep admin behind the Admin tab only (rejected — not in-context).

**Consequences.** Operators get one consistent, repositionable admin surface on every page. Gating
is by role today; it tightens to the granular capability set (and the ADR-127 operations roles) as
those land. Phase 2 brings true in-place layout/style editing.

---

## ADR-129: Bundle `content/help/**` into the serverless runtime so "Ask Vera" can build its index

**Status:** Accepted · `next.config.ts` (`outputFileTracingIncludes`), `lib/ai/help-index.ts`
(fail-loud on empty), `lib/ai/help-rag.ts` (`after()` telemetry). Builds on the RAG support
tier (ADR-067, SUPPORT-SYSTEM.md).

**Context.** "Ask Vera" retrieves from `help_chunks`, an embedding index built by
`reindexHelpChunks()` (nightly `embed-help` cron + admin "Build index" button). In production the
button "did nothing": `help_chunks` was empty, so every question deflected. Root cause: the help
center is plain Markdown read from disk at **runtime** (`lib/help/content.ts` → `fs.readdir` of
`content/help/**`). Next's file tracer can't follow those dynamic reads, so the Markdown was absent
from the serverless function bundle; `getAllCategories()` swallows the fs error and returns `[]`,
and `reindexHelpChunks()` then reported a happy "0 embedded" while the index stayed empty. The help
*pages* were unaffected — they're statically generated at build time, where the files exist. (The
`(main)` layout's support-launcher search index reads the same files at runtime, so it was empty
too — but its empty state reads as a normal "no matches," which is why only Vera was reported.)
Separately, `logHelpQuery`/`recordAiUsage` ran as floating `void` promises, which serverless does
not guarantee to finish — so query/usage telemetry was silently lost (0 rows despite live use).

**Decision.**
- **Trace the content in.** `outputFileTracingIncludes` bundles `./content/help/**/*` into the
  reindex routes (`/api/cron/embed-help`, `/admin/ai`) and all routes (`/**`, for the layout
  search index). The content is tiny, so the trace cost is negligible.
- **Fail loud.** `reindexHelpChunks()` throws when it finds zero published articles instead of
  "succeeding" with an empty build — the cron logs an error and the admin button surfaces it,
  rather than hiding a broken index behind a green result.
- **Persist telemetry with `after()`.** Replace the `void`-ed `logHelpQuery`/`recordAiUsage` with
  `after(() => …)` (next/server) — off the response path, but guaranteed to run.

**Alternatives.** Import the Markdown as modules / precompute a JSON index at build time (rejected
for now — larger change; file tracing is the minimal, idiomatic fix and keeps the fs-based content
layer). Await the telemetry inline (rejected — adds latency to every answer).

**Consequences.** After deploy, the nightly cron (or one click of admin "Build index") populates
`help_chunks` and Ask Vera answers; a future content-load regression fails visibly instead of
silently. Any other AI surface still using `void recordAiUsage(...)` has the same latent
telemetry-loss bug and should migrate to `after()`.

---
## ADR-130: Unified person + the CRM "User Stats" page — group the three identity records, and search by connection + locality

**Status:** Accepted · shipped in `lib/crm/{person,journey,visibility,people-search}.ts`,
`app/(main)/marketing/contacts/[id]/**`, the contacts list search, `/api/search` +
`search-overlay`, the `/people` directory, and migration
`20260606170000_person_identity_stitch.sql` (✅ **applied** to `Frequency Community` 2026-06-05,
recorded `person_identity_stitch`; idempotent — it backfilled 0 rows on current data since
scan/signup already set the links, and created the three lookup indexes; the resolver also
stitches at read time, so the feature works regardless). Builds on the three-table identity model
(NETWORK-CRM.md, ADR-098/099), the engagement ledger (ADR-025), and acquisition first-touch
(ADR-095). Full spec: [NETWORK-CRM.md](NETWORK-CRM.md) "Unified person".

**Context.** A person captured via Card Scan / Profile Entry or seen via a QR scan shows up in
the CRM (`contacts`, `source='scan_invite'`) but **cannot be found in the app's search** —
because search reads only `profiles` (members), and a scanned lead has no member profile until
they sign up. The same human can exist as up to three rows joined by lowercased email: `profiles`
(member), `contacts` (CRM hub), `network_contacts` (a steward's private capture). Nothing in the
UI pulled them together, and there was no per-person view of the path they took through the
system. Operators experienced this as "I see them on the back end but can't find their profiles."

**Decision.**
- **One unified person, grouped by email.** `lib/crm/person.ts#resolvePerson` gathers the
  `contacts` anchor + its member `profile` + every `network_contacts` capture with that email +
  the behavioral trail (`qr_scans`, `engagement_events`) + the CRM pipeline (`crm_deals`,
  `crm_activities`). Grouping is by email **at read time**, so it works before the backfill.
- **Auto-stitch the links.** Migration `20260606170000_person_identity_stitch.sql` backfills
  `contacts.profile_id`, `network_contacts.linked_contact_id`, and
  `network_contacts.linked_profile_id` by email (idempotent), so the records also self-group in
  the data, and the locality search can resolve a capture's member.
- **A "User Stats" page** at `/marketing/contacts/[id]` (DetailTemplate): at-a-glance stats, a
  **Grouped records** panel (member / CRM / private captures), and **the path through the
  system** — one chronological timeline grouped into funnel phases (Arrival → Outreach → In the
  app → CRM), assembled by the pure, unit-tested `lib/crm/journey.ts`. The contacts list is
  searchable and every row links here.
- **App-wide search by connection + locality, not blanket exposure.** Members stay searchable
  community-wide. A non-member capture surfaces in another viewer's search **only** via one rule
  (`lib/crm/visibility.ts#canViewLead`, unit-tested): `owner` (you captured them — the
  unambiguous valid connection) or `network_local` (a steward set `visibility='network'` **and**
  the viewer shares the capture's locality/`city`). This honors "everyone searchable, permissions
  by locality + valid connection" while keeping private captures private. Wired surfaces
  (`/api/search` overlay + `/people` directory "People you've met") show **owner** leads now
  (they link to the steward's own `/connections/[id]`); `network_local` is modeled + tested but
  **not broadcast** until the cross-steward promotion review (same gate as ADR-098's
  private→network promotion), since a non-owner viewer has no lead page to land on yet.
- **Invite to join** reuses the fully-gated one-time scan-intro (ADR-099) — operator switch +
  per-contact unsubscribe + already-invited guard — never a new ungated email path. A pure
  signup/beta lead (no capturing steward) has no intro to send, by design.

**Alternatives.** Promote scanned captures into public `profiles` so they appear in the member
directory (rejected — leaks personal captures; ADR-098 gates that deliberately). A separate
analytics store for the journey (rejected — projects off the existing ledger per ADR-069). A
fourth "person" table (rejected — email is already the join key; we stitch, not re-model).

**Consequences.** Operators get one screen per person that groups every record and shows their
path, the CRM is fully searchable, and stewards can finally search up people they scanned in.
The visibility rule is auditable in one pure function. Cross-steward network-local search is
ready behind the existing promotion-review gate. Operator how-to lives in Notion (the Network CRM
training page), linked back to NETWORK-CRM.md.

---

## ADR-131: Per-persona nurture sequences — turning captured leads into activated members

**Status:** Accepted (Entry Points Phase 3) · `supabase/migrations/20260607000000_nurture_sequences.sql`,
`lib/nurture/*`, `app/(main)/marketing/nurture/*`, `/api/cron/nurture`. Builds on personas/lead flows
(ADR-125), Entry Points (ADR-126), the email outbox + consent gates, and the contact-level lead
unsubscribe (`lib/connections/lead-unsub.ts`).

**Context.** Phases 1–2 made it easy to *capture* leads (entry points → lead flows → `contacts` with a
`persona`), but `captureLead` literally noted "no persona nurture series exists yet," so a captured
lead got **nothing**. The existing automations engine (ADR-025) is event-triggered and single-shot —
it can't express "wait 2 days, then send step 2." We need a timed, multi-step, per-persona drip that
reuses the durable email outbox and consent model rather than a new sender.

**Decision.**
- **Model:** one `nurture_sequences` row per persona (unique), an ordered `nurture_steps` list
  (`delay_hours` relative to the prior step), and `nurture_enrollments` tracking a contact's cursor
  (`next_step_order`, `next_run_at`, `status`). All service-role only, like `contacts`/`automation_rules`.
- **Enroll on capture (push, not pull):** `captureLead` calls a fire-safe `enrollInNurture` — idempotent
  via `unique (sequence_id, contact_id)`, a no-op when the persona has no enabled sequence. Chosen over
  segment-resolve-at-send so a lead starts the moment they raise their hand.
- **Drain on a cron:** `/api/cron/nurture` (every 15 min, `CRON_SECRET`) runs `runDueNurture()` — for each
  due active enrollment it sends the next enabled step (skipping a since-disabled step instead of
  stalling), then reschedules or completes. **Consent is enforced per send:** `contacts.consent_state =
  'unsubscribed'` or a member's lifecycle opt-out **cancels** the enrollment; every email carries a
  contact-level unsubscribe (`buildLeadUnsubUrl`) + RFC-8058 headers, and goes through `enqueueEmail`
  (never inline).
- **Operator surface:** a **Nurture** tab in `/marketing` (admin/staff) — create a persona's sequence
  (seeded with a starter welcome step from the persona's own copy), edit/enable/reorder steps, and see
  active/completed enrollment counts.
- **Pure core:** step selection + scheduling (`lib/nurture/schedule.ts`) are pure and unit-tested; the
  store/runner/actions do the I/O.

**Alternatives.** Extend `automation_rules` with delays + conditions (rejected — conflates the
event-bus engine with a scheduler; a dedicated enrollment table is clearer and testable). Resolve a
persona **segment** at send time and mail the whole list (rejected for first send — push-on-capture is
simpler and starts immediately; segment-driven *broadcasts* remain a separate Phase-3 lever). Send
inline at capture (rejected — bypasses the retrying outbox and the timed cadence).

**Consequences.** Captured personas now get a warm, consent-safe drip with no per-send code. The
enrollment table also gives per-persona funnel visibility (in-sequence vs completed). Follow-ups:
in-app/push step channels (the schema is email-only today), A/B variant steps, backfilling existing
contacts into a sequence, and segment-targeted broadcast sends.

---
## ADR-132: Cross-steward `network_local` discovery — turn on the gated tier with a read-only shared view

**Status:** Accepted · shipped in `lib/crm/people-search.ts` (`searchVisibleLeads(..., {
includeNetwork })`), `lib/connections/store.ts` (`getSharedContact`),
`app/(main)/connections/shared/[id]/page.tsx`, and the steward-gated wiring in `/api/search` +
`/people` (via `connectionsOwnerId()`). Completes the follow-up ADR-130 deferred. Full spec:
[NETWORK-CRM.md](NETWORK-CRM.md) "Searchable by connection + locality".

**Context.** ADR-130 modelled and tested the `network_local` tier of `canViewLead` — a capture a
steward shares to the network becoming findable by a *local* steward — but did not broadcast it:
a non-owner viewer had no page to land on, and cross-steward exposure of a non-consented personal
capture is exactly the leak risk the Profile Creator gates (ADR-098). The owner-share control
(`visibility='network'`, the Network/Private toggle) already exists, so the tier was one safe
surface away.

**Decision.** Turn the tier on, narrowly. A `network_local` capture surfaces only when **all**
hold: the **viewer is a steward** (host+) or staff (`connectionsOwnerId()` gates the lead search —
regular members never search leads); the owner **deliberately shared** it (`visibility='network'`);
and the viewer is in the **same locality** (`city`). The surface is a **read-only shared view**
(`/connections/shared/[id]`) exposing **business-card fields only** — name, title, company, city,
website, socials, and *who shared it* — so the next step is to **ask that steward for an intro**.
Email, phone, notes, tags and the photo stay owner-private. The page **re-checks all three gates
server-side** (steward, `visibility='network'`, locality) — the search filter is never trusted as
the authorization boundary. A capture linked to a member is skipped (found as a member instead).

**Alternatives.** Show contact details / notes on the shared view (rejected — over-exposes a
non-consented capture; the intro belongs to the owner). Surface network leads to all members
(rejected — "network" means *stewards*, per the RLS intent). Auto-promote to a public profile
(rejected — ADR-098's hard gate). Skip the dedicated page and deep-link into the owner's CRM
(rejected — that's owner-private).

**Consequences.** Local stewards can discover and get introduced to people other stewards have
met, without any private capture data leaking and without touching the public member directory.
Exposure scales with deliberate owner shares + locality, and every read is gated three ways. If a
viewer-facing "request intro" action is wanted later, it slots onto the shared view.

---

## ADR-133: Page admin dock Phase 2 — capability-driven modules + in-place editing

**Status:** Accepted — build pending · Full spec: [EMBEDDED-ADMIN.md](EMBEDDED-ADMIN.md).
Builds on **ADR-128** (`PageAdminDock`, Phase 1) and **ADR-127** (operations roles); uses
`lib/core/capabilities.ts` (resolver) + `lib/core/staff-roles.ts` / `lib/staff.ts`
(`staffCan`). Refines CAPABILITIES-AND-MOBILE.md §2 and PAGE-FRAMEWORK §3/§6.

**Context.** ADR-128 shipped the right *chrome* — an edge-tab/header slide-out, push/overlay,
resizable, persisted — but its panel is a **fixed action list branched on role** that
**deep-links into `/admin/*`**; in-place layout/style editing is "Soon"; gating is by role,
not the granular capability set. ADR-128 explicitly named Phase 2 as "tighten to the granular
capability set (and ADR-127 operations roles)… true in-place editing." (This design was also
produced independently as a planning spec; when the dock shipped in parallel the two were
reconciled into this Phase-2 ADR rather than a competing one.)

**Decision.** Build the dock's *content engine* — no new chrome.
- **Replace the fixed action list with a declarative `AdminModule` registry** filtered by
  `resolveCapabilities(viewer, scope)` (+ `staffCan` for operations roles). Tiers emerge from
  filtering — **same box format, more boxes** — removing the dock's `isJanitor ? […]` /
  `can('host')` branching. (`modulesFor` / `showsAdminPanel`.)
- **In-place editing:** each module renders as an `AdminModuleCard` (a thin wrapper over
  `SidebarCard`) that edits on the page (optimistic; the server action re-checks the *same*
  capability), converting today's `Edit info → /admin/circles` deep-links and the "Soon"
  layout/style items into in-place editors.
- **Server-composed content:** the client dock takes **server children** (the donut) via a
  Next 16 `@admin` parallel-route slot, so no other tier's UI ships to the client bundle.
- **Absorb `/admin/*` progressively:** as a surface gets a module its dock link becomes the
  module; residual platform surfaces (Members/Roles/AI/Vera/analytics) collapse into a
  `global`-scope **Platform** module group, then `/admin` retires.
- **Close the capability-loader gap:** add `hub`/`nexus` loaders + `loadCapabilitiesForScope`
  in `load-capabilities.ts`; add `event`/`channel` `Scope` kinds as those pages gain modules.
- **Enforcement unchanged:** capabilities are law server-side; the registry's
  `requiredCapability` is UX metadata named identically to the action's re-check (meets
  ADR-127's "write-action parity" slice).

**Alternatives.** Build a separate `Sheet` primitive (rejected — the dock already *is* the
slide-out; reuse it). Keep the fixed action list + role branching (rejected — doesn't scale per
tier/scope; ADR-128 already committed to capability tightening). A DB `module_key → min_role`
grid (deferred — capabilities are code-driven; the `area_permissions` override pattern is
available later). Ship as a competing ADR-126 / standalone "embedded admin panel" (superseded —
reconciled into this Phase-2 ADR after the dock shipped in parallel).

**Consequences.** Net-new: the `AdminModule` registry (`lib/admin/modules/`), `AdminModuleCard`,
the `@admin` slot, and `hub`/`nexus` loaders + dispatcher. The dock's `sectionEdit(pathname)`
prefix map generalizes into the scope/registry model. The dock's chrome (push/overlay/resize/
persist) is untouched. Rollout is additive and per-surface (engine → Circles pilot → scoped
surfaces → Platform group → retire `/admin`). EMBEDDED-ADMIN.md is the source of truth;
CAPABILITIES-AND-MOBILE §2 + PAGE-FRAMEWORK §3/§6 are refined; the operator guide goes to
Notion on ship.

---

## ADR-134: Entry-point recruiter leaderboard + tiers — gamify the crew lead-gen loop

**Status:** Accepted (Entry Points Phase 3) · `lib/entry-points/leaderboard.ts`,
`app/(main)/crew/leaderboard/` (`entrypoints` scope + tab). Builds on Entry Points
(ADR-126), the referral attribution column (`profiles.referred_by_profile_id`, ADR-099),
and the existing `/crew/leaderboard` shell + season-rank pattern.

**Context.** Crew can build entry points (Phase 1) and admins run campaigns (Phase 2), but
nothing **ranked** crew by the outcome — closing the loop "build → earn → see where you
stand" that drives the rest of the gamification. We want a recruiter board + recognition
tiers without a new points system.

**Decision.**
- **Rank by outcome, owner-level.** A recruiter's score is the **signups they referred**
  (`profiles.referred_by_profile_id = owner`) — the same owner-level credit the zaps model
  already uses (`invite_accepted`/`referral_activated`) — with **scans** (sum of their entry
  points' `scan_count`) and **entry-point count** as tiebreakers (`rankRecruiters`, pure).
  Signups-not-scans is deliberate: it rewards conversions, not vanity reach. It counts
  *all* of an owner's referrals (not just a specific code), because `fq_ref` attributes to
  the owner, not the code — matching how credit already flows.
- **Tiers from cumulative signups** (`recruiterTier`, pure + tested): Scout → Connector (3)
  → Recruiter (10) → Ambassador (25) → Luminary (50). Shown as a badge on the board and a
  "N more to <next>" nudge for the viewer.
- **Reuse the leaderboard surface.** A new `entrypoints` scope/tab on `/crew/leaderboard`
  renders its own columns (Points · Scans · Signups · Tier) rather than the season-zaps
  layout, so it sits where members already look for rankings — no new page.
- **No new tables / no migration.** Computed at read time from `qr_codes` + `profiles`.

**Alternatives.** A separate persisted "recruiter_score" with its own ledger (rejected —
referrals already give an accurate owner-level signal; computing at read time avoids a
sync path). Rank by scans (rejected — rewards printing, not converting). A standalone page
(rejected — the leaderboard is the natural home).

**Consequences.** Crew see themselves ranked for lead-gen and chase the next tier; the loop
from Phases 1–2 now has a visible payoff. Tiers are recognition-only today (no rewards
attached). Per-campaign/per-code conversion attribution and tier-linked zaps/badges are
follow-ups. Read-time aggregation is fine at current scale; if the owner set grows large,
denormalise into a materialised count.

---

## ADR-135: Unified mobile edge menus — always-visible tabs, click-to-open, shared Micro/Full size

**Status:** Accepted · `components/layout/app-shell.tsx` (`EdgeMenu`, `RailSize`,
`NavLinkList compact`). Supersedes the ADR-122 interaction (and the residue of ADR-121's left
rail); the left edge reuses the primary `NavLinkList` (`NAV_SECTIONS`), the right reuses
`GameStatsPanel` via `statsPanel`.

**Context.** ADR-121/122 gave the two mobile edges a **scroll-revealed**, very-light tab that
appeared only after scrolling, plus a **per-device on/off toggle** in the Menu drawer
(`freq-rail-nav` / `freq-stats-rail`). In practice the reveal felt hidden and the on/off control
was clutter — the edges should just *be there*. The two edges had also drifted into separate
components (`MobileSideRail` / `MobileStatsMenu`) with slightly different chrome.

**Decision.** Collapse both edges into **one `EdgeMenu` component** (`side="left" | "right"`):
- **Always-visible tab** (`h-[36vh] w-5`) on the **same surface as the post box** (`bg-surface`,
  `border-border`), tucked a little farther off the edge (`±translate-x-1.5`) for more buffer to
  content. It **rests dimmed in a ghost state** (`opacity-40`) and brightens on touch
  (`hover/focus/active:opacity-100`). No scroll-reveal, no on/off setting — the selector is gone.
- **Slides open and stays** until the member taps the shared backdrop, selects a link (route
  change), or scrolls the feed (`[data-feed-scroll]`, >6px). The panel is **always mounted** and
  slides on a `transform` with soft easing (`transition-all duration-300 ease-in-out`), so
  open/close/resize all animate gently.
- **Left = the PRIMARY nav** (`NavLinkList` over `NAV_SECTIONS` — the same full menu as the
  desktop rail / drawer), not the `MOBILE_TABS` subset (those already live in the bottom tab bar).
  **Right = stats / streaks / gamification** (`GameStatsPanel` via `statsPanel`).
- **Both micro columns may be open together; only ONE full menu at a time.** Open state is two
  booleans in the shell (`leftOpen` / `rightOpen`); opening or **expanding** one edge to full
  slides the opposite closed (`changeRailSize(s, side)` / `openEdge(side)` gate on
  `railSize === 'full'`). `EdgeMenu` is controlled; the shell owns the shared backdrop and the
  route-change + scroll closing.
- **Shared Micro/Full size**, persisted once as `freq-rail-size` (default `micro`):
  - **`micro` is a single icon column** (`w-16`) — left = the primary nav rendered icon-only
    (`NavLinkList compact`, tooltip-labelled); right = streak · bolts · gems (each → `/crew`).
    The narrow column has no room for a segmented control, so its bottom is a single **expand**
    button (`Maximize2`) that switches to full.
  - **`full` is content-appropriate** — left nav `w-64 max-w-[80vw]` (labels), right stats
    `w-[88vw] max-w-sm`. Its bottom carries the segmented **View: Micro|Full** control; both
    edges read the same size.
- **Small content gutter:** `<main>` padding is `px-6` so the always-on tabs never touch content.

**Alternatives.** Keep the scroll-reveal (rejected — the ask was "always visible as tabs"). Keep
the per-rail on/off toggle (rejected — "the menu selector … is unnecessary"). Mutually exclude
*both* sizes (rejected — the ask is "both can be open … one **full** menu at a time"). Show the
`MOBILE_TABS` subset on the left (rejected — "display the primary menu, not the secondary"; the
subset duplicates the bottom bar). A labeled-but-narrow micro (rejected — "the collapsed view is a
single icon column"). A push-content layout (rejected — the panels overlay; on a phone pushing
crushes the feed, per ADR-122).

**Consequences.** Removed: `useRailReveal`, `EdgeTab`, `RailToggle`, the drawer's edge-rail
preferences section + its `railNavOn` / `statsRailOn` / `onSetRail` props, and the
`freq-rail-nav` / `freq-stats-rail` prefs (replaced by the single `freq-rail-size`). The left edge
reuses `NavLinkList` (new `compact` icon-only mode) so the primary nav has one source of truth.
The shell coordinates both edges (two open booleans + a shared backdrop) for the "both micro / one
full" rule. Both edges are `md:hidden`, so desktop is untouched; the desktop stats dock and
`GameStatsPanel` / `loadGameStats` reuse (ADR-122) are unchanged.

---

## ADR-136: Entry-point A/B testing — split one printed QR across destination variants

**Status:** Accepted (Entry Points Phase 3) · `supabase/migrations/20260607020000_entry_point_ab.sql`,
`lib/entry-points/ab.ts`, the `/q` resolver, `lib/qr/referral.ts` + onboarding,
`app/(main)/marketing/funnels/variants/**`. Builds on Entry Points (ADR-126), the scan
resolver + `record_qr_scan`, and referral attribution (`fq_ref`, ADR-099).

**Context.** An entry point is one **printed** QR / slug — you can't change the flyer after
it's out. The lever you *can* test is the **destination**: send some scanners to lead flow
A, others to B, and measure which converts. The hard part is attributing a **signup** back
to the variant a now-anonymous scanner saw, days later.

**Decision.**
- **Variants live under the code, keyed, weighted.** `entry_point_variants` (per `qr_codes`
  row): `variant_key`, `label`, `target_url`, `weight`, `active`. The resolver picks one by
  weight (`pickVariant`, pure + tested) for `url` entry points; **no active variants ⇒ the
  default destination (control)**, so the feature is opt-in and inert until configured.
- **Record the served variant on the scan.** `record_qr_scan` gains an additive
  `p_variant` param → `qr_scans.variant_key`. Per-variant scans come straight from the log.
- **Carry it to signup via a cookie, mirroring `fq_ref`.** The resolver sets `fq_var =
  <codeId>:<variantKey>` for anonymous scanners; at onboarding `applyEntryPointConversion`
  reads it and writes `entry_point_conversions` (one per person per entry point). Conversion
  rate = conversions / variant scans. Reuses the exact pattern that already attributes
  referrals — no new attribution machinery.
- **Safe destinations only.** Variant targets are validated with the same
  `isValidEntryDestination` guard entry points use (no open redirect).
- **Admin surface** under `/marketing/funnels/variants/<codeId>`: define variants, toggle,
  and read scans / signups / rate with a leading-variant marker.

**Alternatives.** A/B the **flyer** (rejected — it's printed; can't vary post-print).
Per-variant **referred_by** (rejected — `referred_by` is owner-level, can't hold a variant;
a dedicated conversions table is precise). Client-side split (rejected — the resolver is
server-side and must redirect + log atomically; cookies set there are reliable).

**Consequences.** Operators can run real destination experiments on a single printed code,
with true signup-conversion (not just scan) per variant. Value scales with scan volume, so
it's most useful once entry points are driving traffic. Follow-ups: statistical-significance
hints, auto-promote the winner, and variant-level breakdown in the funnels analytics.

---

## ADR-137: The settings console — on-page Edit Mode, a 9-category spine, drill-down navigation

**Status:** Accepted — build pending · Full spec: [EMBEDDED-ADMIN.md](EMBEDDED-ADMIN.md)
("The target shape"). Extends **ADR-133** (Phase-2 in-place modules) and **ADR-128**
(`PageAdminDock`); the end state of **ADR-127**'s `/admin` absorption. Realizes
CAPABILITIES-AND-MOBILE §2 ("admin where the thing lives").

**Context.** Phase 2 put per-entity admin into the dock as a **flat list** of in-place
modules (Circle/Hub/Nexus/Event settings shipped). But the real goal is bigger: an operator
should **never go to `/admin`** for entity work — they should hit **Edit** on the page and
get the *whole* surface (title, snippet, location, gamification, QR, layout, moderation, …)
in one place. A flat list doesn't scale to a full suite in a narrow panel, and without a
shared structure each page's admin would drift into a bespoke layout — the exact thing the
page framework forbids.

**Decision.** Make on-page **Edit Mode** the single way entity admin happens, structured by
one universal taxonomy.
- **Edit Mode.** An Edit toggle on any administrable page (a) puts the page into edit mode
  with inline click-to-edit handles on obvious fields (title, cover, snippet) and (b) opens
  the **settings console** (the dock) with the full suite. "Done editing" exits everywhere.
- **A 9-category spine — settings as *questions*.** Every setting answers one of a fixed,
  ordered set: **Basics** (what is it?) · **Place & Time** (where/when?) · **People** (who?) ·
  **Layout** (what shows on the page?) · **Engage** (gamification) · **Reach** (QR/links/
  campaigns) · **Comms** (broadcast/notify) · **Safety** (moderation/AI) · **Insights**
  (read-only stats) · **Danger** (archive/delete/transfer, pinned last). One spine on every
  page; a page shows only the categories that apply (coverage matrix in the spec). This
  refines the registry's `AdminSlot` union — `AdminModule.slot` *is* the category.
- **Drill-down navigation** (chosen over accordion / top-tabs). Console home = the category
  list (icon · name · live summary · ›) + a few quick toggles; tap → that category's
  `AdminModuleCard` screen; back ‹ returns; search jumps to any setting. The iOS-Settings
  model — scales to any suite size, stays compact in a narrow panel.
- **`/admin` fully retired for entities.** Platform leftovers (Members/Roles/AI/Vera) become
  the **global scope's** console, opened from the home page's Edit button — same shell, same
  spine.

**Alternatives.** Accordion (rejected — one long scroll once every category is populated) or
top tabs (rejected — crowd past ~5 in a narrow panel). A bespoke admin layout per page type
(rejected — drift; the spine is the consistency guarantee). Keep the flat module list
(rejected — doesn't scale to the full suite). Keep some entity admin in `/admin` (rejected —
the explicit goal is zero trips to `/admin` for entity work).

**Consequences.** Net-new vs. Phase 2: expand `AdminSlot` to the spine (rename
`settings→basics`, `content→layout`, `moderation→safety`; add `place`/`engage`/`reach`/
`comms`); a drill-down console shell (home list + category screen + back + search) over the
dock; page-level Edit Mode + inline handles; and the missing modules per category (many new
fields/actions — e.g. the circle already has `image_url`/`city`/`lat`/`long`/`timezone`/
`topical_channel_id` unexposed today). Capabilities stay law (each module's action re-checks).
Enables the page-builder ("Layout") the dock marked "Soon". Docs: EMBEDDED-ADMIN.md is the
source of truth; the operator "edit from the dock" guide goes to Notion on ship; add the
console + `AdminModuleCard` to the DESIGN.md kit.

---

## ADR-138: Two admin surfaces split by intent — inline *tuning* vs the management *sidebar*

**Status:** Accepted — build pending · Refines [ADR-137](DECISIONS.md) (single drill-down
console). Spec: [EMBEDDED-ADMIN.md](EMBEDDED-ADMIN.md) ("The target shape"). The management
sidebar is the **already-shipped** `PageAdminDock` (ADR-128); the inline layer is new.

**Context.** ADR-137 put the whole settings suite into one drill-down console (the dock).
Right idea, but cramming *creative tuning* (branding, content, engagement) and *granular
feature management* (access, moderation, integrations, contact settings) into one list
flattens two genuinely different jobs. Tuning wants to happen **against the real content,
on the page**; feature management wants a **structured control panel**. Forcing both into a
drill-down makes tuning feel indirect and management feel buried. (A separate admin sidebar
already exists on the site — the `PageAdminDock` — so the panel half is built; the gap is a
true in-context inline layer.) Still non-negotiable: **never go to `/admin` to edit a page's
admin features.**

**Decision.** Split on-page admin into **two surfaces, divided by intent**, both toggled by
one **Edit** button (and both off on "Done editing"):
- **Inline admin (on the page) — *tune*.** In-context handles + per-region toolbars for
  **branding, content, engagement**: page info (title/snippet/cover), Layout (what shows +
  order), Engage (community engagement), the **QR generator**, search & sorting, and **Vera
  tone**. The page is the canvas — you see changes against the real content.
- **Management sidebar (the `PageAdminDock`) — *manage*.** A structured **drill-down** (ADR-137
  navigation) for **granular feature management**: People & access, Place & Time, Comms,
  Reach (links/campaigns), Safety/moderation, Insights, **Danger**, and **page-scoped global
  settings** surfaced in context (e.g. contact settings, integrations).
- **The split is by intent, not entity.** A spine category can have a *tune face* (inline) and
  a *manage face* (sidebar): Reach = generate a QR (inline) vs. manage campaigns (sidebar);
  Safety = Vera's voice (inline) vs. moderation rules (sidebar). The registry gains a
  **`surface: 'inline' | 'sidebar'`** field on `AdminModule` that routes each module; `slot`
  still names the spine category. Capability gating + per-setting inline save are identical
  on both.

**Alternatives.** One drill-down console for everything (ADR-137 — refined here: tuning reads
better in context than buried in a list). Inline-only, no panel (rejected — granular feature
management needs structure a page canvas can't give). Keep some feature management in `/admin`
(rejected — the explicit goal is zero trips to `/admin`). A separate Edit toggle per surface
(rejected — one Edit Mode, two surfaces, is simpler to reason about).

**Consequences.** Net-new vs. ADR-137: a `surface` field on `AdminModule`; the **inline layer**
(page-level Edit Mode + in-context handles/toolbars mounting the ✏️ modules against real
content); the sidebar keeps the ADR-137 drill-down for the ⚙️ modules. The shipped dock is the
sidebar — no new panel. Each spine category is tagged with its primary surface (a couple span
both). EMBEDDED-ADMIN.md "target shape" updated to the two-surface model. Operator guide → Notion
on ship.

---

## ADR-139: Reward currency follows the action — a zap ledger + the Vault points log

**Status:** Accepted — shipped. Spec: [ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md) §3,
[GLOSSARY.md](GLOSSARY.md) (currency model), [GAMIFICATION-AUDIT.md](GAMIFICATION-AUDIT.md).

**Context.** The two-currency model (Gems = online, Zaps = real-life) was sound for *base
actions* — `currencyForSource` routed them and a test pinned it. But the **meta-layer leaked**:
achievements, season challenges, and quests/arcs always paid **zaps**, regardless of whether the
milestone was online or in-person. So a single post (an online act that should pay only gems)
unlocked "First Post" — which **double-awarded** (the app paid the reward as gems while a DB
trigger, `after_achievement_unlocked`, paid the same amount as zaps) — and completed the
"Content Creator" quest step, paying more zaps. One online post minted zaps from three paths.
Compounding it, **zaps had no ledger**: every grant wrote `profiles.current_season_zaps`
directly from ~6 call sites, so there was no history to show a member *how* they earned, and
no single place to keep rank in lockstep.

**Decision.**
- **Currency follows the act, everywhere.** One source of truth, `currencyForCriteria`
  (`lib/engagement/currency.ts`), maps every milestone/streak type to a currency: online
  (post, reply, react, RSVP, join, welcome) → **gems**; real-life (attend, host, found/lead a
  circle, outreach/crew tasks, captures, **all practice logs**) → **zaps**. Achievements,
  challenges, and each quest step/chain now pay through it. A mixed Journey pays each step in
  kind and the chain in the currency of its real-world steps.
- **A zap ledger mirrors the gem ledger.** New `zap_transactions` (one row per grant) with an
  `AFTER INSERT` trigger (`after_zap_transaction`) that is the **only** place
  `current_season_zaps` / `lifetime_zaps` move and `current_season_rank` advances (auto to
  Conduit; Luminary stays a manual, challenge-gated promotion). `awardZaps` only inserts a
  ledger row; the crew-completion and challenge/quest paths route through it too. The
  achievement trigger drops its zap award (killing the double-award) and keeps only
  `achievement_count`.
- **The Vault "how you earned" log.** `/crew/store/ledger` (`lib/economy/ledger.ts`) merges
  both ledgers into one reverse-chron history with friendly labels, plus the member's streaks
  and headline totals — visible to free members too (their points racking up *is* the upsell).
- **Content gap fill.** Seed the four seasonal Pillar Journeys (Mind/Body/Spirit/Expression),
  each mixing an online and a real-world step so both currencies show up as you work it.

**Alternatives.** (a) *Meta-layer pays gems only* — simpler, but an in-person accomplishment
("Attend 8 events") wouldn't move your season rank, gutting the zap ladder. (b) *Reuse
`engagement_events` as the zap history* — rejected: not every zap grant flows through it
(achievements/challenges/quests don't), so it can't be the complete log. A dedicated ledger
mirroring gems is symmetric and complete.

**Consequences.** Zaps and gems are now symmetric (ledger + trigger + totals), so reward code
has one shape. Rank auto-advance caps at Conduit in the trigger (matching the prior
crew-completion trigger and the "Luminary is manual" rule), replacing `awardZaps`'s old
`rankForZaps` write that could auto-mint Luminary at 3000. The free member's value story gains
a concrete surface (the log). Demo profiles still set economy columns directly (they have no
ledger rows — fine, no one reads a demo member's personal log). Remaining work tracked in
GAMIFICATION-AUDIT.md: Journey **join-gating** + a **pillar column** on `quest_chains`, and a
member **zap-rate multiplier** (ECONOMY §6).

---

## ADR-140: Gamification gap closure — joinable Pillar Journeys, member zap-rate, store balance

**Status:** Accepted — shipped. Follows [ADR-139](DECISIONS.md). Spec:
[ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md) §5–§7,
[GAMIFICATION-AUDIT.md](GAMIFICATION-AUDIT.md).

**Context.** ADR-139 fixed reward categorization and shipped the points log; its audit listed
four open gaps. Closing them: (1) the Quests engine auto-enrolled every member in every chain
and had **no browse/join UI** (the route just redirected) — the opposite of the "browse, then
choose to Start" premium model; (2) `quest_chains` were pillar-themed by name only; (3) the
"member zaps earn at a lower rate" decision (ECONOMY §6, *locked*) was never implemented; (4)
the Store treated `lifetime_gems` (a monotonic total) as the spendable balance and never
decremented on spend.

**Decision.**
- **Join-gating.** A `quest_progress` row now means *joined*. `advanceQuests` only advances
  chains the member has started — it never auto-creates progress. A new `startQuest` action
  (Crew-only; free in Beta) creates the row, and a real **`/crew/quests`** page lets members
  browse seasonal Journeys grouped by Pillar, see per-step currency/reward and their progress,
  and Start one (free members hit the upgrade lightbox via `CrewGate`).
- **Pillar column.** `quest_chains.domain_id → domains`, backfilled on the four seasonal
  Journeys, so they group by Pillar (Mind/Body/Spirit/Expression).
- **Member zap-rate.** `awardZaps` applies `MEMBER_ZAP_RATE` (0.5, floored, min 1) to free
  members; Crew earn full rate. Gated on `BETA_MEMBERS_GET_CREW`, so it is **inert during Beta**
  (everyone is Crew) and switches on at Launch. One role lookup, skipped entirely in Beta.
- **Store balance.** Spendable balance is now `lifetime_gems − Σ gems_spent` (from
  `store_redemptions`), enforced in both `getStoreData` and `redeemItem`.
- **Content.** Two bonus micro-journeys + a starter spine of seven system-curated library
  practices across the Pillars.

**Consequences.** Journeys become a real, opt-in surface (the premium marquee), and the dock's
"Journey → View" now points at `/crew/quests`. Existing auto-enrolled progress rows simply keep
advancing (no backfill needed). The zap-rate is a single tunable constant. Endorsement display
(rank/badges on public profiles) and a DIY journey builder remain the open items in ECONOMY §6–§7.

---

## ADR-141: The endorsement layer — rank is earned by all, shown only for Crew

**Status:** Accepted — shipped. Resolves the two open §6 questions in
[ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md) (member rank display, endorsement set).
Follows [ADR-140](DECISIONS.md).

**Context.** The economy's free→paid story (ECONOMY §1/§4) hinges on a split: everyone
*earns* points and rank, but only Crew are *endorsed* — i.e. have their rank/status shown on
**public** surfaces (their profile, people cards, post flair). Until now rank rendered for
everyone, so the free tier's public profile looked identical to a payer's, blunting the upsell.
Two product calls were open: (a) for a free member's public profile, show an inert rank or none?
(b) which rewards are endorsed vs. merely earned?

**Decision.**
- **Endorsement = Crew+.** One helper, `isEndorsed(role)` (`lib/season-ranks.ts`) =
  `atLeastRole(role, 'crew')`, gates public rank display on the *displayed* member's role. Inert
  in Beta (everyone is Crew); it switches on at Launch, like the member zap-rate (ADR-140).
- **(a) Free member rank → hidden entirely.** No inert chip — a non-Crew public profile simply
  shows no rank (and no rank-progress bar). The rank reappears on upgrade.
- **(b) Endorsement set = rank only (for now).** The rank badge is Crew-gated; **streak,
  achievement count, and gem tier stay visible** for everyone as *earned* stats (streaks are free,
  ECONOMY §5, and the visible earned totals are themselves upsell proof). Cosmetics, custom titles,
  and Journey-completion badges are not yet rendered on public surfaces; when they are, they ride
  the same `isEndorsed` gate.
- **Self always sees their own.** The viewer's own Vault/dashboard/dock shows their earned rank
  regardless — the gate is for *others'* view of a profile, not the owner's.

**Surfaces gated:** the public profile rank chip + progress (`/people/[handle]`), and the
`ProfileFlair` rank badge (circle member lists, post-reply authors). `ProfileFlair` gains an
`endorsed` prop (defaults true).

**Consequences.** At Launch a free member's public profile reads as "Member" with their earned
stats but no rank tier — the deliberate gap. Centralizing on `isEndorsed` means the future
endorsement set (cosmetics/titles/journey badges) is a one-line gate, not a re-litigation. The DIY
journey builder (§7.5) remains the last open ECONOMY item.

---

## ADR-142: The Studio — one reusable creation window, Journey builder as first instance

**Status:** Accepted — shipped (framework + Journey). Spec:
[ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md) §5/§7, [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md)
(§ Studio). Closes ECONOMY §7.5 (DIY journey builder).

**Context.** The open Journeys library (`journey_plans`, ADR-096) had a full data layer +
server actions but only a no-JS, form-per-row author UI — functional, not the expressive
"share yourself with the community" experience journeys are meant to be. And the ask is bigger
than journeys: a **familiar creation window + toolset reused anywhere there's something to make**
(journey, circle, practice, event…), each launched with that instance's create/edit settings.

**Decision.**
- **One shared shell — the Studio window** (`components/studio/studio-window.tsx`): a launchable
  overlay panel (full-screen on mobile) with consistent chrome — eyebrow, Esc/backdrop close,
  scroll-lock, a body the entity fills with its tools, and a sticky footer action bar. Generic
  and reused; entities pass their identity header, tools, and footer.
- **Launchable + deep-linkable.** A launcher (e.g. `NewJourneyButton`) opens the window in place
  anywhere; the full builder also lives at a real URL (`/journeys/[slug]` for the author) so it
  opens standalone and is linkable. `?preview=1` renders the read-only "as others see it" view.
- **Per-entity config is the extension point.** Journey is the first fully-realized builder
  (identity: emoji + accent + title + summary + a markdown "intro" that scales a combo into a
  course; a drag-reorder path of practices with a searchable picker grouped by Pillar, per-step
  cadence + note; a live Pillar-balance meter; autosave; a celebratory share-to-community).
  Circle/practice/event become follow-on builders that mount the same shell with their own tools +
  capability gating ("specific admin create setting per instance").
- **Schema.** `journey_plans` gains optional `intro`, `emoji`, `accent` (identity without an image;
  `cover_image` stays for power users).
- **Trust + gating unchanged.** New JSON server actions (`createJourney`, `saveJourneyMeta`,
  add/remove/reorder/setStep, `setJourneyVisibility`) re-check ownership + Crew gating server-side;
  the FormData actions remain the no-JS fallback. Building a personal journey is free; sharing to
  the library is Crew (free in Beta).

**Alternatives.** A full-page Focus route only (rejected — loses the "launches in place"
feel); a heavyweight drag library (rejected — native HTML5 DnD + up/down buttons covers it with
zero deps); per-entity bespoke editors (rejected — that's the duplication this replaces).

**Consequences.** Journeys are now a genuine self-expression surface, and the next entity's
"create/edit" is a spec against an existing shell, not a new screen. Native DnD is weak on touch,
so up/down controls back it on mobile. The reusable specs for circle/practice/event are the
follow-on work; the shell + journey prove the pattern.

---

## ADR-143: The Studio generalizes by *composition*, not a config engine

**Status:** Accepted — plan of record (foundation + entities build in follow-on PRs). Spec:
[STUDIO.md](STUDIO.md). Extends [ADR-142](DECISIONS.md).

**Context.** The owner wants the Studio window used "anywhere there's something to make"
(circle/practice/event, not just journeys), each launched with that instance's create/edit
settings. The tempting move is a **declarative form-engine**: one config/schema per entity,
rendered generically. But the entities genuinely differ — events have start/end + recurrence,
circles have geo + topic + caps, practices have pillar + cadence + a long markdown body — so a
generic schema would have to grow date pickers, geo pickers, recurrence rules, markdown, drag
lists… i.e. become its own framework to maintain. Today's create surfaces are also inconsistent
(circle = `CreateModal`, practice = inline form + edit page, event = `/events/new` page, journey
= Studio window), which is the duplication to retire.

**Decision.** Generalize by **composition**, mirroring the page framework (one shell · a kit ·
compose per surface):
- **Shared shell** — `StudioWindow` (ADR-142), unchanged.
- **A studio kit** (`components/studio/kit/`), extracted from the journey builder: `StudioIdentity`
  (emoji/accent/title/summary), `StudioSection`/`StudioField` (the label-row grammar),
  `useStudioDraft` (optimistic + debounced autosave + save-state), `StudioFooter`, a generalized
  `StudioLaunchButton`, and `SortableList` (HTML5 DnD reorder, no dep).
- **A thin registry** (`lib/studio/registry.ts`): entity → label · icon · launch · `canCreate` —
  powering a universal "Create" and **one** place for create-gating.
- **Each entity's builder is composed** from the kit + its few bespoke fields, persisting through
  its **already-built** data layer/actions, with **per-instance capability gating resolved from
  `lib/core/capabilities.ts`** (member vs host vs admin tools), not re-decided in the UI.

**Alternatives.** (a) *Declarative form-engine / spec object per entity* — rejected: the field
diversity turns the "config" into a second framework; composition keeps each builder honest and
readable. (b) *Leave each entity's bespoke create surface* — rejected: that's the inconsistency
this removes.

**Consequences.** A new entity's create/edit becomes "compose the kit against an existing data
layer," not a new screen. Migration is one entity per PR (foundation → practice → circle → event
→ universal Create), each replacing the old surface and retiring `components/create-modal.tsx`
once circles move. The risk is kit churn early; we accept it because the journey builder already
validated the pieces.

---
### Decisions intentionally NOT duplicated here

Already fully covered by the repo docs (no ADR needed): the RLS / admin-client
authorization model and server-action error contract (ARCHITECTURE.md); the `profiles`
universal-entity design, soft-hide/suspension, and FK-on-delete conventions (DATABASE.md);
the Circle/Hub/Nexus/Outpost hierarchy and role ladder (GLOSSARY.md); cron, notifications,
email, push, and SEO/AEO (ARCHITECTURE.md + ROADMAP.md / SEO-AEO-PLAN.md).

## ADR-144: Active-Journey progress derived from the practice log (no schema)

**Status:** Accepted · corroborated by `lib/journey-plans.ts`
(`getActiveJourneyProgress`, `weeklyTargetFromCadence`)
**Context:** Members adopt Journey plans (ordered practices across the four domains), but
there was no per-step progress model — BACKLOG §Q reserved the "active Journey on the board"
surface. A dedicated progress table would duplicate signal the practice log already carries.
**Decision:** Derive progress from `practice_logs` — no new tables. A step is "done this
week" when its practice was logged on ≥ `target` of the last 7 days, where `target` is parsed
from the free-text cadence by `weeklyTargetFromCadence` ("Daily"→7, "3x a week"→3,
"Weekly"/monthly/unknown→1, clamped 1–7). The current step is the first off-track item. An
opt-in `{ withCompanions }` counts members of the viewer's active circles on the same plan.
Surfaced on the `/crew/journey` Dashboard tab + the home `JourneyBoard`.
**Consequences:** Logging a Journey's practice advances the Journey and earns the same
zaps/streak the gamification already runs on — one event, no divergence. A future structured
cadence model can replace the parser without changing callers. See ECONOMY-AND-JOURNEYS.md.

## ADR-145: The daily practice streak is the headline streak (derived from the log, no schema)

**Status:** Accepted · corroborated by `lib/practice-streak.ts`
(`derivePracticeStreak`, `getPracticeStreak`, `recordPracticeStreak`) + `lib/streak.ts`
**Context:** The home feed and profile flair render `profiles.current_streak` as an "X day
streak" with day-based milestones (3/7/14/30…), but that column tracked the **weekly**
attendance streak (`streaks` table, 9-day window) — so a 3-week streak displayed as "3 day
streak." Freeze tokens existed in the schema/UI but no code ever awarded or spent them,
milestone checkpoints paid nothing, and there was no "at risk" state. The owner asked for a
strong daily streak alongside the existing weekly rhythms.
**Decision:** Add a **daily practice streak** = consecutive UTC days with ≥1 `practice_logs`
row, derived live from the log (no new table, no backfill, no cron). `profiles.meta.practiceStreak`
augments it with what logs can't express: banked **freeze tokens**, the specific missed days a
freeze has bridged (`frozenDates`), and which **milestones have paid** (exactly-once). A freeze
auto-bridges a **single** missed day on the next log; two missed days reset. Reaching a
milestone pays escalating **zaps** (real-life act → zaps, ADR-139) and banks a freeze at the
Week/Month/Century/Year marks (cap 2). The headline columns `profiles.current_streak` /
`longest_streak` now mean **this** streak — `recordPracticeStreak` owns them, and the weekly
`recordStreakActivity` no longer writes them. The weekly streaks keep their `streaks`-table
home and their own achievements, shown below the daily streak on `/crew/streaks`.
**Consequences:** Every read computes the *effective* streak (a broken streak reads 0; an
unlogged-but-alive one reads "at risk"), so reads stay pure — only a practice log mutates
state. Existing members get a correct streak immediately from their log history. A future move
to a structured store can replace the deriver without changing callers. See
`content/help/the-game/streaks.md`.

## ADR-146: Member progress spine + stage-driven progressive disclosure

**Status:** Accepted · corroborated by `lib/member-progress.ts`
(`getMemberProgress`, `deriveStage`, `gatesFor`) + `app/(main)/feed/page.tsx`
**Context:** Progress signals were scattered — activation (`getOnboardingStatus`), the
daily streak (ADR-145), adopted Journeys (`getActiveJourneyProgress`) and season rank
(`rankForZaps`) each had their own surface, with no single "where am I / what's next"
read and no way to reveal the product gradually. The owner asked for progressive
disclosure driven by strong progress, with the left nav staying fully visible.
**Decision:** Add a **stage spine**: `getMemberProgress()` folds the four signals into a
five-rung **stage** (Newcomer → Finding your feet → Regular → Established → Anchor) via a
pure, monotonic `deriveStage`, and returns the gates to the next stage. The home feed
reads it **once** (the spine also carries the raw onboarding status + Journeys, so the feed
doesn't re-fetch). Stages reveal **surfaces, not nav**: the JourneyBoard shows only the
streak + today's move early, then the resource center (stage ≥ Regular) and the pillar
balance (stage ≥ Established) appear as the member climbs; a `StageStrip` shows the ladder +
next gate, and a one-time `StageCelebration` fires on advance (acknowledged via
`acknowledgeStage`, stored in `profiles.meta.progressStage`, so it shows exactly once).
**Consequences:** Disclosure is one pure function — easy to retune thresholds or add a rung
without touching surfaces. Reads stay pure (the celebration acknowledges itself client-side).
No schema beyond the `meta.progressStage` marker. The crew dashboard and other surfaces can
adopt the same `stageIndex` gate later. See `lib/member-progress.ts`.

## ADR-147: Shared in-app UI primitives + named sub-xs type scale + token-only color

> Renumbered from ADR-143 (2026-06-06): the number collided with a parallel branch's
> Studio "compose, not configure" decision, which keeps ADR-143.

**Status:** Accepted · corroborated by `components/ui/{field,button,dialog}.tsx`,
`lib/utils.ts` (`cn`), and `app/globals.css` (`@utility text-2xs/text-3xs`)
**Context:** A design-system audit found the in-app UI inconsistent: ~40 files hand-rolled
form-field and button class strings, 5+ bespoke modal overlays, ~195 uses of the arbitrary
`text-[10/11px]` size anti-pattern, and raw-palette colors (`indigo-600`, `accent-indigo-600`)
instead of DAWN tokens. No `Button`/`Input`/`Dialog` primitive and no `cn()` helper existed.
**Decision:** Introduce shared primitives + conventions: `Input`/`Textarea`/`Label`
(+ `fieldClasses`/`labelClasses` for a native `<select>`), `Button` (variant × size),
`Dialog` (one backdrop · ESC · scroll-lock · aria overlay shell), and `cn()`. Add named
sub-xs steps `text-2xs` (11px) / `text-3xs` (10px) as `@utility` rules (font-size only, so
no line-height is coupled). In-app colors are DAWN tokens only.
**Consequences:** New code composes these — no hand-rolled fields/buttons/modals, no
`text-[Npx]`, no raw palette. Existing call sites migrate opportunistically (the four admin
settings-modules, `create-modal`, and `compose-lightbox` already do). The marketing kit's
own `Button` (DESIGN-LANGUAGE.md) is a separate surface, unchanged. See PAGE-FRAMEWORK.md §8.

---

## ADR-148: Local Marketplace — a free, no-payment, geolocated exchange (vertical 5)

**Status:** Accepted — foundation shipped. Plan: [DEVELOPMENT-MAP.md](DEVELOPMENT-MAP.md)
Stage B; [PLATFORM-VISION.md](PLATFORM-VISION.md) §verticals. The first **Stage B mission
vertical** (post-gamification/Studio work).

**Context.** The mission's flywheel wants local mutual support — neighbors swapping, giving,
lending, and asking for things — to deepen real-world density (the North Star). It must NOT
become a consumerist storefront, and during the free Beta **no money moves**.

**Decision.** Ship a **Foundation, no-fee, no-in-app-payment** marketplace:
- **`market_listings`** (ADR-148 migration): `kind` ∈ offer/free/lend/request, free-text
  `price_note` (no processing), free-text + optional geo location, an optional `circle_id`
  locality anchor, `status` (active/claimed/closed), `is_demo`. RLS: public reads active; an
  author manages only their own. Reads/writes via the admin handle + app-code authz (the
  practices/journey_plans convention); RLS guards any direct user reads.
- **Connect, don't transact.** There is no checkout. Contact hands off to the member's
  **profile** (where the existing connect/DM affordances + friendship safety gate live) — we
  deliberately do not open unsolicited stranger DMs. Money is arranged offline.
- **Create via the Studio** (`NewListingButton`) — reuses the Studio kit, proving it on a
  third surface. Browse at `/market` (Index template + kind filter); detail at `/market/[id]`
  with owner status/delete controls.
- **Guardrail (ADR-034):** any *future* high-value reward tied to marketplace activity must
  ladder to verified practice; the no-payment v1 keeps reward stakes nil.

**Alternatives.** In-app peer payment (rejected for v1 — open decision #2 confirms *no fee*;
arranging offline keeps trust-&-safety light and the worldview intact). A bespoke listing
inbox (rejected — reuse DMs/profile, don't fork messaging).

**Consequences.** A new mission vertical with minimal trust-&-safety surface (no money).
Follow-ons: precise "near me" geo sort (lat/lng columns already present), listing edit via the
Studio window (status/delete shipped), images, and a density read-model feeding "where to seed
the next third space."

---

## ADR-149: Absorbing `/admin/*` into the console — the deep-link→module recipe + `IN_PLACE` map

**Status:** Accepted — shipped (14 surfaces). Implements [ADR-137](DECISIONS.md) (the console) /
[ADR-138](DECISIONS.md) (two surfaces) / [ADR-133](DECISIONS.md) (Phase 2). Spec:
[EMBEDDED-ADMIN.md §6–7](EMBEDDED-ADMIN.md).

**Context.** ADR-137/138 set the target — *no entity admin in `/admin/*`; administer every page
in place*. That left the **migration mechanics** undecided: how to move ~20 `/admin/*` surfaces
into the console **one at a time**, each independently shippable, without rewriting the working
admin UIs or colliding with other agents working the same tree. The console already renders the
role-gated catalog (`visibleLinks`) as deep-links bucketed into the 9-category spine
(`slotForHref`); the question was how a deep-link becomes an in-place module.

**Decision.** Port each surface with a fixed, low-risk **recipe** and register it in **one place**:
- **Recipe (4 parts).** (1) a **loader util** that mirrors the page's data fetch (the page can
  adopt it to stay DRY); (2) a gated **`'use server'` action** (`load*Admin`) that re-checks the
  caller (`getCallerProfile` + `atLeastRole`, matching the page's gate) and returns `null`
  otherwise; (3) a **client module** that fetches via the action on open and **reuses the existing
  admin components** — never a rewrite; (4) one entry in the console's **`IN_PLACE` map**.
- **`IN_PLACE` has three modes.** **Replace** — an `href` lists the catalog link the module
  supplants (the link drops, the module renders). **Additive** — no `href`; the module heads the
  category *above* the kept links (e.g. Insights summary over its dashboards). **Stacked** —
  `hrefs[]`; a category holds several modules that each **self-gate server-side** and render `null`
  when the role lacks access, so the stack degrades cleanly (People = Members + Roles; Spaces =
  Circles + Channels + Events + Hubs + Nexuses; Engage = Gamification + Crew tasks).
- **Inlined lists get extracted, not duplicated.** Where a surface rendered its admin list inline
  in the page (Channels, Events), the list moves to a **shared presentational component**
  (`ChannelsAdminList` / `EventsAdminList`) consumed by **both** the page and the module — server
  actions (`archiveChannel`, `toggleCancelEvent`) reused as form actions from the now-client list.

**Alternatives.** Big-bang rewrite of all admin UIs as modules (rejected — high risk, not
shippable incrementally, collision-prone). A server-composed `@admin` parallel-route slot *first*
(deferred — it touches the shell/layout; the on-open client fetch ships value now and the slot can
swap in behind the same modules later). Duplicating inlined lists into module-only copies (rejected
— drift; extract-and-share keeps one source).

**Consequences.** 14 surfaces absorbed with a uniform, reviewable shape (one PR per surface);
adding the next is a loader + action + module + one map entry. Modules self-gate, so the same
stacked category serves every tier. The `@admin` server slot remains the optimization to land
next (modules wire to the client dock via capability-gated fetch until then). Remaining in
`/admin/*`: Vera (needs its config form extracted first), AI controls, the Insights dashboards —
then the route group retires per ADR-138. Operator guide → Notion.
