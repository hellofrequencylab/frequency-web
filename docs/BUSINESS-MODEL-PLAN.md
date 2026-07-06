# Business model plan — two programs, one simple system

**Status:** Approved 2026‑07‑06. Decision of record: **ADR‑552** (`docs/DECISIONS.md`).
Supersedes the multi‑tier framing of ADR‑458/460/472/475 and finalizes the
universal‑functions + usage‑meter direction of ADR‑517/518/519/520 into a **two‑type,
two‑program** shape. Everything ships behind `billing_live = OFF`; nothing charges until
an operator flips it.

This is the source of truth for the collapse. It is a finishing job, not a greenfield:
functions are already universal (ADR‑517), usage meters and the Module Manager are already
built (ADR‑519, ADR‑546), and a 7→4 plan collapse already exists as an (unapplied) migration
file. This plan takes it the rest of the way to **two**, and strips the clutter around it.

---

## 1. The model in one screen

| Axis | Before | After |
|---|---|---|
| **Types** | 8 (`root, practitioner, business, organization, coaching, event_space, lab, partner`) | **2** public: `business`, `nonprofit` (+ `root` host, hidden). Practitioner / Coaching / Studio / Event become free **Focus** presets *under* Business |
| **Plans** | 5 (`free/pro/business/nonprofit/organization`) + `whitelabel` + add‑on loadout | **`free · business · nonprofit`.** Free‑vs‑paid is not a separate plan, it is a **usage state** within Business |
| **Paywall** | tier ladder + per‑feature unlocks | **usage caps + per seat + take‑rate.** Every tool on for everyone. A Space never shows a lock |
| **Public chip** | type label ("Practitioner") | **"Business" / "Non Profit"** only |
| **Admin** | ~9 surfaces, 3 overlapping on/off controls, ~9 dead routes | **one "Menu & setup" surface**, dead routes deleted, create ≈ one field |

**Naming (locked, see NAMING.md):** "Business" and "Non Profit" are each simultaneously a
**type** (what the profile is) and a **plan** (how it bills). One word, no third vocabulary
— no "Pro", no "Organization", no tier names. Since paid Business is just a free Business
*using more*, there is **no second plan name to switch to**: you stay Business and pay as you
scale.

**The vision this serves:** a small, just‑starting‑out coach or practitioner can run their
whole first month free, on one real page, and never be met with hundreds of dollars a month.
The free tier is a genuine taste, capped so that the moment they start winning, upgrading is a
no‑brainer.

---

## 2. Free caps — the free Business allowance

Reset monthly where marked ↻. Generous on **activation** (reach the first win), tight on
**team / scale / polish** (where "I've outgrown free" should live). Numbers live in
`lib/pricing/feature-meters.ts`; everything is dormant until `billing_live` is flipped.

| Feature | Free | Business | Lever |
|---|---|---|---|
| Pages | 1 + "Powered by Frequency" | multi‑page + custom domain, badge off | polish |
| Seats | 1 | +$9 / seat / mo | team |
| CRM contacts | 250 | 2,500 → scale | activation→scale |
| Bookings ↻ | 15 / mo | unlimited | activation |
| Journey enrollees | 10 active | unlimited | activation |
| Email sends ↻ | 300 / mo | 5k → 25k steps | scale |
| Memberships | 10 active, 1 tier | unlimited, multi‑tier | scale |
| Tickets | 1 event, 50 tickets | unlimited | scale |
| Donations | on, no amount cap | on, lower take‑rate | take‑rate |
| Check‑in | unlimited | unlimited | — |
| QR codes | 3 | unlimited | scale |
| Automations / pipelines | 1 pipeline, no automations | multi + automations | scale |
| AI (Vera) | ~10 msgs / day, no playbooks | more + playbooks; heavy = add‑on | scale |
| Money take‑rate | ~5% + Stripe | ~3% + Stripe | the self‑funding trigger |

**The no‑brainer math (surfaced in‑product):** once a Space processes ~$1,000/mo, the 2%
take‑rate saving (~$20) exceeds the ~$19 base. The billing surface shows "You'd have saved
$X this month on Business." Any operator clearing about a grand a month upgrades on pure
economics.

**Business scaling = base + two dials.** Low base (~$19 founding / $29 list) includes the big
cap jumps + 1 seat + multi‑page/custom domain/badge‑off + the lower take‑rate. Then it scales
only by **per seat** (+$9) and **usage steps** on the two dimensions that actually cost us
(email sends, AI). Everything else is effectively unlimited at base — no nickel‑and‑diming.

**Non Profit** is the same depth as Business, discounted, per licensed seat, 501(c)(3)
verified, with donation/volunteer framing.

---

## 3. Decisions taken (defaults, reversible)

1. **`organization` DB value → renamed to `nonprofit`** (cleaner one‑word canon). Backfilled.
2. **Free take‑rate 5% / Business 3%.**
3. **AI on free:** a small daily Vera taste (~10 msgs/day), no autonomous playbooks.
4. **Focus presets kept** (Practitioner / Coach / Studio / Event as free framing under
   Business) — they are free value and already built; they tailor the starter layout,
   pipeline, and lexicon without adding any paywall.

---

## 4. The phased build

Each phase is its own ADR + PR, gated (`tsc` / eslint / vitest / `check:canon` /
`check:authz`), all behind `billing_live = OFF`.

### Phase 0 — Docs + decisions (this doc)
`docs/BUSINESS-MODEL-PLAN.md` + **ADR‑552** + the `NAMING.md` Business / Non Profit entry.
**Verify DB reality first:** the keystone pricing migrations (`20260915…`, `20260916…`,
`20260917…`) are headered *file‑only, NOT applied*. Confirm whether the live DB is still on
the pre‑collapse (7‑plan) shape before Phase 2 writes any migration.

