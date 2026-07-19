# Business Space back-end management — full survey

**A wall-to-wall map of the operator console for a business/nonprofit Space:** the five hub
clusters (Resonance · Marketing · Offerings & Money · Content & Programs · Profile & Settings),
every module in each, how each is routed, gated, and stored, and where the wiring is still
unfinished.

**Scope:** the owner console at `/spaces/[slug]/manage` and every surface it deep-links into, for
the provisionable Space types (`business`, `nonprofit`; `root` is the platform host and uses the
legacy cockpit). Survey date: 2026-07-19. Read-only audit; no behavior was changed.

**Status legend:** ✅ shipped & wired · ⏳ built, dormant behind a flag · ⚠️ partial / drift ·
🔴 gap or defect.

---

## 1. The one contract (how every surface resolves)

Every operator menu — the in-page admin rail *and* the `/manage` console/hub — derives from **one
catalog**, per the locked menu contract (ADR-553, `docs/MENU-CONTRACT.md`). Nothing hand-rolls a
per-scope menu.

```
   SPACE_MODULES  (lib/admin/modules/space-modules.ts)     ← the Space catalog (25 module rows)
          │
   lib/apps/catalog.ts → APPS                              ← the one App contract
          │
   ┌──────┴───────────────────────────────┐
 RAIL: appsForScope(scope,viewer,kind)   HUB/CONSOLE: manage-board.tsx → space-hub.ts
 (components/layout/settings-panel.tsx)  (app/(main)/spaces/[slug]/manage/*)
```

- **Catalog:** `SPACE_MODULES` — 25 rows, each with a `label`, `Icon`, `family`, `gate`
  (`always` shell vs `feature` keyed on a `SpaceFunctionKey`), `render` (`inline`/`panel`/`link`),
  `deepLink`, an `access` badge (`included`/`freemium`/`premium`) and a `freeNote` cap string.
- **Hub grouping:** `lib/admin/modules/space-hub.ts` `sectionForModule()` folds the flat catalog
  into the **five hub tabs** below (Resonance is the default landing tab). This is a pure grouping,
  not a parallel catalog.
- **Drift guard:** `pnpm check:menu` + vitest drift tests assert the rail and console resolve the
  identical module set, so they can never diverge.

### The gate model (three independent axes)

| Axis | Where | Behavior today |
|---|---|---|
| **Availability (on/off)** | `spaces.entitlements` jsonb, keyed by `SpaceFunctionKey` | **Universal + default-ON** (ADR-517 Phase F). Only an explicit `false` disables. Empty blob = every tool on. |
| **Role** | `spaces.feature_roles` over a code default (`lib/spaces/functions.ts`) | `spaceFunctionAccess(space, fn, role)` — viewer's Space role must meet the function's min-role. Defaults: most `editor`; `checkin` `moderator`; `crm`/`email`/`billing`/`reviews` `admin`. |
| **Money (plan/usage)** | `lib/pricing/*` + `lib/billing/*` | **Ships OFF.** `billingLive()` (Stripe env + `billing_live` flag) is false → `featureAllowed` and `withinAllowance` short-circuit to `true`. Nothing is capped or charged. |

The 17 gateable functions are `crm · email · members · qr · availability · memberships ·
donations · enroll · tickets · checkin · shop · billing · profile · reviews · airwaves ·
practices · journeys`. `usableSpaceFunctions()` is the **one** resolver shared by rail + console.

