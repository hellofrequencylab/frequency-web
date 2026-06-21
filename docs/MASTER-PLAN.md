# Master plan: one consolidated, ordered work list

> **The answer, first.** ✅ **DONE.** Entity Spaces Phases 0 to 3 plus the tenancy hardening sweep
> are shipped and live (ADR-320 to ADR-338), and the **48 independently-shippable work items** in
> this plan have now all landed across the seven streams: Hardening, UX/UI Polish, Entity-role
> Admin and Controls, Janitor / Staff, SEO/AIO, Security, and Docs. The entity-role Admin work is
> ADR-339 to ADR-344; the website-changes program that ran on top is ADR-345 to ADR-349 (see
> [`WEBSITE-CHANGES-PLAN.md`](WEBSITE-CHANGES-PLAN.md) §8a). Only the **Held** money / white-label /
> native phases remain (§11). Every item below was small enough to land as ONE PR, workable one at a
> time, named its files, and flagged its file overlaps so disjoint ones ran in parallel. This doc is
> the single execution list; it links to the deep specs rather than repeating them.

**Status:** ✅ SHIPPED. Prepared 2026-06-20; executed 2026-06-20 to 2026-06-21. All 48 items across the seven streams landed (the entity-role Admin stream is ADR-339 to ADR-344; the website-changes program that followed is ADR-345 to ADR-349, tracked in [`WEBSITE-CHANGES-PLAN.md`](WEBSITE-CHANGES-PLAN.md) §8a). The only carried items are the Held money / white-label / native phases (§11). No code in this doc.
**Canon obeyed:** [`AGENTS.md`](../AGENTS.md) · [`docs/NAMING.md`](NAMING.md) ·
[`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md) (no em or en dashes) ·
[`docs/PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md) (compose, never author) ·
[`docs/PRESENTATION.md`](PRESENTATION.md) · [`docs/THEME.md`](THEME.md) (tokens, no hex).
**Status legend:** ✅ done / passing · ⏳ in progress · ⚠️ needs attention · 🔴 blocker.

---

## 1. Status snapshot