### Phase 1 — Collapse types → Business / Non Profit
- **DB migration:** rewrite `spaces_type_check` to `('business','nonprofit','root')`; backfill
  `UPDATE spaces` (`practitioner/coaching/event_space/lab/partner → business`;
  `organization → nonprofit`). Keep `root`. Regenerate `lib/database.types.ts`.
- **TS unions:** shrink `SpaceType`, `SPACE_TYPES`, `CONSOLE_SPACE_TYPES`,
  `PROVISIONABLE_TYPES`, `DIRECTORY_TYPES`, `ACCENT_BY_TYPE`, `CTA_LABEL_BY_TYPE`.
- **Modes (`lib/spaces/modes.ts`):** re‑key every removed‑type preset as `business:<focus>`
  (appointments, packages, service, product, ticketed…) + a `nonprofit` set; rewrite
  `DEFAULT_VARIANT` and `WIZARD_CHOICES`. The registry already supports N focuses per type, so
  this is mostly a data edit that *keeps* the tailored starter presets as free framing.
- **The one real logic move:** `components/widgets/entity/entity-cta.tsx` forks the
  transactional widget (Booking / Membership / Donate / Enroll / Tickets) on `type` — re‑base
  it on **Focus (`mode_variant`)** so a Business with the "appointments" focus still books.
- Re‑pin `lib/marketing/personas.ts` (or the build test 500s), `lib/jsonld.ts` schema map,
  `entity-getting-started.tsx`. Update the 6 type tests.

### Phase 2 — Collapse plans → free / business / nonprofit
- **Delete:** `settings/billing/plan-picker.tsx`, `loadout-picker.tsx`,
  `whitelabel-request.tsx` + the `requestWhitelabel` action + their render sites in
  `billing-body.tsx`. (Move the reused `IntervalSwitch` out of `loadout-picker` first.)
- **Collapse to Business (+ nonprofit):** `SPACE_PLANS`, `SPACE_PLAN_KEYS`,
  `CATALOG_ITEM_KEYS`/`CATALOG` (archive `pro_base`, `organization`, `whitelabel` via the
  existing `RETIRED_*` mechanism so grandfathered rows still resolve), `PLAN_FLAG`,
  `catalogKeysForLoadout`, `planForItemKeys`, `ITEM_KEYS`, `spacePlanRows`,
  `PricingDefaults.plan`, `take_rate`, `PRICING_FLAG_KEYS`, and the
  `space_subscription_items.item_key` CHECK (drop `organization`).
- **Keep:** seat plumbing, usage meters, the locked‑price grandfather, `addon_ai`.
- Billing page becomes: **current usage + one "Go Business" CTA + seats**; Non Profit is its
  own small verified surface.

### Phase 3 — Usage becomes the paywall (set the numbers)
- Fill the §2 free allowances into `feature-meters.ts`; Business = high/unlimited + per‑seat +
  email/AI steps.
- Take‑rate → single business bps (+ nonprofit) in `lib/billing/fees.ts` / pricing settings.
- Add the **"you'd have saved $X"** nudge + the 80%‑usage upgrade prompt (partly built).

### Phase 4 — Ease of use (the admin cleanup)
- **One surface for menu + features:** merge `settings/features` into the **Module Manager**
  (each row = on/off + show/hide + reorder + optional min‑role). Delete `settings/features/*`.
- **Kill the duplicate hide path:** remove Mode's "In nav / Hidden" toggle; visibility lives
  only in the Module Manager. Mode becomes preset‑only.
- **Delete the dead route layer:** 5 commerce redirect stubs (now in `offerings`), 2 retired
  `profile` stubs, the orphaned `settings/crm` (canonical CRM is `/crm`), and the legacy
  `settings` hub's dead card UI.
- **Slim the create wizard:** drop the redundant Brand‑name field; type becomes a two‑option
  segmented control (or inferred); redirect new spaces **straight to `/manage`** (not the
  double‑hop through `settings`). A new coach creates with just a name.
- **One menu renderer:** the in‑page rail consumes the same manifest the console builds
  (retire the ~562‑line parallel resolver in `settings-panel.tsx`).

### Phase 5 — Public profile polish
- Chip renders **"Business" / "Non Profit"** (falls out of Phase 1's two‑value label map).
- **Tagline more prominent** (~`text-base font-medium`) and, when empty and you are the owner,
  a **"Add a tagline — say what you do"** prompt linking to the editor. One `nameLockup`
  covers both hero sizes.

### Phase 6 — Copy + go‑live prep
- Voice‑checked upgrade / pricing copy (no "unlock", no em dashes, mission framing, the
  savings number). Founding‑price anchor + annual "back the build."
- Leave `billing_live` **off** until explicitly told to go live.

---

## 5. Risks / sequencing
- **Verify migration reality before Phase 2** — the keystone pricing migrations are file‑only.
- **Phase 1 before Phase 2** (plan catalog references types in a few spots).
- **`root` type is load‑bearing** (platform host, `rootEntityId()`, delete/suspend guards) — it
  stays in the CHECK and union though it is never member‑facing.
- **Archive, never delete** retired catalog items (grandfathered subscriptions must resolve) —
  the `RETIRED_*` mechanism already does this.
- Everything stays behind `billing_live = OFF`.

---

## 6. Doc map
- Decision record: `docs/DECISIONS.md` → ADR‑552.
- Naming: `docs/NAMING.md` → "Business pages (Spaces): two designators".
- Prior context (superseded framing, kept for history): ADR‑458/460/472/475 (tiers),
  ADR‑517/518/519/520 (universal functions + usage meters), ADR‑543‑548 (modular menu).