**Access control:** `resolveSpaceManageAccess` → `{ canManage, staffViewing }`. The console *render*
gates on `canManage || staffViewing` (else `notFound()`, no existence leak); **every mutation
re-gates server-side** in its own action, so the console gate is UX-only. `staffViewing` (platform
janitor previewing a Space they don't own) is always read-only.

### Two facts that color the entire back-end

- 🔴 **Money is dormant everywhere.** Only the **Shop** (and a dark booking-deposit path) contain
  charging code, both double-gated OFF behind `payoutsLive()`/`host_payouts_enabled`. Memberships,
  donations, tickets, and enrollment have **no payment path at all** in v1 (record-only). The
  take-rate / cap strings in `freeNote` (e.g. "5% take-rate", "15 bookings/mo free") are **display
  copy, not enforced** — `feature-meters.ts` allowances are placeholders.
- ⚠️ **Untyped admin client (ADR-246).** Nearly every `space_*`, `crm_*`, `commerce_*`, `recordings`
  etc. table is reached through an untyped service-role handle — columns like `space_id` aren't in
  the generated DB types yet. Not a bug, but a standing type-safety debt across the whole back-end.

---

## 2. The hub at a glance

The `/manage` console is a category-navigated control hub (`?section=`), Resonance leading.

| Tab | Modules | What it is |
|---|---|---|
| **Resonance** | CRM · Inbox · Lead capture · Capture links · Shared with team (+ embedded Vera autonomy, playbooks, resonance matches) | The Space's people + every conversation. Default landing; embeds the live CRM roster. |
| **Marketing** | Email (compose) · Email design · Email style · QR codes · Scans & insights · Automation | Reach + growth. Embeds the space-scoped twin of the admin CRM Marketing page. |
| **Offerings & Money** | Booking · Memberships · Donations · Enrollment · Tickets · Check in · Shop | Everything the Space sells. Six commerce services + the Shop console. |
| **Content & Programs** | Practices · Journeys · Airwaves | What the Space teaches and hosts. |
| **Profile & Settings** | Profile & Settings (identity) · Team & members · Reviews · Plan & Billing · Danger zone | Configuration surface. `Page`, `Module Manager`, and `Mode` live on the rail/deep-link, not this tab. |

**Top-level wiring** (`manage/page.tsx` → `manage-board.tsx` → `console.tsx`): resolve Space →
gate → `getSpaceCapabilities` → `usableSpaceFunctions` → `resolveSpaceMenu` (applies the owner's
Module-Manager `{order, hidden}` overrides) → Mode emphasis (framing only) → render. Resonance
mounts `<SpaceResonanceCrm>` as `crmEmbed`; Marketing mounts `<SpaceMarketing>` as `marketingEmbed`.

---

## 3. Resonance — people & communication

All five modules gate on `SpaceFunctionKey: 'crm'` (default role `admin`). Board/leads/doors/shared
are `freemium` ("250 contacts free, then unlimited"); Inbox is `included`. Consistent gate pattern:
re-resolve Space from slug → re-gate server-side → never trust a client-supplied `spaceId`. One
timeline invariant: every touch routes through `recordContactInteraction`.

| Module | Capability | Route / key files | Server actions | Tables | Status |
|---|---|---|---|---|---|
| **CRM board** | People roster · Pipeline (deals/stages/funnel/tasks) · Cockpit (health verdict, worklist, lifecycle funnel, resonance matches) · CSV import | `crm/page.tsx` → `crm-body.tsx`; `components/spaces/crm/*` | stage CRUD (`stage-actions.ts`), task CRUD (`space-tasks-actions.ts`), notes (`client-notes-actions.ts`), `importContactsToSpace` | `crm_stages`, `crm_deals`, `crm_activities`, `contacts`, `client_notes`, `crm_tasks`, `contact_interactions`, `contact_relationships` | ✅ |
| **Inbox** | Read every contact thread (email/sms/in-app), reply through the consent gate | `crm/inbox/page.tsx` → `inbox-workspace.tsx`; `lib/crm/inbox.ts` | `sendSpaceInboxReplyAction` (tenancy check → consent/suppression gate → `enqueueEmail` + record touch) | `contact_interactions` (via the one front door) | ✅ reply-only (no compose-new; pure leads can't be replied to by design) |
| **Lead capture** | Browse every captured lead + the immutable **door** each arrived through + mailable status | `crm/leads/page.tsx`; `lib/crm/lead-capture.ts` | none (read view; capture happens on public surfaces) | `lead_entry_points`, `lead_touchpoints` (no-overwrite trigger), `contacts` | ✅ |
| **Capture links (doors)** | Mint signed links for front doors 2–5 (warm intro, event check-in, lead magnet, card swap); warm-intro seals the lead pending the invitee's own opt-in click | `crm/doors/page.tsx`; `lib/crm/lead-links.ts` | `createWarmIntroLink`, `makeEventLink`, `makeMagnetLink`, `makeExchangeLink` (editor + crm gate; URL-validated) | `lead_entry_points`, `contacts` | ✅ (public accept surfaces live at `app/(capture)/{intro,checkin,unlock,exchange}`) |
| **Shared with team** | Team-read view of contact **cards** members shared (network `shared` tier) — card fields only, never private notes/tags | `crm/shared/page.tsx`; `listSpaceSharedContacts` | none here (share mutation lives in connections) | `network_contacts` (notes excluded from projection) | ✅ (gate deliberately broader: any team member) |
| **Vera autonomy / playbooks** | Cockpit dial: `suggest_only` (default) vs `safe_auto`; run/dismiss playbooks through the governed confirm-then-execute path | `crm/autonomy-control.tsx`, `crm/playbook-actions.ts`; `lib/playbooks/*` | `setSpaceAutonomy`, `runSpacePlaybookAction`, `dismissSpacePlaybook` | `playbooks`, `playbook_runs`, `vera_autonomy_decisions`, `resonance_*` | ✅ (see gaps) |

**Resonance gaps**

- 🔴 **Stale TODO docstrings** in `lib/crm/lead-capture.ts` (lines ~776–883) still say "build the
  accept UI / wire to the RSVP path / build the magnet form / build the reciprocal handshake
  surface" — but all four surfaces are **shipped** under `app/(capture)/*`. Verified: the docstrings
  are outdated; clean them up.
- ⚠️ **Circuit-breaker `unsubscribed` signal not wired** — `PlaybookRunTally.unsubscribed` is
  hard-coded `0` (`circuit-breaker.ts`); the breaker trips on dismiss-rate only.
- ⚠️ **Playbook backtest** uses a coarse same-window churn proxy "until a snapshot history table
  lands" (`backtest.ts`).

---

## 4. Marketing — reach & growth

Two shells, one set of bodies: the hub **Marketing tab** mounts `<SpaceMarketing>` (a pill sub-nav,
each gated module = one pill behind its own `<Suspense>`); the **standalone Focus pages**
(`/marketing`, `/settings/email`, `/settings/email-style`, `/settings/qr`, `/settings/automation`)
mount the same self-gating bodies. The admin CRM mirror is `/admin/crm/marketing` over the root
Space. Note: `lib/studio/*` is the **admin/global** engine; the space engine lives in `lib/spaces/*`.

| Module | Capability | Route / key files | Server actions | Tables | Gate / cap | Status |
|---|---|---|---|---|---|---|
| **Email (compose)** | Plain-text campaign composer; audience = all/segment/tag/circle/individuals; send now or schedule; deliverability panels | `settings/email` → `email-body.tsx`; `lib/spaces/campaigns.ts` + `email.ts` | `create/update/schedule/sendSpaceCampaign`, `setSpaceEmailEnabled` (kill-switch) | `campaigns`, `outreach_sends`, `email_suppressions`, `contacts` | `email` fn (`admin`), freemium "300/mo free, 25k/mo". Runtime hard cap 500/day. Kill-switch `spaces.email_enabled` default OFF | ✅ |
| **Email design** | Full block-based on-canvas WYSIWYG editor, seeded from brand palette; drafts, test-send, **real bulk send** | `/marketing` → `SpaceEmailWorkspace` over shared `EmailCanvasEditor`; `lib/spaces/email-drafts.ts` | `create/load/save/deleteSpaceEmailDraft`, `sendSpaceTestEmail`, **`sendSpaceEmailDraft`** | `campaigns.block_json` / `compiled_html` | `email` fn (freemium) | ✅ |
| **Email style** | Tune the brand-derived default palette; reset to brand | `settings/email-style` → `EmailStyleEditor` | `setSpaceEmailStyle` | `spaces.preferences.emailStyle` | `email` fn | ✅ |
| **QR codes** | Managed dynamic codes (editable destination, no reprint), optional splash landing, lead-grab capture, scan stats | `settings/qr` → `qr-body.tsx`; `lib/qr/space-codes.ts` | `createSpaceCode`, `setCodeSplash` (re-resolves own `space_id`) | `qr_codes`, `qr_scans` | `qr` fn (`editor`), freemium "3 free, then unlimited". App caps 3/25/100/500 by plan | ✅ (url destination only in v1) |
| **Scans & insights** | Scan analytics (total / signed-in / NFC vs printed) | `settings/qr#scans` — hub pill re-renders `QrBody` | reuses `listSpaceScanRows` | `qr_scans` | `qr` fn | ⚠️ |
| **Automation** | Trigger→action rules + named drip sequences over own contacts; manual enroll lever | `settings/automation` → `automation-body.tsx`; `lib/spaces/automation.ts` + drip runner | rules/sequences/steps CRUD, `startSequenceForAudience` | `space_automation_rules`, `space_drip_sequences/steps/enrollments` (service-role only) | premium "on a paid plan"; **gates on the `automation` entitlement** | ⚠️ |

**Marketing gaps**

- 🔴 **No open/click tracking for space email** — the space overview hard-codes `opened:0, clicked:0`
  (`space-marketing.tsx` documents it: `outreach_sends` records delivery only). The admin overview
  *does* have opens/clicks from `email_events`; the space surface does not.
- ⚠️ **Scans pill = QR pill.** `space.insights` re-renders the entire `QrBody` (codes + scans) rather
  than a scans-only view — a near-duplicate surface; candidate for consolidation.
- ⚠️ **Automation gate inconsistency.** Catalog row is gated `fn: 'crm'` but the body + writes gate on
  the `automation` entitlement. Only one action type (`email_audience`) and a fixed trigger list are
  wired, though the schema anticipates more.
- 🔴 **Doc drift:** `email-drafts.ts` header still says block-draft bulk send is "a follow-up" — it's
  fully implemented (`sendSpaceEmailDraft`).

---

## 5. Offerings & Money — everything the Space sells

The panel host `settings/offerings/page.tsx` gates once, then stacks section bodies by `#hash`
(`#availability`, `#memberships`, `#donations`, `#enroll`, `#tickets`, `#checkin`); each section
re-checks its own function gate and each write re-checks `canEditProfile` + `spaceFunctionAccess`.
**Take-rate model** (`lib/pricing/settings.ts`): 5% free space, 3% paying Business/Nonprofit, 8%
individual member seller — but **only applied in Shop checkout** (and the dark booking-deposit path).

| Module | Capability | Route / key files | Tables | Money in v1 | Status |
|---|---|---|---|---|---|
| **Booking** | Weekly availability windows, reusable Services (duration/price/deposit/questions), scheduling rules (buffers, min-notice, blackouts), upcoming-bookings list; member book/reschedule/cancel | `#availability` → `availability-body.tsx`; `lib/spaces/booking.ts` (largest lib, ~1.9k lines) | `space_availability`, `space_service_types`, `space_bookings`, `space_availability_schedules/overrides` | Free confirm-only; deposit path dormant | ⏳ |
| **Memberships** | Publish tiers (name, price+interval **display-only**, benefits); see who joined; member join/cancel | `#memberships` → `memberships-body.tsx`; `lib/spaces/memberships.ts` | `space_membership_tiers`, `space_memberships` | **None** (display-only price) | ⏳ / 🔴 |
| **Donations** | One donation ask per Space (fund, description, suggested amounts) | `#donations`; `lib/spaces/donations.ts` | `space_donation_asks` (one row/space) | **None** (config-only; no donate mutation) | ⏳ |
| **Enrollment** | One program/cohort (name, schedule, dates, capacity); enrollees list; member enroll/cancel with seat guard | `/settings/enroll` → **redirects** to `#enroll`; `lib/spaces/enroll.ts` | `space_programs`, `space_enrollments` | **None** | ⏳ |
| **Tickets** | Ticket tiers, kind `free` or `rsvp` (capacity-limited); RSVP list; member RSVP/cancel | `#tickets`; `lib/spaces/tickets.ts` | `space_ticket_tiers`, `space_ticket_rsvps` | **None** (no `paid` kind) | ⏳ |
| **Check in** | Mint/show one QR door code (reuses the QR node→capture pipeline); roster + count | `#checkin`; `lib/spaces/checkin.ts` | `nodes` (kind `checkin`), `captures` | None (no money) | ✅ cleanest module (min-role `moderator`) |
| **Shop** | The real commerce console: Catalog (products/variants/tickets, condition, tags, images, Vera-drafted copy), Orders (earnings/payouts), Storefront (renameable public tab + publish) | `/settings/shop` (3 tabs) → `shop-actions.ts`; `lib/commerce/*` | `commerce_products/variants/orders/order_items`, `spaces.preferences.storefront` | **Take-rate applied** in `checkout.ts` (Stripe destination charge) — but gated OFF | ⏳ (authoring works; nothing charges until payouts live) |

**Offerings gaps**

- 🔴 **Replace-set orphaning** (self-flagged in memberships, tickets, enroll): delete-then-reinsert on
  tier/program save orphans child rows' foreign keys; readers fall back to a generic "Member" label.
  **Must move to upsert-by-id before any paid version ships.**
- 🔴 **Caps not enforced.** `feature-meters.ts` allowances are placeholders and `withinAllowance`
  short-circuits `true` — no offering enforces "15 bookings/mo", "10 members", "50 tickets", etc.
- ⚠️ **Meter/gate key drift** — `feature-meters.ts` keys (`space_bookings`, `space_memberships`,
  `space_tickets`, `space_journey`) have no matching `FEATURE_GATES` entries; a live-billing footgun.
- ⏳ **Unapplied migration** `20261102000000_bookable_services` is intentionally not applied ("apply
  when payments are on"); `space_bookings.order_id/product_id` + the deposit flow are dormant.
- ⚠️ **Stale comments:** `space-modules.ts` says "Enrollment keeps its own page" (it redirects); the
  offerings host still narrates per-type presets although types collapsed to `root/business/nonprofit`.

---

## 6. Content & Programs — what the Space teaches

Three modules, all `render: 'link'` to their own manager. Shared authoring gate: create/mutate
authorizes on `canEditProfile` (owner/admin/editor/staff), **not** the caller's member tier — a free
member who runs a Space can build for their members; the paid lever bites only at the
public-library / publish boundary.

| Module | Capability | Route / key files | Publish model | Tables | Status |
|---|---|---|---|---|---|
| **Practices** | Build daily-log practices, each with a timer (mindless / movement / timer-with-movement, warm-up, pillar, rewards); Vera composer | `practices/page.tsx` + shared `PracticeBuilder`; `lib/practices.ts` | Free to go **live in-space**; public **Library** needs paid Crew + staff review | `practices` (+ taxonomy) | ✅ |
| **Journeys** | Build multi-week programs (phases of practices + lesson/knowledge-check blocks); edit/publish/duplicate/delete; widget-based page config | `journeys/page.tsx` + shared `JourneyEditor`; `lib/journey-plans.ts`, `publish-gate.ts` | Unlimited drafts; free owner may publish **1**; more + library listing need paid | `journey_plans`, `journey_plan_items`, `journey_plan_adoptions` | ✅ / ⚠️ |
| **Airwaves** | Recordings library ("the Loom"): upload A/V, manage catalog + visibility, attach to hosts, group into **Shows** (podcast RSS + episodes) | `settings/airwaves` → `airwaves-console.tsx`; `lib/airwaves/*` | Space-scoped only (P1 free; no public library) | `recordings`, `podcast_shows`, `recording_attachments`, `library_assets` (deny-all RLS) | ✅ / ⚠️ |

**Content & Programs gaps**

- 🔴 **Journey publish UI ⇄ gate mismatch.** `journey-manage-card.tsx` toggles only
  `private ⇄ public` (`setJourneyVisibility(plan.id, isPublic ? 'private' : 'public')`), but the free
  tier's actual free state is **`unlisted`** (published-to-space, not library) — which the data model
  and gate support (verified: `visibility: 'private' | 'unlisted' | 'public'`). As wired, a free
  owner's only "Publish" is the paid/library `public` path; the intended free unlisted publish isn't
  exposed on the card.
- 🔴 **Airwaves attach seam half-wired.** The DB + `attachRecording` support 6 host kinds
  (`space, journey, journey_item, practice, event, product`), but `RecordingAttachManager` is only
  rendered for `space` and `product`. **journey / journey_item / practice / event have no attach
  UI** — even though the console copy tells operators to attach from those editors.
- ⚠️ **Team-authoring ownership gap** (practices + journeys): *create* is space-capability-gated, but
  opening the shared editor is **creator-or-admin-gated** — a non-creator Space editor can't edit
  content a teammate created.
- ⏳ Airwaves money is off (uploads forced `free`); re-upload/replace-in-place is P2; several
  `20261151–153` migrations are marked "WRITTEN, NOT APPLIED" — confirm applied state before relying.

---

## 7. Profile & Settings — configuration

| Module | Capability | Route / key files | Server actions | Tables | Status |
|---|---|---|---|---|---|
| **Profile & Settings** | One section form: brand name, tagline, story, accent, logo/cover, page theme, visibility; completeness meter | `settings/basics` → `settings-form.tsx`; `lib/spaces/profile-settings.ts` | `updateSpaceProfile`, `setSpaceImages`, Vera bio/tagline drafts | `spaces` columns + `spaces.preferences.theme` | ✅ / ⚠️ label |
| **Team & members** | Roster (role/remove/suspend/reactivate/bulk), invite-by-email, seat counter | `settings/members` → `members-body.tsx` (also `?panel=members`) | roster CRUD (`roster-actions.ts`), `createInvite`/`revokeInvite` | `space_members`, `space_invites`, `profiles` | ✅ / 🔴 email |
| **Reviews** | Public rating + review wall; member leaves/revises one; operator hide + reply | `(profile)/reviews/page.tsx` → `space-reviews.tsx`; `content-actions.ts` | `submitSpaceReview`, `hideSpaceReview`, `respondToSpaceReview` | `space_reviews` | ✅ |
| **Plan & Billing** | Plan ladder / pricing, usage meters, checkout; nonprofit verification | `settings/billing` → `billing-body.tsx` | `startSpacePlanCheckout`, `startSpaceLoadoutCheckout` (double-gated on `billingLive()`) | `spaces.plan`, `spaces.entitlements.billing` | ⏳ (billing OFF; CTAs return "not available yet") |
| **Danger zone** | Permanently delete the Space + everything it owns (cascade) | inline in `SpaceSettingsSurface`; `deleteSpace` | `deleteSpace(spaceId)` | `spaces` (ON DELETE CASCADE) | ✅ owner/staff only |
| **Page** *(rail-only)* | Full on-canvas page editor + settings (cover, hero, header CTA, block order, multi-page nav, business info, services, publish) | `manage/layout/page.tsx`; ~20 actions | layout/hero/pages/business-info CRUD | `spaces.preferences.*` (pageDocs, pages, hero…) | ✅ / ⚠️ (multi-page locked behind `space_full_website`; excluded from the hub) |
| **Module Manager** *(direct-access)* | Turn features on/off, set per-feature min-role, reorder/hide menu | `manage/modules/page.tsx` → `module-manager.tsx` | `saveSpaceModuleMenu`, `setSpaceFeatureEnabled`, `setSpaceFeatureMinRole` | `spaces.preferences.moduleMenu`, `entitlements`, `feature_roles` | ✅ / ⚠️ (no menu entry) |
| **Mode** *(direct-access)* | Pick how the Space runs; preview what it emphasizes; override labels | `manage/mode/page.tsx` → `mode-settings.tsx`; `lib/spaces/modes.ts` | `switchSpaceFocus` (re-seeds pipeline), `resetModeOverrides` | `spaces.mode_variant`, `preferences.mode` | ✅ (emphasis-only; never touches entitlements/data) |

**Profile & Settings gaps**

- 🔴 **Invite email delivery not shipped** — copy says "share their link until email delivery ships";
  a copyable accept-link is the current fallback.
- ⏳ **Billing globally OFF** — checkout disabled, seat + entitlement enforcement dormant (preview only).
- ⏳ **Multi-page website** is default-deny behind `space_full_website` (no plan grants it yet).
- ⚠️ **`/manage/modules` and `/manage/mode` have no menu entry** — direct-access / hub-search only.
  `space.layout` (Page) is unhideable yet excluded from the browse hub (page editing moved to the rail).
- ⚠️ **Label drift:** `space.basics` advertises "contact and hours, links" but those fields live in
  the separate layout `setSpaceBusinessInfo` node; the `Page` label ("rows/columns") understates a
  full page editor. Stale "Module Manager module" comments linger in `space-modules.ts`.

---

## 8. Consolidated gap & to-do matrix

Prioritized across all five clusters. 🔴 = defect / real gap · ⚠️ = drift / inconsistency ·
⏳ = intentionally dormant (billing/payments off).

| # | Severity | Cluster | Finding | Suggested fix |
|---|---|---|---|---|
| 1 | 🔴 | Content | Journey publish button never exposes `unlisted`; free owners can only hit the paid `public` path | Add an unlisted/"publish to space" option to `journey-manage-card.tsx` |
| 2 | 🔴 | Content | Airwaves attach UI only wired for `space` + `product`; journey/practice/event editors lack it | Render `RecordingAttachManager` in those editors |
| 3 | 🔴 | Offerings | Replace-set delete-then-insert orphans membership/ticket/enrollment child rows | Move to upsert-by-id before any paid version |
| 4 | 🔴 | Resonance | Stale TODO docstrings in `lead-capture.ts` claim capture surfaces are unbuilt (they ship) | Delete/refresh the docstrings |
| 5 | 🔴 | Marketing | No open/click tracking for space email (overview hard-codes 0) | Wire `email_events` into the space overview, or state the limitation in UI |
| 6 | 🔴 | Marketing | `email-drafts.ts` header says bulk send is a follow-up (it's implemented) | Reconcile the comment |
| 7 | 🔴 | Profile | Invite email delivery not shipped (link-only fallback) | Ship invite email or make the fallback explicit in-product |
| 8 | ⚠️ | Content | Team-authoring gap: non-creator Space editor can't edit a teammate's practice/journey | Gate the editor on Space-manage capability, not just creator-or-admin |
| 9 | ⚠️ | Marketing | Automation gate inconsistency (catalog `crm` vs body `automation`); one action type only | Align gate keys; expand triggers/actions when ready |
| 10 | ⚠️ | Marketing | Scans pill re-renders the whole QR body (near-duplicate surface) | Make `space.insights` a scans-only view |
| 11 | ⚠️ | Offerings | Meter keys in `feature-meters.ts` have no matching `FEATURE_GATES` entries | Reconcile before billing goes live |
| 12 | ⚠️ | Resonance | Circuit-breaker `unsubscribed` signal hard-coded 0; backtest uses a churn proxy | Wire the unsubscribe signal + snapshot history |
| 13 | ⚠️ | All | Untyped admin client (ADR-246) across `space_*`/`crm_*`/`commerce_*`/`recordings` | Regenerate DB types |
| 14 | ⚠️ | Offerings/Profile | Stale comments (enroll "own page", per-type presets, Module-Manager module) | Copy cleanup |
| 15 | ⏳ | Offerings/Profile | Money dormant: no payment path for memberships/donations/tickets/enrollment; billing + payouts OFF | Phase-4 billing work (out of scope for the beta) |

---

## 9. Load-bearing files (reference)

- **Menu contract:** `lib/admin/modules/space-modules.ts` (the catalog), `space-hub.ts` (the five
  tabs), `space-menu.ts` (console resolution), `docs/MENU-CONTRACT.md`.
- **Gate model:** `lib/spaces/functions.ts` (functions + roles), `entitlements.ts`,
  `function-access.ts` (live seam), `lib/pricing/{gates,feature-meters,settings}.ts` +
  `lib/billing/{fees,pricing-keys,connect}.ts` (money model).
- **Console shell:** `app/(main)/spaces/[slug]/manage/{page,manage-board,console}.tsx`.
- **Per-cluster engines:** `lib/crm/*` + `lib/playbooks/*` (Resonance); `lib/spaces/{campaigns,email,
  email-drafts,automation}.ts` + `lib/qr/*` (Marketing); `lib/spaces/{booking,memberships,donations,
  tickets,checkin,enroll}.ts` + `lib/commerce/*` (Offerings); `lib/practices.ts`,
  `lib/journey-plans.ts`, `lib/airwaves/*` (Content); `lib/spaces/{profile-settings,roster,modes,
  module-menu,provision}.ts` (Profile & Settings).