| Area | State | Evidence |
|---|---|---|
| Tenancy spine (Phase 0) | ✅ shipped, live | `space_members` / `space_invites`, `space_id` ownership FKs + read/write isolation, `spaces.visibility`/`plan`/`entitlements` (ADR-320 to ADR-322, ADR-328/329/331) |
| Streamline (Phase 0.5) | ✅ shipped | `page_settings` re-keyed to the space layer, AI gateway consolidation, kit / `ui/Dialog` consolidation (ADR-318/319/323) |
| Entity profiles (Phase 1) | ✅ shipped | Five-role profile = Detail template + registered entity modules at `/spaces/<slug>`; create wizard + owner Focus settings; Practitioner booking v1 + Business memberships v1; per-space Vera draft seam (ADR-323 to ADR-327, ADR-330) |
| Per-space QR + CRM + check-in (Phase 2) | ✅ shipped | `qr_codes`+`splash`, additive `space_id` CRM, `client_notes`, Event Space check-in (ADR-332/333/334) |
| Per-space email (Phase 3) | ✅ shipped | Fail-closed send backbone + composer + deliverability on Resend (ADR-335/336/337) |
| Tenancy hardening sweep | ✅ shipped | Default-to-root extension, FK covering indexes, merged `space_members` SELECT policy (ADR-338) |
| Entity-role Admin + Controls (this plan's streams) | ✅ shipped | One canonical role-type set, entity-role preview, Lab + Partner blueprints, Organization donations / Coaching enrollment / Event Space ticketing owner controls (ADR-339 to ADR-344); the full 48-item list landed |
| Website-changes program (post boxes · practice un-log · Movement timer · settings drawer · mega-menu · template coverage) | ✅ shipped | ADR-345 to ADR-349; PRs #953 to #961 ([`WEBSITE-CHANGES-PLAN.md`](WEBSITE-CHANGES-PLAN.md) §8a) |
| Money / commerce (Phase 4) | 🔴 Held | Not planned for execution here (see §11) |
| White-label TLS / Puck micro-site (Phase 5) | 🔴 Held | Not planned for execution here (see §11) |
| Native apps / premium AI infra (Phase 6) | 🔴 Held | Not planned for execution here (see §11) |
| `app/(main)/error.tsx` token | ✅ fixed | The catch-all member error screen's undefined `text-fg-secondary` token was corrected (item UX-01, shipped) |

**What is genuinely strong already (do not rework):** the central rail registry
(`lib/layout/page-chrome.ts`) with zero path-sniffing in the shell; full template adoption and
`PageHeading` + `EmptyState` discipline on member surfaces; the single-shell entity-profile
design (one `DetailTemplate` shell renders all five roles); the global `:focus-visible` ring;
accessible mobile drawers and tab bar. The polish work below is a focused defect set, not a
rewrite.

---

## 2. How to read this plan

Every item is one row in its stream table plus a detail block with:

- **`id`** (stream-NN), **title**, **scope** (what ships), **key files**, **acceptance**, **size**
  (S / M / L), **deps**, and **file overlap** (which other item ids touch the same files, so a
  batcher can pick disjoint ones for parallel agents).
- **Parallel-safety rule:** two items are safe to run at once when their **key files** do not
  intersect. Each detail block names the overlap set. Items marked **`overlap: none`** are
  always safe to parallelize.

The recommended global order is **Hardening first** (it is mostly small and de-risks the rest),
then **Entity-role Admin** and **UX Polish** in parallel tracks (they touch different trees),
with **SEO**, **Security**, **Janitor**, and **Docs** woven in as their deps clear.

> ✅ **All streams shipped (2026-06-20 to 2026-06-21).** Every item in the stream tables below
> (Streams A to G, all 48) has landed; the rows are kept as the execution record, not a backlog.
> The Entity-role Admin stream (HARD-01/02, ADMIN-01 to ADMIN-05, JAN-01) is captured in ADR-339
> to ADR-344. The website-changes program that ran on top (post boxes, practice un-log + anti-cheat,
> the Movement timer, the settings drawer + QR & Share split, the Manage mega-menu, and the broad
> template / `<PageModules>` coverage standard) is ADR-345 to ADR-349, logged in
> [`WEBSITE-CHANGES-PLAN.md`](WEBSITE-CHANGES-PLAN.md) §8a. Only the Held money / white-label /
> native phases (§11) remain.

---

## 3. Stream A: Hardening

> Type-system truth, dead-seam cleanup, and the few correctness gaps the entity-spaces audits
> surfaced. Small, high-leverage, low-risk. Source: the entity-role audit, ADR-338, and
> `A-PLUS-ROADMAP.md` §2 / §9.

| id | Title | Size | Overlap |
|---|---|---|---|
| HARD-01 | Add `event_space` to the `SpaceType` union and drop the cast | S | HARD-02, ADMIN-01 |
| HARD-02 | Reconcile the role-type sources of truth (`lab`/`partner` vs `event_space`) | S | HARD-01, ADMIN-05 |
| HARD-03 | Drop remaining `as unknown as` row casts outside events | S | none |
| HARD-04 | Prune the confirmed dead / unwired seams or wire them | S | none |
| HARD-05 | Profile zap-sum via a SQL aggregate | S | none |

**HARD-01 - Add `event_space` to the `SpaceType` union and drop the cast**
Scope: `event_space` is a live role (ADR-325) but is absent from the `SpaceType` union, forcing
a `(space.type as string) === 'event_space'` cast in the settings hub. Add the member to the
union and remove the cast.
Key files: `lib/spaces/types.ts`, `app/(main)/spaces/[slug]/settings/page.tsx`.
Acceptance: `SpaceType` lists all live role types; no `as string` cast remains for the
event_space branch; `tsc` clean; existing tests pass.
Size: S. Deps: none. Overlap: HARD-02 (same `types.ts`), ADMIN-01 (same settings hub).

**HARD-02 - Reconcile the role-type sources of truth**
Scope: the seven content roles are split across two files: the `SpaceType` union has
`lab`/`partner` but not `event_space`; `lib/spaces/blueprints.ts` has `event_space` but no
`lab`/`partner` blueprint. Decide the canonical set, document it in one place, and make the two
agree (this is the design decision that gates ADMIN-05).
Key files: `lib/spaces/types.ts`, `lib/spaces/blueprints.ts`, `docs/SPACES.md`.
Acceptance: one documented canonical role set; the union and the blueprint registry agree on
which types are user-provisionable; a short note in `SPACES.md` records the decision and an ADR
captures the rationale.
Size: S. Deps: HARD-01. Overlap: HARD-01, ADMIN-05.

**HARD-03 - Drop remaining `as unknown as` row casts outside events**
Scope: continue the A-PLUS-ROADMAP §2 cleanup: remove per-row `as unknown as` casts in digest,
journey-plans, partners, and similar readers now that the generated types line up. Per-file,
`tsc`-gated.
Key files: per-file under `lib/` (digest, journey-plans, partners). Avoid `lib/events/*` (done).
Acceptance: the targeted casts removed; `tsc` + eslint + tests green; no behavior change.
Size: S. Deps: none. Overlap: none.

**HARD-04 - Prune or wire the confirmed dead / unwired seams**
Scope: resolve the located dormant seams flagged in `A-PLUS-ROADMAP.md` §9 that are pure
in-repo decisions: the `savePageDraft` server action with no caller
(`app/edit/actions.ts`), the stale "push hasn't shipped" comment plus its dead disabled branch
(`lib/notification-preferences.ts`), and the `project` walkthrough `UNWIRED_TRIGGERS` entry
(`lib/walkthroughs.ts`). Either wire each to its UI or remove it with a one-line rationale.
Key files: `app/edit/actions.ts`, `lib/notification-preferences.ts`, `lib/walkthroughs.ts`.
Acceptance: each seam is either wired or removed; no orphan exports remain; `tsc` + eslint clean.
Size: S. Deps: none. Overlap: none.

**HARD-05 - Profile zap-sum via a SQL aggregate**
Scope: replace the per-row zap tally on the profile with a single SQL aggregate (A-PLUS §6).
Key files: the profile zap-sum reader in `lib/` plus its caller in the profile page.
Acceptance: one aggregate query replaces the per-row tally; the displayed sum is unchanged in a
spot check; no N+1.
Size: S. Deps: none. Overlap: none.

---

## 4. Stream B: UX/UI Polish

> The whole app to the A+ bar. Findings are from a full read of the shell, the five templates,
> the entity profiles, and the core member surfaces. The known header-overflow bug (horizontal
> scroll / right-side gap) is being fixed separately and is excluded here.

| id | Title | Size | Overlap |
|---|---|---|---|
| UX-01 | Fix the broken token in the app-wide error boundary | S | UX-02 |
| UX-02 | Rebuild the member error boundary on `EmptyState` | M | UX-01 |
| UX-03 | Add the missing `loading.tsx` skeletons (member routes) | L | none |
| UX-04 | Add the root entity-profile (About tab) loading skeleton | S | UX-12 |
| UX-05 | Segment-level `error.tsx` for the heaviest data routes | M | UX-02 |
| UX-06 | Normalize the right-rail `text-[13px]`/`text-[9px]` sizes | M | none |
| UX-07 | Normalize the repeated date-chip / count-badge arbitrary sizes | M | none |
| UX-08 | Normalize off-scale body and eyebrow sizes | M | none |
| UX-09 | De-hex the Puck page editor chrome | S | none |
| UX-10 | Migrate the public discover pages onto `IndexTemplate` + `PageHeading` | M | SEO-02 |
| UX-11 | Adopt `PageHeading` / `FocusTemplate` on the claim / upgrade / join pages | M | none |
| UX-12 | Extract the dimmed-Beta-content treatment into one utility | S | UX-04 |
| UX-13 | Verify the onboarding induction step gating (six h1 elements) | S | none |
| UX-14 | Add explicit focus and press states to the kit cards | S | none |
| UX-15 | Centralize the shell theme-color hex behind the token source | S | none |

**UX-01 - Fix the broken token in the app-wide error boundary**
Scope: `app/(main)/error.tsx` uses `text-fg-secondary`, which is undefined (no `fg-*` token
exists; the real tokens are `text-muted` / `text-subtle`), so the catch-all member error screen
renders in an inherited / default color. Swap to the correct token.
Key files: `app/(main)/error.tsx`.
Acceptance: the error message renders in the intended muted token; no undefined utility remains.
Size: S. Deps: none. Overlap: UX-02 (same file). Highest impact; do first.

**UX-02 - Rebuild the member error boundary on `EmptyState`**
Scope: the boundary is a hand-rolled `div` with a bare underlined button, no icon, no "go home"
path. Rebuild it from `EmptyState` with a primary "Back to feed" action, per the kit.
Key files: `app/(main)/error.tsx`, `components/ui/empty-state.tsx` (read only).
Acceptance: the boundary composes `EmptyState`; offers a primary recovery action; passes the
CONTENT-VOICE §10 copy check (no em or en dashes). Size: M. Deps: UX-01. Overlap: UX-01, UX-05.

**UX-03 - Add the missing `loading.tsx` skeletons (member routes)**
Scope: roughly ten high-traffic member route groups have no `loading.tsx`, so they paint blank /
shift layout on slow fetches. Add per-route skeletons copying the established `SectionHeader` +
pulse-card pattern.
Key files: `app/(main)/{people,practices,journeys,settings,connections,network,library,market,broadcast,on-air}/loading.tsx` (new).
Acceptance: each route shows a dimension-matched skeleton on slow load; no CLS; matches the
existing skeleton idiom. Size: L (can split per route into S sub-PRs). Deps: none. Overlap: none.

**UX-04 - Add the root entity-profile (About tab) loading skeleton**
Scope: the four profile sub-tabs each have a `loading.tsx`; the root About tab does not, and its
Suspense fallback is `null`, so the body paints blank. Add a `loading.tsx` returning the
profile-body skeleton.
Key files: `app/(main)/spaces/[slug]/loading.tsx` (new), `app/(main)/spaces/[slug]/layout.tsx` (read).
Acceptance: the root profile tab shows the same body skeleton as its siblings.
Size: S. Deps: none. Overlap: UX-12 (the `h-[58px]` skeleton height it shares).

**UX-05 - Segment-level `error.tsx` for the heaviest data routes**
Scope: only one nested error boundary exists, so a failure anywhere in the member area replaces
the whole content column. Add segment-level `error.tsx` for the heaviest data routes (feed,
events, spaces) so a localized failure degrades gracefully.
Key files: `app/(main)/{feed,events,spaces}/error.tsx` (new).
Acceptance: a thrown error in one segment renders a scoped fallback, not the app-wide one; each
fallback composes `EmptyState`. Size: M. Deps: UX-02 (shares the fallback pattern). Overlap: UX-02.

**UX-06 - Normalize the right-rail arbitrary sizes**
Scope: `components/sidebar/rail-panels.tsx` has ~10 arbitrary `text-[13px]` and `text-[9px]`
sizes; the rail is on every member page, so this is the highest-visibility offender. Snap to the
named scale (`text-xs`/`text-sm`/`text-3xs`) or add one named step (ADR-147 anti-pattern).
Key files: `components/sidebar/rail-panels.tsx`.
Acceptance: no `text-[Npx]` remains in the file; visual diff is neutral. Size: M. Deps: none.
Overlap: none.

**UX-07 - Normalize the date-chip / count-badge arbitrary sizes**
Scope: the "month chip / unread count" micro-pattern hard-codes `text-[8px]`/`text-[9px]` in ~15
places. Map them to `text-3xs` or extract a shared `DateChip` / `CountBadge` primitive so the
size lives in one place.
Key files: `components/feed/{feed-list,profile-feed,post-card,composer}.tsx`,
`components/events/upcoming-widget.tsx`, `components/discover/cards.tsx`,
`components/search/search-overlay.tsx`, `components/messages/messages-popover.tsx`,
`components/layout/notification-bell.tsx`, `components/compose/new-group-dm-compose.tsx`,
`components/marketing/blocks.tsx`, `app/page.tsx`.
Acceptance: the chip / badge sizes are named or live in one shared primitive; no `text-[Npx]` in
the listed chip usages. Size: M. Deps: none. Overlap: none.

**UX-08 - Normalize off-scale body and eyebrow sizes**
Scope: `text-[15px]` body copy (walkthroughs, onboarding, compose, vera-profile, event compose)
and `text-[0.65rem]`/`text-[1.625rem]` eyebrow / big-number sizes (sequence wizard, admin dash,
spark charts) are off-scale. Snap to named tokens or add `text-stat` / `text-eyebrow`.
Key files: `components/walkthroughs/slide.tsx`, `components/onboarding/{chores-overlay,vera-lightbox}.tsx`,
`components/people/vera-profile.tsx`, `components/events/{event-activity,event-dispatch-compose}.tsx`,
`components/feed/composer.tsx`, `components/sequences/sequence-wizard.tsx`,
`app/(main)/pages/sequences/[slug]/edit/form.tsx`, `components/admin/dash.tsx`,
`app/(main)/admin/page.tsx`, `app/(main)/admin/growth/page.tsx`, `components/admin/spark-charts.tsx`.
Acceptance: the listed arbitrary sizes are replaced with named scale tokens; visual diff neutral.
Size: M. Deps: none. Overlap: shares `feed/composer.tsx` with UX-07 (coordinate; sequence them).

**UX-09 - De-hex the Puck page editor chrome**
Scope: `components/page-editor/editor.tsx` uses raw hex in `text-[#a33]`, `text-[#7a1f1f]`,
`text-[#555]`, plus `text-black`. Replace with `text-danger` / `text-muted` / `text-text`.
Key files: `components/page-editor/editor.tsx`.
Acceptance: no raw hex or `text-black` in the file; admin editor chrome reads on-token in both
modes. Size: S. Deps: none. Overlap: none.

**UX-10 - Migrate the public discover pages onto `IndexTemplate` + `PageHeading`**
Scope: `app/discover/practices`, `app/discover/partners`, and the Pillar page hand-roll an `h1`
plus a bare grid instead of composing `IndexTemplate` + `PageHeading`. These are public SEO
surfaces, so the header drift is visible. Migrate them.
Key files: `app/discover/practices/page.tsx`, `app/discover/partners/page.tsx`,
`app/discover/practices/pillar/[slug]/page.tsx`.
Acceptance: each page composes `IndexTemplate` + `PageHeading`; exactly one h1; no hand-rolled
grid header. Size: M. Deps: none. Overlap: SEO-02 (same discover tree; sequence them).

**UX-11 - Adopt `PageHeading` / `FocusTemplate` on the claim / upgrade / join pages**
Scope: `app/(main)/upgrade`, `app/join/[token]`, and `app/events/claim/[token]` hand-roll an h1
outside the `PageHeading` grammar. Adopt `PageHeading` or `FocusTemplate`.
Key files: `app/(main)/upgrade/page.tsx`, `app/join/[token]/page.tsx`,
`app/events/claim/[token]/page.tsx`.
Acceptance: each page uses the kit heading grammar; one h1; type scale matches canon.
Size: M. Deps: none. Overlap: none.

**UX-12 - Extract the dimmed-Beta-content treatment into one utility**
Scope: the recede treatment (`opacity-[0.72]` + `grayscale-[0.5]`) is duplicated across four card
components as arbitrary values. Define one `.dimmed` utility / token and the skeleton size used
by the profile hero, then consume it.
Key files: `components/cards/entity-card.tsx`, `components/people/contact-card.tsx`,
`components/profile/{profile-cover,profile-avatar}.tsx`, `app/(main)/spaces/[slug]/layout.tsx`,
`app/globals.css`.
Acceptance: the recede treatment lives in one place; the four cards consume it; the `h-[58px]`
skeleton uses a named size. Size: S. Deps: none. Overlap: UX-04 (shared skeleton height),
UX-14 (same `entity-card.tsx`).

**UX-13 - Verify the onboarding induction step gating (six h1 elements)**
Scope: `app/onboarding/beta/induction.tsx` mounts up to six `h1` tags. Verify the step gating
unmounts inactive screens (acceptable) or, if any two coexist, demote to `h2` / render only the
active step.
Key files: `app/onboarding/beta/induction.tsx`.
Acceptance: at most one h1 is in the DOM at a time; document-outline is clean in a screen-reader
spot check. Size: S (verify) to M (fix if needed). Deps: none. Overlap: none.

**UX-14 - Add explicit focus and press states to the kit cards**
Scope: the high-reuse browse cards rely solely on the zero-specificity global `:focus-visible`
rule and have no `active:` press state. Add explicit `focus-visible:ring` and a subtle
`active:` affordance on the kit primitives so they are self-defending and feel responsive.
Key files: `components/cards/entity-card.tsx`, `components/cards/person-card.tsx`,
`components/ui/section-header.tsx`.
Acceptance: each primitive carries its own focus ring and a press state; `motion-reduce` honored.
Size: S. Deps: none. Overlap: UX-12 (same `entity-card.tsx`).

**UX-15 - Centralize the shell theme-color hex behind the token source**
Scope: `components/layout/app-shell.tsx` sets `meta[name=theme-color]` to literal hex values that
duplicate `--color-canvas` / `--color-ink`. Read them from the CSS custom properties or
centralize in one constant tied to the token source so they cannot drift.
Key files: `components/layout/app-shell.tsx`.
Acceptance: the theme-color values derive from the token source, not duplicated literals.
Size: S. Deps: none. Overlap: none.

---

## 5. Stream C: Entity-role Admin and Controls

> Every entity role must have an owner-control / settings surface for its core job. Practitioner
> (booking), Business (memberships), and Event Space (check-in) are wired. Organization,
> Coaching, Lab, and Partner have gaps. The settings hub
> (`app/(main)/spaces/[slug]/settings/page.tsx`) is the single place that decides which deep
> link shows per type; the member-facing conversion engine is `components/widgets/entity/entity-cta.tsx`
> (only practitioner and business render real engines; the rest fall through to a placeholder
> session list).

| id | Title | Size | Overlap |
|---|---|---|---|
| ADMIN-01 | Organization donations owner control (forms-only, no money) | M | HARD-01, ADMIN-04 |
| ADMIN-02 | Coaching enrollment + curriculum owner control (no money) | M | ADMIN-04 |
| ADMIN-03 | Event Space ticketing owner control (free / RSVP tiers, no money) | M | ADMIN-04 |
| ADMIN-04 | Real member-facing CTA engines for the placeholder roles | M | ADMIN-01, ADMIN-02, ADMIN-03 |
| ADMIN-05 | Lab and Partner blueprints (make the roles provisionable) | M | HARD-02 |
| ADMIN-06 | Mirror every per-type control in the admin owner-preview console | S | JAN-02 |

> **Money boundary.** Phase 4 (Stripe Connect, real charges, tax receipts, installments) is Held
> (§11). ADMIN-01 / 02 / 03 ship the **owner surface and the structured data only**, with no
> payment, exactly as Business memberships v1 shipped (tiers + join, billing deferred, ADR-327).
> Each names its no-money scope plainly in copy (CONTENT-VOICE skeptic test).

**ADMIN-01 - Organization donations owner control**
Scope: Organization has a blueprint and a "Donate" CTA but zero owner admin for its core job. Add
a `settings/donations` Focus surface where an owner configures hosted donation asks / suggested
amounts / a fund label, stored in the Space's own rows. No payment in v1 (mirrors memberships
v1). Add the hub card gated to `organization`.
Key files: `app/(main)/spaces/[slug]/settings/donations/page.tsx` (new),
`app/(main)/spaces/[slug]/settings/page.tsx`, `lib/layout/page-chrome.ts`, a `lib/spaces/*` store
+ migration (additive `space_id`-scoped table).
Acceptance: an organization owner configures donation asks; the surface is owner-gated server-side
(staff preview read-only); registered as Focus in `page-chrome.ts`; copy states no payment;
RLS / contract leak test passes; ADR added.
Size: M. Deps: HARD-01 (clean type branch in the hub). Overlap: HARD-01 / ADMIN-04 (settings hub).

