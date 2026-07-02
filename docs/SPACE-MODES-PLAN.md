# Space Modes — type-as-operating-mode plan (roles surface + settings + marketing focus)

> **Note (2026-07-01, ADR-491).** `lib/spaces/blueprints.ts` and the four-template layer
> (`lib/spaces/templates.ts`) have been DELETED. The public Space profile is now
> operator-composed feature-block pages; the surviving per-type defaults (accent / primary-CTA
> label / hero stat set / provisionable types) live in `lib/spaces/profile-config.ts`, and the
> `ModeProfile` dropped its unused `blueprint` field. Read the "blueprint" references below as
> `lib/spaces/profile-config.ts`.

> **The answer, first.** Now that practitioner / coach / business / studio all bill on the one **Pro**
> plan, the old `spaces.type` stops being a price tier and becomes an **operating Mode**: a preset layer
> that decides which Pro modules lead, the default settings, the CRM pipeline, the lexicon, the
> onboarding, and the recommended add-ons, **without changing what the Space pays for**. A Mode never
> gates a feature (every Pro Space can use every module); it only decides what is surfaced first and how
> it is framed. This is a data-driven extension of the per-type defaults already in
> [`lib/spaces/profile-config.ts`](../lib/spaces/profile-config.ts), pushed from the public profile onto the
> operator console. Decision: ADR-461. Implementation folds into Phase C (the role surface + settings)
> and Phase F (marketing + the pricing table) of [PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md).

## 1. Why Modes (the problem)

The 7 plans collapsed to 3 (Pro / Nonprofit / Organization, ADR-458). But a coach, a product business,
and a service business run their day very differently:

| Operator | Runs their business on | Sells | Calls people |
|---|---|---|---|
| Coach | packages + scheduling | multi-session packages, programs | clients / students |
| Service business | bookings + quotes | appointments, retainers | clients / customers |
| Product business | catalog + storefront | products, one-time + subscriptions | customers |
| Studio / gym | recurring classes + memberships | memberships, class packs | members |
| Practitioner | 1:1 sessions + practices | sessions, paid programs | clients |
| Nonprofit | programs + donations | donations, memberships | supporters |
| Event space | ticketed events | tickets, passes | attendees |

If every Pro Space opens to the same generic console, each operator has to hunt for the 20% of modules
they live in and ignore the rest. **Mode is the fix: same plan, same modules underneath, a tailored
front door per operating model.** It is the operator-side twin of the public-profile blueprint that
already differentiates these types on the visitor side.

## 2. The model

### 2a. Mode = type, Focus = sub-mode
- **Mode** is `spaces.type` (practitioner / coaching / business / event_space / organization / lab). No
  new column for the Mode itself; it already exists and already drives the profile blueprint.
- **Focus** is a NEW finer dimension for types that span distinct operating models. Stored as
  `spaces.mode_variant text` (nullable; a sensible default per Mode). Keep the variant set SMALL and
  meaningful:

| Mode | Focus variants | What the Focus changes |
|---|---|---|
| **Business** | `service` (default) · `product` | service = bookings/quotes/retainers; product = catalog/storefront/orders/inventory |
| **Coaching** | `packages` (default) · `cohort` | packages = multi-session packages + 1:1 scheduling; cohort = programs/curriculum/enrollment |
| **Practitioner** | `appointments` (default) · `programs` | appointments = 1:1 booking; programs = paid program enrollment |
| **Event Space** | `ticketed` (default) · `membership` | ticketed = tickets/passes; membership = recurring access |
| **Organization** | `donations` (default) · `programs` | donations = giving + supporters; programs = enrollment + impact |
| **Lab** | `cohort` (default) | experiments / cohorts (internal for now) |

A new Mode or Focus is one descriptor in the registry, never a core edit (the §2.10 extensibility
contract the blueprints already follow).

### 2b. What a Mode preset controls (the `ModeProfile` descriptor)
A pure, data-only descriptor per `(type, variant)`, in a new `lib/spaces/modes.ts` that EXTENDS the
existing `RoleBlueprint`. Everything below is a **default or an emphasis**, never a lock:

