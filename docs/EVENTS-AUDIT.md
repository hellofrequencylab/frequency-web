# Events System: Audit & Status (2026-06-09)

> Full verification sweep of the Events build (P0 + Wave 2) against
> [`EVENTS-SYSTEM.md`](EVENTS-SYSTEM.md): completeness, **security**, **SEO/AIO**, and
> integration. Legend: ✅ done · ◑ partial · ❌ not built · 👤 needs a human/ops action.

## Verdict up front

**P0 (core loop) and Wave 2 (Circle Field, ticket tiers/PWYC, refunds, matching + AI blurbs)
are built and genuinely wired.** Every new module is reachable from a real surface, **no
orphaned code**. This pass also **hardened security** (DB-level capacity + atomic inventory) and
**closed the SEO/AIO gaps** on the public surface. What remains is exactly what the spec parked:
SMS (blocked on a founder decision), the post-event social tables, and discovery polish, plus
two ops tasks only you can run (apply migrations + regen types). Honest bottom line: the system is
**secure and SEO/AIO-ready for what's shipped**, not yet feature-complete against the full spec.

---

## 1. Security: audited + hardened ✅

Audit found the build mostly solid: RLS enabled on every new table; money/ledger tables
(`event_ticket_types`, `event_tickets`, `circle_field_transactions`) are **service-role-write-only**;
Stripe webhook signature verified; refunds authz-gated; AI blurb is read-only + injection-bounded
(no tools, caller-scoped cache). Three findings were **fixed this pass** in
`supabase/migrations/20260610030000_events_security_hardening.sql`:

| ID | Finding | Fix |
|---|---|---|
| ⚠️ M1 | Paid-tier `sold` was a non-atomic read-modify-write (lost-update / oversell) | ✅ Atomic `adjust_ticket_sold()` RPC (`sold = sold + delta`, clamped); `lib/billing/tickets.ts` now calls it |
| ⚠️ M2/M3 | RSVP capacity enforced only in app code (a client could write `status='going'` directly past capacity) | ✅ `enforce_event_rsvp_capacity()` BEFORE trigger coerces over-capacity → `waitlist` at the DB layer |
| 🟡 L2 | Two FK columns unindexed (cascade-delete scans) | ✅ Indexes on `event_blurb_cache(event_id)`, `circle_field_transactions(profile_id)` |

**Residual (documented, not blocking):**
- 🟡 **L1: `events.visibility` is currently decorative.** RLS was deliberately left unchanged
  (events are circle-scoped today), so `visibility='private'` does *nothing* yet and `public`/
  `unlisted` aren't surfaced. **No data leaks** (everything stays within the circle). Must extend
  the events SELECT policy to honor `visibility` **before** any standalone/public-event UI ships.
- ⚠️ **Optimistic oversell at capacity** (paid + free): N concurrent buyers can pass the
  remaining-spots gate at checkout. Acceptable at current volume; a reservation/hold step is the
  real fix when volume warrants.
- ⚙️ **Supabase advisors not run.** `get_advisors` needs a `project_id` the audit couldn't access.
  Run security + performance advisors once the migrations are applied (see §5).

---

## 2. SEO / AIO: gaps closed ✅

**Key correction:** there are two event surfaces with *opposite* SEO posture by design.

| Surface | Crawlable | Correct posture |
|---|---|---|
| In-app `app/(main)/events/*` | 🚫 No (auth-walled + `robots.ts` disallow; renders exact venue) | **No** metadata/JSON-LD, and must stay that way (privacy) |
| Public `app/discover/events/*` | ✅ Yes (city-level only, via privacy-safe RPCs) | The indexable surface; already had metadata + `eventSchema` + sitemap |

The public surface was ~80% there; **fixed this pass:**

| Gap | Fix |
|---|---|
| No Twitter Card on library + detail | ✅ Added `twitter: summary_large_image` to both |
| `eventSchema` missing `image` (Google-required) | ✅ Added `image` (site OG fallback) in `lib/jsonld.ts` |
| Breadcrumb "Events" pointed to `/discover` | ✅ Now `/discover/events` |
| Meta description not truncated | ✅ Truncated to ~155 chars on the detail page |

