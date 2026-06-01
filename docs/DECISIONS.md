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
### Decisions intentionally NOT duplicated here

Already fully covered by the repo docs (no ADR needed): the RLS / admin-client
authorization model and server-action error contract (ARCHITECTURE.md); the `profiles`
universal-entity design, soft-hide/suspension, and FK-on-delete conventions (DATABASE.md);
the Circle/Hub/Nexus/Outpost hierarchy and role ladder (GLOSSARY.md); cron, notifications,
email, push, and SEO/AEO (ARCHITECTURE.md + ROADMAP.md / SEO-AEO-PLAN.md).
