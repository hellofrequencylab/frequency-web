# Business Spaces Management — Full Audit & Repair (2026-07-21)

A systematic survey of the entire Business Spaces management system (the `/manage` console, all
settings surfaces, CRM, Booking, Donations/Memberships/Tickets, Shop/Marketplace, Email/Automation,
Airwaves/Journeys/Practices/Loom, QR/Insights, lifecycle) covering every function, unwired/orphaned
code, missing controls, and correctness bugs. Findings were produced by nine parallel deep-read passes
and each was verified against the code before landing here.

**Baseline:** 513 test files / 5,729 tests green; `check:menu`, `check:authz`, `check:canon` all pass;
every one of the 22 module deep-links resolves to a real route. The system is unusually disciplined:
tenancy scoping, server-side re-gating, and fail-safe reads are consistent almost everywhere.

> **Money context:** Donations, Memberships, Tickets, Shop checkout, and paid Booking deposits are
> deliberately **display-only today** (`billingLive()` / `canTakePayments` gate every real Stripe path).
> Several money findings below are therefore **latent** — real defects in shipped code that activate the
> moment billing flips live. They must be closed *before* that switch, but they charge/leak nothing today.

---

## ✅ Repaired in this pass (verified: full suite green, typecheck clean)

| # | Area | Fix | File(s) |
|---|------|-----|---------|
| 1 | Manage console | **CRM / Email / Shop feature toggles were inert.** `setSpaceFeatureEnabled` still branched on the retired `def.entitlement`, so OFF deleted the wrong/absent key (read back ON) and ON demanded a plan flag that is never set (could never re-enable). Now every function toggles uniformly on `def.key`, mirroring `spaceFunctionEnabled`. | `manage/modules/actions.ts`, `manage/modules/page.tsx` |
| 2 | CRM / compliance | **Global STOP missed mixed-case contacts.** `recordGlobalStop` matched `.eq('email', addr)` (lowercased) against a column that stores un-normalized addresses, so a `Bob@X.com` row was never flipped to `unsubscribed`. Now case-insensitive (`ilike` on the escaped address), matching the sibling read. | `lib/crm/contact-consent.ts` |
| 3 | Shop | **Public storefront ignored the `shop` feature gate.** Turning Shop off in the Module Manager left `/spaces/<slug>/shop` publicly live. Now gated on `spaceFunctionEnabled(space,'shop')`. | `spaces/[slug]/(profile)/shop/page.tsx` |
| 4 | Marketplace | **Self-reviews on Space Shop items.** The self-review guard only checked `ownerProfileId`, which is null for a Space-owned item, so an owner could seed 5-star reviews on their own storefront. Now also blocks any member of the owning Space's team. | `marketplace/review-actions.ts` |
| 5 | Marketplace admin | **Orders "Gross"/"Platform fees" tiles inflated** by unpaid `pending` + `cancelled` orders. Now count only captured (`paid`/`fulfilled`) money, matching `spaceEarningsSummary`. | `admin/marketplace/orders/page.tsx` |
| 6 | Booking | **Reschedule was impossible for any service with a required question** (and dropped answers otherwise): `rescheduleBooking` passed `answers: null`. Now carries the original booking's stored answers forward. (+ regression test) | `lib/spaces/booking.ts`, `lib/spaces/booking.test.ts` |
| 7 | CRM | **Graduated contact's seed deal could be born won/lost** in a degenerate pipeline (`getFirstOpenStage` falls back to `stages[0]`). A new contact's deal is now always `status: 'open'`. | `lib/crm/graduation.ts` |
| 8 | CRM (UX) | **Resonance page:** removed the right rail (Live / Needs attention / Just joined) and made the CRM board full-width; deleted the now-orphaned rail component. | `components/spaces/crm/space-resonance-crm.tsx` (+ removed `space-resonance-rail.tsx`) |
| 9 | Check-in | **"Checked in" StatCard saturated at 500 and double-fetched the roster** (`listCheckins(...).length`). Now uses the purpose-built `countCheckins` head/count query (which was orphaned). | `spaces/[slug]/settings/checkin/section.tsx` |
| 10 | Reviews / SEO | **AggregateRating.reviewCount capped at 24.** The review aggregate (count/average/distribution, feeding profile JSON-LD) was computed over only the 24-row display page. Now aggregates over all visible reviews. | `lib/spaces/content-data.ts` |
| 11 | Lifecycle / security | **Claim left the seeder as admin.** Claiming a seeded Space transferred ownership but never revoked the platform staffer's seeded `admin` membership, a durable full-access grant on the customer's Space. Claim now removes the prior owner's seat. | `lib/spaces/claim.ts` |
| 12 | Airwaves | **Feature-lock bypassed for members.** With Airwaves turned off, plain members still reached the browse console. The off-state now 404s for members (managers keep the upsell). | `spaces/[slug]/settings/airwaves/page.tsx` |
| 13 | Docs | **Functions list was missing `loom`** (said "17", registry has **18**). Corrected the count, added `loom`, and added a Loom Studio row to the surface table. | `docs/BUSINESS-SPACE-BACKEND-SURVEY.md` |
| 14 | Profile / **security** | **Stored XSS on the public profile.** `website` and each social `url` are stored trim-only, then rendered as raw `href`s on the public, unauthenticated profile — an operator could save a `javascript:` link that runs in a visitor's origin. Both sinks now pass through `normalizeHttpUrl` (http/https only; unsafe renders as plain text / is dropped). | `components/page-editor/blocks/profile.tsx` |
| 15 | Page builder | **Cover-scrim "None" could not be saved.** The branding form offers `none` and the reader/render support it, but the write action rejected everything but `shade`/`blend`, so "None" always failed. Now accepted. | `manage/layout/actions.ts` |