**ADMIN-02 - Coaching enrollment + curriculum owner control**
Scope: Coaching has a blueprint and an "Enroll" CTA but no owner admin. Add a `settings/enroll`
Focus surface for cohort / program definition and an enrollment list (reuse the memberships v1
shape where it fits). No payment in v1. Add the hub card gated to `coaching`.
Key files: `app/(main)/spaces/[slug]/settings/enroll/page.tsx` (new),
`app/(main)/spaces/[slug]/settings/page.tsx`, `lib/layout/page-chrome.ts`, a `lib/spaces/*` store
+ additive migration.
Acceptance: a coaching owner defines a cohort / program and sees enrollees; owner-gated; Focus
registered; no-payment copy; leak test passes; ADR added. Size: M. Deps: none. Overlap: ADMIN-04.

**ADMIN-03 - Event Space ticketing owner control**
Scope: Event Space has check-in but no box-office. Add a `settings/tickets` Focus surface for
free / RSVP ticket tiers + capacity (no money; real paid ticketing is Phase 4). Add the hub card
gated to `event_space`.
Key files: `app/(main)/spaces/[slug]/settings/tickets/page.tsx` (new),
`app/(main)/spaces/[slug]/settings/page.tsx`, `lib/layout/page-chrome.ts`, a `lib/spaces/*` store
+ additive migration.
Acceptance: an event_space owner defines free / RSVP tiers with capacity; owner-gated; Focus
registered; no-payment copy; leak test passes; ADR added. Size: M. Deps: HARD-01. Overlap: ADMIN-04.