| Facet | Example (Coach · packages) | Example (Business · product) |
|---|---|---|
| **Console nav order / module emphasis** | Scheduling · Packages · CRM · Programs · Dispatch | Catalog · Orders · CRM · Storefront · Marketing |
| **Default settings toggles** | bookings on, packages on, storefront off | storefront on, inventory on, bookings off |
| **Default CRM pipeline + stages** | Lead → Discovery call → Package sold → Active → Renewal | Lead → Cart → Purchased → Repeat → Lapsed |
| **Lexicon / labels** | clients, packages, sessions | customers, products, orders |
| **Onboarding + starter templates** | seed a sample package + a booking type | seed a sample product + a storefront section |
| **Public profile defaults** | (reuse `profile-config.ts` coaching) accent/CTA/hero stats | (reuse business) |
| **Dashboard widgets + next-best-actions** | "fill your calendar", "renew a client" | "list a product", "recover a cart" |
| **Recommended add-ons** (suggested, not auto-on) | AI Engine + Marketing | Marketing + Branding |

The descriptor is consumed by: the create wizard, the console nav/dashboard, the CRM pipeline seed, the
onboarding seeder, and the marketing/landing pages. One source of truth, read everywhere.

### 2c. Rules that keep it clean
- **Mode never gates.** A capability is gated only by the entitlement engine (plan + add-ons, ADR-458)
  and the space-role ladder. Mode only orders + defaults + labels. So a coach can still open the
  storefront; it just is not in their face.
- **Switching Mode/Focus is non-destructive + reversible.** Switching re-applies defaults (nav, pipeline
  suggestion, lexicon) but never deletes data: a product Space switched to service keeps its catalog,
  and its bookings light up. Stage changes to an in-use pipeline are additive (never drop a stage that
  holds records; offer to map).
- **Operator overrides win.** Once an operator hand-sets a toggle, the label, or the pipeline, a later
  Mode default never clobbers it (track "set by operator" so re-presets are safe, the same posture as
  the brand accent "guest" rule in the blueprints).

### 2d. Modes belong to tiers (Tier × Mode, ADR-472)

Modes thread HORIZONTALLY across the four Space tiers (Pro · Business · Non-profit · Organization,
`docs/PRICING-LADDER-PLAN.md` §1b). The Tier sets the depth + seat envelope; the Mode sets the layout +
features-forward inside it. A tier surfaces only a CURATED set of Modes in the create wizard + Mode settings
(framing only, never a gate):

| Tier | Modes surfaced |
|---|---|
| **Pro** (solo) | Practitioner · Coaching · Creator (solo-shaped, monetization-forward layouts) |
| **Business** (team) | + Business · Studio · Event space (all modes, full depth) |
| **Non-profit** | Organization · Community forward; all available |
| **Organization** | all + **Custom mode** (bespoke layout/features, made-to-order) · Lab |

The `ModeProfile` registry gains the curated per-tier sets + the Organization-only **Custom mode**. Switching
Mode still changes only ordering/labels/defaults (ADR-461 §2c), so the Tier × Mode pairing never affects any
capability gate.

## 3. The role surface + settings rework

### 3a. Create wizard — "What do you run?"
One question up front maps to Mode + Focus (mirrors the persona picker in
[`lib/onboarding/personas.ts`](../lib/onboarding/personas.ts)):

> Coach (packages & scheduling) · Service business (bookings & quotes) · Product business (catalog &
> storefront) · Studio / gym (classes & memberships) · Practitioner (1:1 sessions) · Nonprofit
> (programs & donations) · Event space (tickets)

The pick seeds the ModeProfile: nav, default toggles, CRM pipeline, lexicon, and a starter template.

### 3b. Console "Mode & focus" settings page (new, Focus template)
In the unified console (`/spaces/[slug]/manage`, ADR-441), a Mode settings surface that:
- shows the current Mode + Focus with a plain-language **"what this turns on"** preview (the modules it
  surfaces, the default pipeline, the lexicon, the recommended add-ons),