---

## 🔴 Must-fix BEFORE billing goes live (money paths, latent today)

These are fully wired behind `billingLive()`/`canTakePayments`; they charge or leak nothing today, but
they are real defects in the money code. **Recommend product/eng review before flipping billing on** —
they touch payment flow design, so they were not auto-repaired.

- **Paid space-membership checkout records no membership.** `space-membership-checkout.ts` opens the Stripe
  subscription session but never inserts a `space_memberships` row, and `reconcileSpaceMembershipSubscription`
  is an UPDATE (matches zero rows). A member would be charged on a recurring subscription with no membership
  record and no reconciliation handle. `joinTier` (the only INSERT) is skipped on the paid path.
- **`joinTier` has no payment gate.** The exported action records `status:'active'` after only checking the
  tier is real and the caller isn't already a member — no `priceCents`/`billingLive()`/payment check. When
  billing is live, a paid tier is obtainable free by calling the action directly. Close before member-only
  gating ships.
- **Plain-product stock oversell.** `commerce/checkout.ts` soft-checks stock only for *variants*; a plain
  tracked-stock item passes to Stripe, and settlement's `out_of_stock` fails soft (order already `paid`).
- **PWYW ("choose your price") amount never reaches checkout** — buyer's chosen amount is display-only;
  checkout charges the fixed `priceCents`.
- **Double-rounding in membership application-fee percent** (minor platform under-collection on low prices).

---

## 🟠 High / Medium — today-live, recommended next

**Correctness / infra (need care or a migration/RPC):**
- **Check-in "repeatable" is defeated — a member can only ever check in once per Space** (cross-confirmed by
  two passes). `lib/engagement/capture.ts` uses a static idempotency key `node:${nodeId}:${actor}`; the 2nd+
  check-in returns `already_captured` before the `captures` insert, so the roster/count permanently
  undercount. The check-in node is `zaps_value: 0`, so the safe fix is to thread a **request-scoped nonce**
  through `CaptureAttempt` for `repeatable` nodes (record each capture) while keeping the reward/`practice.
  verified`/trust signals on the base once-per-(node,actor) key so operator repeatable nodes' economy is
  unchanged. Not auto-fixed: shared reward infra, needs the caller (`/n/[nodeId]`) to pass the nonce + a live
  capture-pipeline test. (The StatCard undercount above is already fixed.)
- **Double-booking / ticket-RSVP / enrollment capacity races (TOCTOU).** Read-then-insert with no DB
  constraint or advisory lock. Booking's unique index only protects identical start instants (buffers +
  differing service durations can still overlap); ticket RSVP and enrollment capacity are advisory. Fix with
  a DB capacity constraint or a per-resource `atomic` RPC (the paid ticket path already uses one).

**Automation / email (today-live):**
- **Automation rules are non-functional.** The UI only offers `email_audience` rules, but `fireSpaceTrigger`
  no-ops unless `action_config.sequenceId` is present (which `email_audience` never carries). Rules persist,
  toggle, and display, but email no one. Two of four triggers (`contact.tagged`, `deal.stage_changed`) also
  have zero call sites.