**Verified good (no action):** detail `generateMetadata` + canonical, `eventSchema` +
`breadcrumbSchema` rendered, events in `app/sitemap.ts`, `robots.ts` disallows the in-app surface,
public RPCs never expose venue/coords (city-level only), and answerable what/when/where/who is
server-rendered for answer engines.

**Remaining (tracked, lower priority):** a **dynamic per-event OG image** (`app/discover/events/
[slug]/opengraph-image.tsx`, clone `app/opengraph-image.tsx`), the biggest visual win; and an
**`offers` block** in `eventSchema` once the public RPC exposes `price_cents` (per DISCOVER-LAYER).

---

## 3. Completeness: status by area

**Built & wired ✅:** events schema (capacity/visibility/category/energy_tag) · RSVP + waitlist +
auto-promote · verified check-in via the idempotent engagement pipeline (awards Zaps) · two-currency
gamification (RSVP→Gems, attend→Zaps, host→Zaps+streak) · Circle Field (ledger+trigger, season
reset, `resonance_public` gating) · ticket tiers + fixed/free/pwyc/sliding/donation + per-tier
inventory · refunds (verified `reverse_transfer`+`refund_application_fee`) + `charge.refunded`
webhook · 3-touch reminder cron (7d→24h→2h) · event embeddings + embed cron · hybrid matching
(0.45/0.35/0.20) · cold-start-safe "For You" lane · Haiku "why you'd vibe" blurbs · faceted library
· warm proof + one-tap add-to-calendar · admin tier management · Index/Detail/Focus on the page
framework. **No orphaned exports.**

**Partial ◑ / Not built ❌: the honest gap list (ranked by value):**

| # | Item | Status | Note |
|---|---|---|---|
| 1 | **Confirmation touch on RSVP** | ❌ | Cron does 7d/24h/2h; the highest-intent moment (RSVP itself) sends no email. Small delta on existing email infra. |
| 2 | **Cancel → bulk-refund → notify** | ◑ | `cancelEvent` only flips `is_cancelled`; paid attendees aren't auto-refunded. Primitives (`refundTicket`) exist; needs composing into the cancel path. |
| 3 | **Free-tier claim persistence** | ✅ | A `free` tier claim now records a normal "going" RSVP via `setRsvpStatus` (ADR-410): rides event capacity/waitlist + the first-RSVP gem/confirmation. No `event_tickets` row (event capacity governs, not per-tier `quantity`). |
| 4 | **Activity feed / recap album / cohosts** (`event_posts`/`event_media`/`event_cohosts`) | ❌ | Post-event engagement loop unbuilt (spec §2.5). |
| 5 | **SMS subsystem** + prep (`sms_*` prefs, `sms` consent scope, `sendSms` guard) | ❌ / 👤 | Blocked on the founder decision below; even the EIN-independent groundwork isn't laid yet. |
| 6 | **Discovery polish** | ❌ | Distance/map facet, filtered ICS subscription feeds, organizer profiles, calendar-follow, connector suggestions. |
| 7 | **TBD timing · plus-ones UI · "maybe" control · approval RSVPs** | ❌/◑ | `plus_ones` column + `maybe` status exist but no UI writes them. |
| 8 | **Per-section `<Suspense>` on the Index** | ◑ | Acknowledged perf debt. |
| 9 | **Public/unlisted event RLS** | ❌ | Tied to the standalone-events decision (§1 L1). |

---

## 4. Integration verification ✅

`embedEvent` ← `createEvent` · `awardCircleFieldForCheckin` ← `checkInEvent` ·
`scoreEventsForViewer`/`eventBlurb` ← "For You" lane · `getCircleFieldStanding` ← circle page ·
ticket actions ← admin editor + event page · both crons registered in `vercel.json` with auth
guards. Everything built is reachable; the only dormant items are the `plus_ones` column and the
`maybe` status (schema-ahead-of-UI, not dead code).

---

## 5. 👤 Founder / ops action items: what only you can complete