**ADMIN-04 - Real member-facing CTA engines for the placeholder roles**
Scope: `entity-cta.tsx` renders real engines only for practitioner (booking) and business
(memberships); organization "Donate", coaching "Enroll", and event_space "Get tickets" fall
through to a generic upcoming-sessions list. Wire each role's CTA to the owner-configured data
from ADMIN-01 / 02 / 03 (still no money), so the member can act, and keep the `space.cta_click`
analytics.
Key files: `components/widgets/entity/entity-cta.tsx`, plus the three new stores from ADMIN-01/02/03,
`components/spaces/*` (new member surfaces mirroring `booking-member` / `membership-join`).
Acceptance: each of the three roles renders a real (no-money) conversion surface fed by its owner
config; empty states via `EmptyState`; copy passes §10. Size: M. Deps: ADMIN-01, ADMIN-02,
ADMIN-03. Overlap: those three.

**ADMIN-05 - Lab and Partner blueprints (make the roles provisionable)**
Scope: `lab` and `partner` are in the `SpaceType` union but have no blueprint, so the wizard
filters them out and the shell falls back to About-only. Author a `RoleBlueprint` for each
(tabs, CTA, hero stats, default skin / accent), following the §2.10 extensibility contract, so
both become provisionable. Confirm whether either needs a deep owner control or composes the
universal four (Members / QR / CRM / Email).
Key files: `lib/spaces/blueprints.ts`, `lib/spaces/blueprints.test.ts`,
`app/(main)/spaces/new/page.tsx` (the wizard filter), `docs/SPACES.md`.
Acceptance: both roles provision through the wizard onto a non-empty, legible profile (skeptic
test); blueprint tests cover all provisionable types; ADR / SPACES note added. Size: M.
Deps: HARD-02 (the canonical role-set decision). Overlap: HARD-02.