- offers a **switcher** (change Mode or Focus) with a non-destructive confirm ("your data stays; we will
  resurface X and suggest the Y pipeline"),
- lets the operator **override** any preset (toggle a module into/out of the nav, rename a label, edit
  the pipeline) with overrides preserved across future re-presets.

This also closes a current gap: `coaching` has a blueprint but is NOT in `CONSOLE_SPACE_TYPES`
([`lib/spaces/types.ts`](../lib/spaces/types.ts)), so coaches fall back to the legacy `/settings` hub.
The rework brings every provisionable Mode onto the one console.

### 3c. Data + migration (additive, ships behind `billing_live` OFF irrelevant here — Mode is free)
- `spaces.mode_variant text` (nullable; default resolved from type when null).
- `spaces.preferences jsonb default '{}'` for operator overrides (nav order, label overrides, toggle
  overrides) if the existing `featureRoles`/settings columns are not a clean fit. RLS unchanged
  (owner/admin writes via server actions; service-mediated). Read untyped per ADR-246 until types
  regenerate. File for hand-review, not auto-applied.

## 4. Marketing pages + the pricing table

### 4a. Per-Mode package focus across marketing
- Rewrite the persona/landing pages so each Mode leads with ITS package focus and ITS recommended
  loadout price, tying into the GE11 SEO surfaces and the Phase F persona pages:
  - **Frequency for Coaches** ($19 Pro + AI Engine + Marketing = ~$59): packages, scheduling, client CRM.
  - **for Service Businesses** ($19 + Marketing = ~$39): bookings, quotes, repeat clients.
  - **for Product Businesses** ($19 + Marketing + Branding = ~$69): catalog, storefront, your domain.
  - **for Studios** ($19 + Marketing = ~$39): classes, memberships, check-in.
  - **for Nonprofits** (Nonprofit plan, per-seat): programs, donations, supporters.
  - **for Event Spaces** ($19 Pro): tickets, check-in, dispatch.
- Each page: honest, plain voice (CONTENT-VOICE), the list-anchor + founding price, the monthly/yearly
  note, and the mission-framing line. `Product`/`Offer` + `FAQPage` JSON-LD; `llms.txt` entry.

### 4b. The pricing page table (owner ask: "create a pricing table on the pricing page")
A static (ISR) table on the commercial pricing page. Shape:

| | Pro | Nonprofit | Organization |
|---|---|---|---|
| Price | ~~$29~~ **$19/mo** founding | ~~$15~~ **$12 / seat/mo** | **from $199/mo** |
| Billing | monthly / yearly (2 months free) | per licensed seat | sales-assist |
| For | coaches, businesses, practitioners | verified 501(c)(3) | enterprise / multi-space |
| Core (included) | Branded site · QR Studio · Bookings · Tickets · Enrollment · Check-in · Donations · Memberships · **CRM** · analytics | all of Pro, all add-ons | everything + SSO / federation |
| 🎯 Marketing add-on | +$20/mo | included | included |
| 🧠 AI Engine add-on | +$20/mo | included | included |
| 👥 Team add-on | +$9 / seat/mo | per seat | volume |
| 🎨 Branding add-on | +$30/mo | de-brand | included |
| Take-rate | 5% | 3% | custom |

Below the table, a **"by who you are"** strip mapping each Mode to its recommended loadout + monthly
total (Coach $59 · Service business $39 · Product business $69 · Studio $39 · Nonprofit per-seat ·
Event $19), each linking to its persona landing page. The monthly/yearly toggle, the founding-price
anchor, and the grandfather note (ADR-458 §1a) render on the same page. Fully static, JSON-LD per row.

## 5. Phasing (folds into the pricing overhaul)

| Step | Scope | Migration | Lands in |
|---|---|---|---|
| **M1 · Mode registry** | `lib/spaces/modes.ts` (ModeProfile per type+variant), pure + unit-tested; align with `profile-config.ts` | no | Phase C |
| **M2 · Data** | `spaces.mode_variant` (+ `spaces.preferences` if needed); default resolver | yes (file, hand-review) | Phase C |
| **M3 · Surface** | create wizard "what do you run?", console Mode settings page + switcher + overrides, console nav/dashboard/CRM read the ModeProfile; bring coaching onto the console | no | Phase C |
| **M4 · Onboarding** | per-Mode starter templates + CRM pipeline seed | no | Phase C / G3 |
| **M5 · Marketing** | per-Mode persona landing pages + package focus rewrite + JSON-LD + llms.txt | no | Phase F |
| **M6 · Pricing table** | the static pricing-page table + "by who you are" strip | no | Phase F |

Mode is FREE (it is framing, not entitlement), so none of this waits on `billing_live`; the marketing +
pricing-table steps (M5/M6) ride with Phase F so the copy and the live prices ship together.

---

*Owner: Daniel (Vision Steward). Created 2026-06-30. Source of truth for the Space Modes rework;
companion to [PRICING-LADDER-PLAN.md](PRICING-LADDER-PLAN.md) (ADR-458) and the profile per-type defaults
([`lib/spaces/profile-config.ts`](../lib/spaces/profile-config.ts)). Decision: ADR-461. Notion strategy pages
(Pricing & Value Ladder, Role & Permissions) link here.*