- **Scheduled-send time is interpreted as UTC, not owner-local** (a 9 AM ET schedule fires at ~5 AM ET).
- **"Send to N people" overstates actual sends** — the audience count doesn't apply marketing consent, but
  the send seam skips `unknown`/`unsubscribed`; a freshly-imported audience confirms 500, delivers 0.
- **Interactive send has no atomic claim** — a retried/double POST can double-send the whole audience.
- **No per-campaign cancel/unschedule** and **no monthly send quota** (only a flat daily 500 cap).

**Page builder / profile:**
- **Custom pages are uneditable.** A custom page renders its Puck `pageDocs`, but the on-canvas editor
  only edits Home's grid (takes no `pageSlug`) and `SpacePagePanel` has no "edit page content" button — and
  nothing links to `/spaces/<slug>/edit-page` at all. An operator can create a custom page but never edit it.
- **External-website publish is stubbed.** `setWebsitePublished` + the `/sites/<slug>` route exist, but the
  "Publish website" button only shows a "Coming soon" notice; seven layout actions (`setSpaceLayoutPreset`,
  `setSpaceLayoutDefault`, `setSpaceServices`, `setSpaceHero`, `setWebsitePublished`, `reorderSpaceBlock`,
  `setSpaceBlockHidden`) are orphaned. The layout-preset template system has no writer UI (every page resolves
  to `'single'`), and a vestigial legacy layout registry (`profile-blocks`/`profile-modules`) shadows the live
  entity-grid.

**Missing controls:**
- **CRM Pipeline is read-only for deals.** The board says "Move each person through your pipeline," but there
  is no space-scoped create/move/win-lost/edit control (only staff-only admin actions + the coarse
  `setStageKind`). Owners can't advance an individual deal.
- **No delete/deactivate for a Space QR code** — the cap-reached UI says "Remove one to add another," but no
  such action exists, so a free Space at 3 codes hits a permanent wall.
- **QR splash "Edit" starts blank and clobbers** the stored splash on save (the reader never exposes the
  blob) — a data-loss footgun.
- **Airwaves attach UI is dead for journey / journey_item / practice / event** (backend supports all six host
  kinds; only space + product are wired), and **space-attached recordings are never rendered** anywhere.
- **No recording metadata/transcript/chapter edit UI** — `updateRecordingAction` supports them but nothing
  calls it, so a recording can never gain a description/transcript/chapters.
- **No operator delete for Airwaves A/V storage** — deleted recordings leak their Loom asset + storage.

**Data hygiene / correctness:**
- **Cross-book PII enrichment** — `space-contact-detail.enrichFromCapture` pulls phone/company/city from *any*
  member's capture of the same email, not scoped to the viewer's Space.
- **Space profile-view / CTA-click telemetry has no read surface** — written to `engagement_events`, never
  displayed to any owner/operator.
- **Onboarding `?mode=` deep-link dead-ends** — `/spaces/new?mode=...` hint is dropped; every funneled
  persona lands on the first create choice.
- **Private-space podcast leak** — the public podcast/RSS routes resolve via `getSpaceBySlug` (no visibility
  gate); a private Space that publishes a public show leaks its name/cover/episodes. (Arguably intended.)

---

## 🟡 Low (noted, not urgent)

- Bulk role-promotion bypasses the seat-limit check the single path enforces (latent while billing off).
- `updateTask` silently clears an invalid/cross-space deal/contact link instead of rejecting.
- Loom Studio delete has no usage/`kind` guard — deleting an image backing a Show cover or (via a crafted
  same-space A/V asset id + `ON DELETE CASCADE`) a Recording, silently.
- Invite accept is token-possession only (no email match) and runs as a mutation on GET render.
- DST-boundary day can be dropped from open booking slots (rare).
- New `captures` rows never set `captures.space_id` (dead tenancy column; roster filters by `node_id`).
- Orphaned exports: `createSpaceJourneyAction`, single-item `getVariant`/`listVariants`/`deleteVariant`.
- Doc/migration comment drift (claim token "nulled", `capture.ts` repeatable-key TODO).

---

## Verified correct (checked, NOT bugs)

Stripe webhook idempotency (event-id claim + release, atomic apply); refund auth (operator-only) + full
unwind; take-rate ladder keyed on the seller's paying-state, fails safe to the higher rate; cross-space
item/media/contact isolation; consent + suppression + RFC-8058 unsubscribe honored on every send path; both
comms crons genuinely wired + `CRON_SECRET`-guarded; booking rejects past times + notifies the right
recipients; claim/invite token strength + single-use CAS; reviews division-by-zero guards.