**ADMIN-06 - Mirror every per-type control in the admin owner-preview console**
Scope: the janitor-only `admin/spaces/[id]` "Preview owner back-end" offers type-specific preview
links only for practitioner (availability) and business (memberships); it does not even cover the
shipped event_space check-in. Extend it to mirror every per-type control (existing plus the new
ADMIN-01/02/03 surfaces).
Key files: `app/(main)/admin/spaces/[id]/page.tsx`.
Acceptance: the preview console links to every per-type owner surface for the space's type; no
gap versus the live settings hub. Size: S. Deps: ADMIN-01/02/03 (to link their surfaces).
Overlap: JAN-02 (both touch staff preview of spaces, different files).

---

## 6. Stream D: Janitor / Staff

> The "view as role" selector lets staff preview the app as any community-ladder role. It does
> not cover the entity-role axis (the Space `type` set), so staff cannot preview-as an entity
> role. Source: the Janitor-selector audit.

| id | Title | Size | Overlap |
|---|---|---|---|
| JAN-01 | Add entity-role preview to the "view as role" selector | M | none |
| JAN-02 | Surface a staff "open any space owner back-end" entry from the selector | S | ADMIN-06 |

**JAN-01 - Add entity-role preview to the "view as role" selector**
Scope: the selector renders only the community ladder (`ROLE_HIERARCHY`) plus a hardcoded
"Visitor". The entity roles are the separate `SpaceType` axis. Add a second "Preview as entity"
group to the selector driven by `SpaceType` (plus `event_space`), widen the target type and the
server-action validator to accept entity-role values, and decide how an entity preview resolves
(it should require / pick a target Space, since an entity role only has meaning inside a Space).
The cleanest mapping is: selecting an entity role routes the previewer into a representative Space
of that `type` (or the role's demo Space), rather than mutating the community capability
resolver.
Key files (current option list defined here): `components/layout/view-as-control.tsx` (the
`ROLE_HIERARCHY.filter(...).map(...)` block plus the hardcoded Visitor button is where the new
group slots in), `lib/view-as.ts` (`ViewAsTarget`, `applyViewAs`), `app/(main)/view-as-actions.ts`
(the `isValidTarget` check), `lib/spaces/types.ts` + `lib/spaces/blueprints.ts` (the entity-role
source array).
Acceptance: a host-and-above staffer can pick any of the seven entity roles from the selector and
land in a representative Space of that role; the cookie validator accepts only valid entity-role
targets and stays downgrade-safe; no change to the community-ladder preview behavior; copy passes
§10. Size: M. Deps: ADMIN-05 helps (so lab / partner have a Space to preview), but JAN-01 can ship
for the five live roles first. Overlap: none (distinct file set from ADMIN).

**JAN-02 - Surface a staff "open any space owner back-end" entry**
Scope: today staff reach a Space owner back-end via `admin/spaces/[id]`. Add a direct affordance
(from the selector or the space profile, staff-gated) to open the current Space's owner settings
in read-only preview, so previewing a Space and managing-as-owner are one click apart.
Key files: `components/layout/view-as-control.tsx` or a small staff control on the space profile,
`app/(main)/admin/spaces/[id]/page.tsx` (read).
Acceptance: a staffer on a Space profile can jump to that Space's owner back-end preview without
hunting through `/admin`; gated to staff; read-only (existing `resolveSpaceManageAccess` honored).
Size: S. Deps: none. Overlap: ADMIN-06 (both touch staff space-preview, different files).

---

## 7. Stream E: SEO/AIO

> Mostly code-doable items from `A-PLUS-ROADMAP.md` §5 that do not need owner data. Items needing
> owner data (the Lab street address for LocalBusiness, flipping practices public, setting
> `NEXT_PUBLIC_SITE_URL`, submitting the sitemap) are owner-gated and listed in §10, not planned
> here.

| id | Title | Size | Overlap |
|---|---|---|---|
| SEO-01 | Seeker-track Pillar article cluster (five pain-first pieces) | M | none |
| SEO-02 | Schema.org / JSON-LD coverage check on the public discover surfaces | S | UX-10 |

**SEO-01 - Seeker-track Pillar article cluster**
Scope: author five pain-first articles on the CONTENT-VOICE canon for the Seeker demographic,
clustered by Pillar, to feed the public Pillar pages (A-PLUS §5).
Key files: the help / article content tree (MDX-in-git) the Pillar pages render.
Acceptance: five articles ship on-voice (no em or en dashes, §10 checklist), each links into its
Pillar surface; no banned words. Size: M. Deps: none. Overlap: none.

**SEO-02 - Schema.org / JSON-LD coverage check on the public discover surfaces**
Scope: verify the public discover practice / partner / Pillar pages emit correct JSON-LD (the
agent-readable layer) and add any missing structured data, coordinated with the UX-10 template
migration so it lands once.
Key files: `app/discover/practices/*`, `app/discover/partners/*`, their `opengraph-image` routes.
Acceptance: each public discover detail page emits valid JSON-LD; no duplicate or broken schema.
Size: S. Deps: UX-10 (sequence after the template migration to avoid double-touching). Overlap: UX-10.

---

## 8. Stream F: Security

> The code-doable security items from `A-PLUS-ROADMAP.md` §3. Owner-toggle items (secret-scanning
> push-protection, leaked-password protection) and infra-gated items (the `db-tests` CI gate)
> are listed in §10, not planned here.

| id | Title | Size | Overlap |
|---|---|---|---|
| SEC-01 | Extend `check:authz` to scan `lib/` mutation helpers | M | none |
| SEC-02 | Cross-tenant leak sweep across every entity module and the directory | M | none |

**SEC-01 - Extend `check:authz` to scan `lib/` mutation helpers**
Scope: the static authz check currently scans routes; extend it to `lib/` mutation helpers to
catch the confused-deputy class statically (A-PLUS §3, finding B8).
Key files: the `check:authz` script and its config.
Acceptance: the check flags an un-guarded `lib/` mutation helper in a fixture; runs in the
existing test / lint pass. Size: M. Deps: none. Overlap: none.

**SEC-02 - Cross-tenant leak sweep across every entity module and the directory**
Scope: complete the Phase 1 QA-gate line item: a full cross-tenant read / write leak sweep across
every `space_id`-scoped entity module and the `/spaces` directory, with a contract test per
module, and a check on every `service_role` / `SECURITY DEFINER` path the entity surfaces touch.
Key files: the contract-test harness, `components/widgets/entity/*`, `lib/spaces/*`,
`app/(main)/spaces/page.tsx`.
Acceptance: a caller in Space A can never read / write Space B's rows through any entity module or
the directory; each path has a leak test; the suite gates space-scoped PRs.
Size: M. Deps: none. Overlap: none.

---

## 9. Stream G: Docs

> Keep the doc set honest and lean per `DOCS-PROTOCOL.md`. Technical changes go to git; operator
> how-tos go to Notion; this plan supersedes the entity-spaces backlog blocks once items land.

| id | Title | Size | Overlap |
|---|---|---|---|
| DOC-01 | Em / en dash sweep across `docs/` brand-facing copy | S | none |
| DOC-02 | Reconcile and point the stale trackers at this plan | S | none |
| DOC-03 | ADR + DEVELOPMENT-MAP entries as each stream item lands | S (per item) | none |

**DOC-01 - Em / en dash sweep**
Scope: A-PLUS §9 flags ~23 files with em dashes. Sweep brand and member-facing copy (and any doc
that feeds AI generation) to the no-dash rule; leave code-identifier and historical-migration
exceptions per NAMING.
Key files: the flagged `docs/*.md` and any member-facing copy strings.
Acceptance: zero em or en dashes in brand / member-facing copy; the §10 checklist passes.
Size: S. Deps: none. Overlap: none.

**DOC-02 - Reconcile and point the stale trackers at this plan**
Scope: `BACKLOG.md` is already marked stale; the entity-spaces docs carry per-phase status blocks.
Add a one-line pointer from `ENTITY-SPACES-BUILD.md` and `A-PLUS-ROADMAP.md` to this plan as the
current execution list, and confirm `DEVELOPMENT-MAP.md` links here.
Key files: `docs/ENTITY-SPACES-BUILD.md`, `docs/A-PLUS-ROADMAP.md`, `docs/DEVELOPMENT-MAP.md`.
Acceptance: each tracker points at `docs/MASTER-PLAN.md`; no duplicated lists. Size: S. Deps: none.
Overlap: none.

**DOC-03 - ADR + DEVELOPMENT-MAP entries as each item lands**
Scope: per `DOCS-PROTOCOL.md`, every decision-bearing item (the ADMIN owner surfaces, JAN-01, the
type-source reconciliation) adds an ADR continuing from ADR-339, and updates the relevant
`docs/*.md`; operator how-tos route to Notion. This is a standing requirement, tracked once here.
Key files: `docs/DECISIONS.md`, the relevant `docs/*.md`.
Acceptance: each shipped decision-bearing item has its ADR + doc update; Notion gets the operator
how-to, not a code copy. Size: S per item. Deps: tracks its parent item. Overlap: none.

---

## 10. Owner / infra-gated (not planned here, tracked so nothing is dropped)

These are real but are **not engineering build work** in this plan: they need owner access, data,
or CI infra. They live in `A-PLUS-ROADMAP.md` §10, `OPEN-THREADS.md`, and `LAUNCH.md`.

| Item | Owner | Why not here |
|---|---|---|
| Stripe go-live (keys, Connect, `host_payouts_enabled`) | owner | Gates Phase 4; no code path |
| Flip prod env / config switches (`ANTHROPIC_API_KEY`, VAPID, `NEXT_PUBLIC_SITE_URL`, OAuth) | owner | Config, not code |
| Migration-ledger drift repair + promote `db-tests` to a required CI gate | infra | Needs a CI service |
| Secret-scanning push-protection + leaked-password protection | owner | GitHub / Supabase settings |
| Flip practices `is_public`; provide the Lab street address for LocalBusiness; submit the sitemap | owner | Data / content, not code |
| RLS initplan `auth.uid()` rewrites + permissive-policy consolidation (advisor-flagged) | owner | DB migrations the owner applies |

---

## 11. Held (Phases 4 to 6)

These are **listed, not planned for execution** here.

| Phase | Outcome | Why Held |
|---|---|---|
| **Phase 4 - Money / commerce** | Per-space earnings, Stripe Connect payouts, bookings / packages, real ticketing, donations + tax receipts, memberships billing, installment plans | On hold. Needs Stripe go-live + legal entity; PCI and IRS-receipt gates. The owner surfaces in Stream C deliberately ship the data-and-UI layer with **no money** so they are ready when Phase 4 turns on. |
| **Phase 5 - White-label web (Puck micro-site, TLS ops)** | Owner theme editor, public Puck micro-site, custom-domain TLS + verification, 301 / canonical, "remove Frequency branding" tier | On hold. Custom-domain TLS is the first real ops cost; Puck is installed but the public micro-site is deferred. |
| **Phase 6 - Native + premium AI infra** | Native branded app program, read-first MCP server, eval harness in CI | On hold. Done-for-you top tier; real money and infra. |

Full strategy for the Held phases: [`ENTITY-SPACES-BUILD.md`](ENTITY-SPACES-BUILD.md) §C "Later
phases", [`ENTITY-SPACES-SYSTEM.md`](ENTITY-SPACES-SYSTEM.md) §6, [`ENTITY-SPACES-PLAN.md`](ENTITY-SPACES-PLAN.md) §12.

---

## 12. What this doc supersedes or links to

- **Supersedes (as the active execution list):** the open `- [ ]` epic boxes in
  [`ENTITY-SPACES-BUILD.md`](ENTITY-SPACES-BUILD.md) §C for Phases 0 to 3 (those are the historical
  plan of record; their `✅ Shipped` status blocks remain authoritative for what landed). The
  code-doable open items in [`A-PLUS-ROADMAP.md`](A-PLUS-ROADMAP.md) are folded into Streams A, B,
  E, and F above.
- **Links to (does not duplicate):** [`DEVELOPMENT-MAP.md`](DEVELOPMENT-MAP.md) (the broader staged
  build and the mission), [`SPACES.md`](SPACES.md) (the tenancy model), the entity-spaces trilogy
  (the deep specs), [`DECISIONS.md`](DECISIONS.md) (ADR-320 to ADR-338 for what shipped),
  [`PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md) / [`THEME.md`](THEME.md) (the compose-and-token canon
  every item obeys), and `OPEN-THREADS.md` / `LAUNCH.md` (the owner / infra gates in §10).
- **Out of scope:** the broader product verticals (Programs depth, Local Marketplace, The
  Collective, Affiliate, Donations vertical, Lab Spaces, Mobile) and the Held money / white-label
  / native phases; those stay in `DEVELOPMENT-MAP.md` and the entity-spaces trilogy.

---

## 13. Parallelization quick-map (for batching disjoint agents)

Safe-to-run-together sets (no key-file overlap). Pick one item per set per parallel agent:

- **Set 1 (cleanup, all disjoint):** HARD-03, HARD-04, HARD-05, UX-09, UX-15, DOC-01.
- **Set 2 (UX states, disjoint):** UX-01 then UX-02 (sequential, same file), UX-03 (new files),
  UX-06, UX-07 (coordinate `feed/composer.tsx` with UX-08).
- **Set 3 (entity admin, sequence within):** ADMIN-01, ADMIN-02, ADMIN-03 each add a new settings
  route + a hub-card line; they all edit `settings/page.tsx`, so **serialize the hub edits** but
  the new route files and stores are disjoint. ADMIN-04 depends on all three.
- **Set 4 (independent tracks):** JAN-01 (view-as files), SEC-01 (authz script), SEC-02 (contract
  tests), SEO-01 (content), ADMIN-05 (blueprints) run fully in parallel; none share files.
- **Watch points (do not parallelize):** HARD-01 and HARD-02 both edit `lib/spaces/types.ts`;
  UX-04 and UX-12 share the profile skeleton height; UX-12 and UX-14 share `entity-card.tsx`;
  UX-07 and UX-08 share `feed/composer.tsx`; UX-10 and SEO-02 share the discover tree;
  ADMIN-01/02/03/04 and HARD-01 all touch `settings/page.tsx`.