| # | Action | Why it's blocked on you | Unblocks |
|---|---|---|---|
| 1 | **Apply the 5 new migrations to the live DB** (`20260609230000`, `20260610000000/010000/020000/030000`) then run `supabase gen types typescript --linked > lib/database.types.ts` | Needs prod/branch DB credentials; we use untyped casts until types are regenerated | All event/ticket/Field/matching features going live + removing the casts |
| 2 | **Decide the legal entity + EIN** for the Twilio + Stripe accounts | Legal/business decision | A2P 10DLC registration **and** Stripe payouts |
| 3 | **Twilio: register A2P 10DLC brand + campaigns** ("event reminders", "transactional"); set Messaging Service + env flags | Requires #2 + business identity docs; 1 to 3 wk carrier lead time | The entire SMS channel |
| 4 | **Stripe: activate Connect payouts:** flip `host_payouts_enabled` ON when ready; confirm `STRIPE_*` env (incl. `STRIPE_PLATFORM_FEE_PCT`) for the chosen entity | Operator switch (ADR-178); ticketing ships dormant | Paid tickets + tips going live |
| 5 | **Run Supabase security + performance advisors** after #1 | Needs DB access we couldn't reach in-session | Confirms no missing-RLS/index lints |
| 6 | **Default refund-policy wording** per event type | Product/policy decision | Refund UX copy |
| 7 | (Optional) **Decide standalone vs circle-scoped events** | Product + moderation scope decision | Public/unlisted discovery + the `visibility` RLS (§1 L1) |

---

## 6. How to improve the process (suggestions)

1. **Give parallel build-agents isolated git worktrees.** Sharing one working tree caused
   uncommitted-change churn and one cross-file type seam I had to repair at integration. Worktrees
   (or a strict "one file owner, central commit" rule, which mostly held) remove that class of
   friction.
2. **Apply migrations to a Supabase preview branch + regen types as part of the loop**, instead of
   the `as unknown as SupabaseClient` cast convention. The casts keep the build green but **hide
   real type errors** on new columns (one agent's missing cast only surfaced at central tsc). Typed
   access would have caught it at author time.
3. **Make agents run a scoped `tsc --noEmit` before reporting done.** Most did; the gaps that
   reached integration were exactly from the ones that didn't.
4. **Bake DB-level invariants in from the start for money/capacity** (atomic inventory, capacity
   triggers) rather than relying on app logic; this audit added them retroactively (§1).
5. **Keep the dormant-flag pattern** (`payoutsLive()` / `host_payouts_enabled`): shipping risky
   subsystems behind an operator switch made the whole money path safe to build and review unmerged.
6. **Up-front function-signature contracts** for cross-agent calls (e.g. `awardCircleFieldForCheckin`,
   `embedEvent`) worked well; keep doing that; it's why integration was clean despite parallelism.
7. **Run `get_advisors` in CI** once a project is linked, so missing-RLS/index lints are caught
   automatically, not in a manual audit.

---

## Change log for this audit pass
- `supabase/migrations/20260610030000_events_security_hardening.sql`: atomic ticket inventory,
  DB-level RSVP capacity guard, 2 indexes.
- `lib/billing/tickets.ts`: atomic `adjust_ticket_sold` RPC.
- `lib/jsonld.ts`: `Event` schema `image`.
- `app/discover/events/[slug]/page.tsx`, `app/discover/events/page.tsx`: Twitter cards, breadcrumb
  fix, description truncation.
- `tsc` + `eslint` clean; 605 tests pass (3 pre-existing `stripe`-dep env failures, unrelated).

## 2026-06-10 update: B-2/B-3/B-4 merged

The §3 gap list is largely closed. Shipped via PRs #498/#499/#500:
- **#1 confirmation-on-RSVP, #7 maybe/plus-ones:** closed by interim work before this batch.
- **#2 cancel → bulk-refund → notify:** ✅ (PR #499): `cancelEvent` refunds all succeeded tickets
  and emails guests.
- **#4 activity feed / recap album / cohosts:** ✅ (PR #498).
- **#6 discovery polish** (ICS subscription, organizer profiles, map, connectors): ✅ (PR #500).
- Host **blast composer** + **Manage screen** + **host-marked check-in:** ✅ (PR #499).

Canonical remaining list: SMS (§5, EIN-blocked) · `<Suspense>` on the
Index · §11 metrics instrumentation · drop the `as unknown as SupabaseClient` casts. **Ops still
pending: apply migrations `20260613100000/110000/120000`, regenerate `database.types.ts`, run
Supabase advisors.**
