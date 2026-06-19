# Entity Spaces: build doc (the design foundation + master production list)

> **The answer, first.** An entity profile is **not a new layout**. It is the existing
> **Detail template** (context band + tabs, `components/templates/detail-template.tsx`)
> composed from a new set of registered **entity modules**, with a per-`type` default
> layout (a blueprint) and per-entity overrides stored as `page_settings.layout` keyed to
> the space. The only new infrastructure is a **per-entity layout scope** (extend the
> cascade to `space -> route -> section -> global`), the **entity module set**, and the
> **profile route shell**. That is what guarantees "change a module once, every profile
> updates." We build the **networked in-app profile** first (cheap, on existing infra),
> wire the **AI seams** now (cheap), keep **every page on the template system**, and hold
> the **public Puck micro-site** for later.

**Status:** ⏳ Design + backlog (no app code in this doc). Prepared 2026-06-19.
**This doc is the execution companion to:**
[`docs/ENTITY-SPACES-SYSTEM.md`](ENTITY-SPACES-SYSTEM.md) (the build-spec spine: modes,
roles, data model, architecture) and [`docs/ENTITY-SPACES-PLAN.md`](ENTITY-SPACES-PLAN.md)
(strategy, market analysis, phased roadmap). **Read both.** This doc does not repeat their
content; it turns the design direction into a UX/UI foundation and an exhaustive, phased,
checkbox backlog.
**Grounded in real code:** `components/templates/*`, `lib/widgets/{modules,templates,registry,module-routes}.ts`,
`lib/page-settings/*`, `lib/layout/page-chrome.ts`, `lib/spaces/*`, `proxy.ts`,
`lib/theme/*`, `app/globals.css`, the Puck editor (`components/page-editor/*`,
`@measured/puck`), `lib/ai/*` + `lib/ai/voice.ts`, `supabase/migrations/`.
**Canon it obeys:** [`docs/PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md) ·
[`docs/NAMING.md`](NAMING.md) · [`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md) ·
[`docs/PRESENTATION.md`](PRESENTATION.md) · [`docs/THEME.md`](THEME.md) ·
[`docs/SPACES.md`](SPACES.md) · [`docs/DECISIONS.md`](DECISIONS.md).

**Status legend:** ✅ build now · ⏳ later phase · ⚠️ compliance / counsel gated · 🔴 not built / blocker · 🅿️ parked.

**Owner constraints this doc is engineered around:**

| # | Constraint | How this doc honors it |
|---|---|---|
| C1 | **Bootstrapping: cheap and easy now** | Lean on infra that already exists (spaces, theming, page framework, CRM, QR, events, pgvector, Resend, Stripe Connect). Defer anything that costs money (custom-domain TLS ops, dedicated vector DB, native apps, eval infra, MCP server). Every backlog epic is tagged free/existing vs costs-money-later. |
| C2 | **AI integration is important** | Build the **seams** now, cheaply: the model-agnostic gateway, the per-entity Vera co-host on the cheap tier (`haiku`), `space_id`-scoped pgvector RAG. Defer the expensive parts (eval harness in CI, MCP server, voice). |
| C3 | **Every page on the template system** | The profile IS the Detail template + entity modules. Owner editing IS the existing layout editor + a Focus settings surface. Nothing is hand-rolled; one module change updates every profile. |
| C4 | **Highest design quality: make it make sense and look good** | One unified profile, typed composition per role, same visual polish as the member Quest hero. Section A sets the visual-quality bar against Frequency's existing look. |

---

## Table of contents

- [A. UX/UI design foundation](#a-uxui-design-foundation)
- [B. The template / module system for entity profiles](#b-the-template--module-system-for-entity-profiles)
- [C. Master production list (the backlog)](#c-master-production-list-the-backlog)
- [D. Phased plan + sequencing](#d-phased-plan--sequencing)
- [E. Definition of done + the ready-to-start gate](#e-definition-of-done--the-ready-to-start-gate)

---

# A. UX/UI design foundation

## A.1 The one decision that drives everything

An **entity profile** (a practitioner, a studio, a non-profit, a coaching academy, a venue)
is one entity's home inside Frequency. The design decision, locked here, is:

> **A profile is the existing Detail template, composed from registered entity modules, typed
> by the entity's `spaces.type`.** No bespoke profile layout. No second card system. No
> hand-rolled hero. The same kit that renders a Circle, a Channel, an Event, and a member
> Profile renders an entity profile, one altitude up.

This is the only choice that delivers C3 and C4 together: "looks good" is **structural**
(the kit is already polished and tested), and "easy to change site-wide" is **structural**
(a module is defined once in `lib/widgets/registry.tsx`, so editing it updates every profile
of every type at once).

## A.2 Design principles (the entity-profile non-negotiables)

| # | Principle | What it means at the pixel |
|---|---|---|
| D1 | **One family, typed members** | Every profile reads as obviously the same product. The *differences* between a practitioner and a non-profit are which tabs, which modules, and which CTA the blueprint turns on, never a different shell, type scale, or grid. |
| D2 | **Compose, never author** | Heading from `PageHeading` / the Detail context band; stats from `StatCard`; browse cards from `EntityCard` / `PersonCard`; sections from `SectionHeader`; empties from `EmptyState`; rail/grouped blocks from `ModuleCard`. Zero new layout primitives. |
| D3 | **Proper nouns carry the magic, sentences stay plain** | All profile copy obeys NAMING + CONTENT-VOICE. The voice is the camp counselor you respect. No em dashes or en dashes. Run the §10 checklist on every string, including AI-generated ones. |
| D4 | **The accent is a guest, not the host** | The per-entity `brand_accent` lands on CTAs, the type badge, active tab, and small highlights only. Surfaces stay neutral (the DAWN canvas/surface tokens). Contrast is validated. The brand never repaints the whole page. |
| D5 | **Server-first, stream the rest** | Server Components by default; never block the shell on a slow await; each profile section behind its own `<Suspense>` with a dimension-matched skeleton (PAGE-FRAMEWORK §5). The hero paints instantly; offerings/team/community stream in. |
| D6 | **Tokens only, no hex** | Every color is a DAWN semantic token. The accent is a single validated token override, never a raw hex in a component. (`lib/theme/validate.ts` `isSafeSlug` + `TOKEN_ALLOWLIST` are the guardrails.) |
| D7 | **Same polish as the Quest hero** | The bar is the existing member-facing hero quality (the Signature, the season map, EntityCard grids). A profile that looks cheaper than a member's My Quest page has failed. |

## A.3 The visual-quality bar (reference the real Frequency look)

The profile must sit comfortably next to these existing surfaces, at the same craft level:

| Reference surface | What we borrow for profiles |
|---|---|
| **The member My Quest hero** (`/crew`, `quest-*` modules incl. `quest-season-map`) | Hero density and warmth: a confident identity block, a small honest set of live numbers, one clear primary action. The entity context band should feel like this, one altitude up. |
| **The Frequency Signature** (connection layer visual) | Restraint with accent: a distinctive mark on a calm field. The entity logo + accent badge play that role; the page around them stays quiet. |
| **`EntityCard` grids** (Circles, Events, People indexes) | The browse rhythm: 16:9 cover or anchor chip, clamped title/description, a meta footer row. Offerings, Practices, and Community tabs reuse this exact card so a profile's body reads like the rest of the app. |
| **`StatCard` rows** (Dashboard template, CRM/Marketing) | The numbers band: label + value + optional delta/sparkline, neutral tile. The hero's live stats are these, sized `sm`. |

**The skeptic test for profiles:** open a seeded profile as a *member who has never met this
operator*. Is it instantly legible (who this is, what they offer, one obvious next step)
without the owner explaining it? If not, the blueprint seed is wrong, not the layout.

## A.4 Entity profile anatomy (every region mapped to a kit primitive)

The profile is the **Detail template**. Below, every region is mapped to the exact kit
primitive that renders it, so there is no ambiguity about what gets built and nothing is
hand-rolled. (Detail template signature, verbatim: `hero, title, subtitle, badges, actions,
back, tabs, children`.)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  CONTEXT BAND  (DetailTemplate header)                                      │
│  ┌──────┐  Name ......................................  [ Primary CTA ]     │
│  │ logo │  tagline (one line) .........................  [ Follow ] [ QR ]  │
│  └──────┘  [type badge] [status chips]                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   <- StatCard size="sm"    │
│  │ Members │ │ Events  │ │Practices│ │ Standing│                            │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘                            │
│  About · Offerings · Practices & Journeys · Community · Team · [Action tab] │  <- tabs
├───────────────────────────────────────────────────────────────────────────┤
│  TAB BODY  (DetailTemplate children = a module set rendered by PageModules) │
│  each section: SectionHeader + EntityCard/PersonCard grid + EmptyState      │
└───────────────────────────────────────────────────────────────────────────┘
```

| Region | What it is | Kit primitive (file) | Type-aware? |
|---|---|---|---|
| **Back link** | Return to the entity directory | `DetailTemplate` `back` slot | no |
| **Logo / brand mark** | The entity `brand_logo_url` on `brand_accent` | a small `Avatar`/anchor chip in the Detail `title` row (kit `Avatar`, accent token) | no (brand) |
| **Name** | `spaces.brand_name` / `name` | `DetailTemplate` `title` | no |
| **Tagline** | One-line positioning | `DetailTemplate` `subtitle` | no |
| **Type badge** | "Practitioner" / "Studio" / "Non-profit" / "Coaching" / "Venue" | `DetailTemplate` `badges` (a `Badge` tinted by accent) | **yes** (label by `type`) |
| **Status chips** | Verified, Networked vs Private, Online | `DetailTemplate` `badges` | partly |
| **Live stats** | Members · Events · Practices · Standing/rank | `StatCard` `size="sm"` row (`components/ui/stat-card.tsx`) | **yes** (which 3-4 show) |
| **Primary CTA** | Book / Join / Get tickets / Donate / Enroll | `DetailTemplate` `actions` (a `Button` in accent) | **yes** (by `type`) |
| **Follow** | Network follow affordance | `DetailTemplate` `actions` (secondary `Button`) | no |
| **Connect / QR** | The entity's `qr_codes` Connect code | `DetailTemplate` `actions` (icon `Button` -> Dialog) | no |
| **Tabs** | About · Offerings · Practices & Journeys · Community · Team · Action | `DetailTemplate` `tabs` (`DetailTab[]`, `active` precomputed) | **yes** (which tabs) |
| **Tab body** | The modules for the active tab | `<PageModules route="/spaces/[slug]/<tab>">` (entity module set) | **yes** (module set) |
| **Section title** | "Upcoming sessions", "Programs", "The team" | `SectionHeader` (`components/ui/section-header.tsx`) | no |
| **Offering / program card** | One event/class/session/program | `EntityCard` (`components/cards/entity-card.tsx`) | no |
| **Team member card** | One staff/contributor | `PersonCard` (`components/cards/person-card.tsx`) | no |
| **Grouped block** | A bordered module panel (e.g. About) | `ModuleCard` (`components/modules/module-card.tsx`) | no |
| **Empty section** | "No offerings yet" | `EmptyState` (`components/ui/empty-state.tsx`, `variant="first-use"`) | no |

**Dynamic primary CTA by type** (the one affordance that most signals "what is this"):

| `spaces.type` | Primary CTA label | Lands on |
|---|---|---|
| `practitioner` | **Book** | the booking module / availability |
| `business` | **Join** (or **See classes**) | membership / schedule |
| `event_space` | **Get tickets** | ticketing tiers |
| `organization` | **Donate** | the donation form |
| `coaching` | **Enroll** | the program / cohort |

All CTA copy runs the CONTENT-VOICE §10 checklist. "Book", "Join", "Get tickets", "Donate",
"Enroll" are plain verbs by design.

## A.5 Responsive, accessibility, performance, theming

| Concern | Approach (reuse existing patterns) |
|---|---|
| **Responsive** | The body uses the existing container-query grid (PAGE-FRAMEWORK ADR-295: each slot is a Tailwind v4 `@container`; blocks size with `@lg:`/`@2xl:`, not the viewport). The context band already stacks actions below identity on mobile (DetailTemplate header), so the hero is responsive for free. No new breakpoints. |
| **Accessibility** | One `<h1>` (the Detail `title`); tabs are a `<nav>` of links with a precomputed `active` (DetailTemplate already does this), so tab nav works without JS. Accent-on-surface contrast is validated against the token allowlist (D4/D6). Skeletons are dimension-matched (no CLS). Focus order: back -> identity -> CTA -> tabs -> body. |
| **Performance** | RSC by default; the context band and stats are fetched once in the profile `layout.tsx` and passed down (hoist shared scope, PAGE-FRAMEWORK §5.5). Each body section is its own `<Suspense>` (`PageModules` already wraps each module in Suspense). Never block the shell on a slow await. Space-private reads are `no-store`; every cache key carries `space_id`. |
| **Theming** | The space's `skin` + `brand_accent` resolve **server-side** from the host (`resolveSpaceForHost` -> `resolveTheme({ spaceSkin })` -> `loadActiveThemeCss` -> inline `<style id="fx-theme">`), so there is zero FOUC and no blocking script (the exact pattern in `app/(main)/layout.tsx`). The accent is one validated token, not hex. |

---

# B. The template / module system for entity profiles

This is the heart of C3: the profile is composed, not authored, and one change updates every
profile. This section names the exact, existing seams.

## B.1 The Detail-template composition (the route shell)

A profile route is a **Detail layout** that renders the context band + tabs and slots each
tab page as `children` (PAGE-FRAMEWORK §3, "How templates map to Next.js"). Navigating
between tabs preserves the header and rail (partial rendering) for free.

```
app/(main)/spaces/[slug]/
  layout.tsx        -> resolves the space, renders <DetailTemplate hero/title/subtitle/
                       badges/actions/tabs>, hoists shared scope (members count, accent)
  page.tsx          -> About tab (default)         = <PageModules route="/spaces/[slug]/about">
  offerings/page.tsx                                = <PageModules route="/spaces/[slug]/offerings">
  practices/page.tsx                                = <PageModules route="/spaces/[slug]/practices">
  community/page.tsx                                = <PageModules route="/spaces/[slug]/community">
  team/page.tsx                                     = <PageModules route="/spaces/[slug]/team">
  <action>/page.tsx (book|tickets|donate|enroll)    = <PageModules route="/spaces/[slug]/<action>">
```

**Route recommendation (and justification).** Use **`/spaces/<slug>`**, not a typed route
(`/practitioners/<slug>`):

- It matches the data: the tenant is one `spaces` row of any `type`. One route family is
  `type`-agnostic, exactly like the resolver, the shell, and RLS (which all key on
  `space_id`, never `type`).
- Adding `event_space` (the one new type) needs **no new route**, only a blueprint entry.
- It mirrors the existing entity routes (`/circles/[slug]`, `/channels/[id]`) so the IA stays
  consistent and the Detail layout pattern is reused verbatim.
- The custom-domain / white-label surface later maps a host to a space and serves the same
  tree at `/` (proxy already exposes the host; `resolveSpaceForHost` already exists). A typed
  route would fight that mapping.

> Owner decision (D-1): confirm `/spaces/<slug>` as the canonical in-app profile route. The
> public micro-site (Phase later) serves the same space at a custom host root.

## B.2 The entity module catalog (new, registered once)

Each entity tab is a set of **entity modules**. A module is one meta entry in
`lib/widgets/modules.ts` + one component binding in `lib/widgets/registry.tsx` (a
self-fetching RSC that returns `null` when empty). Adding the whole profile system is
**~16 module entries + their components**, no page edits, exactly the PAGE-FRAMEWORK "add a
module" contract. Every module renders only kit primitives.

| Module id | What it renders | Kit primitive | Types that use it |
|---|---|---|---|
| `entity-about` | Mission / bio / story prose + highlights | `ModuleCard` + prose | all |
| `entity-highlights` | 3-4 proof points (years, members, outcomes) | `StatCard` row | all |
| `entity-offerings` | Events / classes / sessions / programs grid | `EntityCard` grid + `SectionHeader` + `EmptyState` | all |
| `entity-schedule` | Upcoming dated offerings (next 4 weeks) | `EntityCard` grid | business · coaching · event_space |
| `entity-practices` | The entity's Practices to start | `EntityCard` grid | practitioner · business · coaching · organization |
| `entity-journeys` | The entity's Journeys to adopt | `EntityCard` grid | practitioner · coaching · organization |
| `entity-community` | Circles / Runs + a light feed | `EntityCard` grid + stream | all (networked) |
| `entity-team` | Staff / contributors | `PersonCard` grid + `SectionHeader` | business · coaching · organization · event_space |
| `entity-testimonials` | Member quotes | `ModuleCard` (quote style) | all |
| `entity-booking` | Availability + Book CTA | `EntityCard`/slot grid + `Button` | practitioner · coaching |
| `entity-tickets` | Ticket tiers + capacity | `EntityCard` (tier) grid | event_space · business |
| `entity-donate` | Donation form (one-time + recurring) | `ModuleCard` + form primitives | organization |
| `entity-enroll` | Program enrollment + cohort dates | `EntityCard` + `Button` | coaching |
| `entity-faq` | Question-led FAQ (also feeds Schema.org later) | `ModuleCard` | all |
| `entity-contact` | Hours / location / connect | `ModuleCard` + map slot | business · event_space · organization |
| `entity-standing` | Networked standing / rank / Quest tie-in | `StatCard` + `ModuleCard` | networked only |

> Each module is `space_id`-scoped: it reads only the active space's rows (RLS + an explicit
> `space_id` filter). A module returns `null` when the space has nothing, so a tab that is
> "assigned but empty" costs one query and renders nothing (PAGE-FRAMEWORK §4.1).

## B.3 Per-entity-type blueprints (the typed compositions)

A **blueprint** is data, not code: per `type`, it sets the **tab set**, the **module set per
tab**, the **hero CTA**, and **which StatCards** show. The blueprint decides composition; the
shell renders it. One unified profile, typed composition. (Blueprints live with the role
blueprints in ENTITY-SPACES-SYSTEM §2.2; here is the profile-specific composition each one
declares.)

**Hero StatCards by type** (the live numbers in the context band):

| Type | StatCard 1 | StatCard 2 | StatCard 3 | StatCard 4 |
|---|---|---|---|---|
| `practitioner` | Clients | Sessions | Practices | Standing |
| `business` | Members | Classes / wk | Practices | Standing |
| `organization` | Supporters | Programs | Volunteers | Raised |
| `coaching` | Enrolled | Cohorts | Lessons | Completion |
| `event_space` | Attendees | Upcoming | Capacity filled | Standing |

> Copy note: labels are plain nouns (Clients, Members, Supporters). "Standing" is the
> networked rank tie-in; non-networked spaces drop it. No "points" (NAMING).

**Practitioner blueprint** (the recommended first build):

| Facet | Composition |
|---|---|
| Tabs | About · Offerings · Practices & Journeys · Community · **Book** |
| About modules | `entity-about`, `entity-highlights`, `entity-testimonials`, `entity-faq` |
| Offerings modules | `entity-offerings`, `entity-schedule` |
| Practices tab | `entity-practices`, `entity-journeys` |
| Community tab | `entity-community`, `entity-standing` |
| Action tab (Book) | `entity-booking` |
| Hero CTA | **Book** |
| Hero StatCards | Clients · Sessions · Practices · Standing |

**Business blueprint:**

| Facet | Composition |
|---|---|
| Tabs | About · Offerings · Practices & Journeys · Community · Team · **Join** |
| About | `entity-about`, `entity-highlights`, `entity-contact`, `entity-faq` |
| Offerings | `entity-schedule`, `entity-offerings`, `entity-tickets` |
| Practices | `entity-practices`, `entity-journeys` |
| Community | `entity-community`, `entity-standing` |
| Team | `entity-team` |
| Action (Join) | `entity-offerings` (memberships) + Join `Button` |
| Hero CTA | **Join** |
| Hero StatCards | Members · Classes/wk · Practices · Standing |

**Organization (non-profit) blueprint:**

| Facet | Composition |
|---|---|
| Tabs | About · Offerings · Practices & Journeys · Community · Team · **Donate** |
| About | `entity-about`, `entity-highlights`, `entity-testimonials`, `entity-faq` |
| Offerings | `entity-offerings` (programs/events), `entity-schedule` |
| Practices | `entity-practices`, `entity-journeys` |
| Community | `entity-community` |
| Team | `entity-team` (staff + volunteers) |
| Action (Donate) | `entity-donate` |
| Hero CTA | **Donate** |
| Hero StatCards | Supporters · Programs · Volunteers · Raised |

**Coaching (academy) blueprint:**

| Facet | Composition |
|---|---|
| Tabs | About · Offerings · Practices & Journeys · Community · Team · **Enroll** |
| About | `entity-about`, `entity-highlights`, `entity-testimonials`, `entity-faq` |
| Offerings | `entity-enroll`, `entity-schedule` |
| Practices | `entity-journeys` (curriculum), `entity-practices` |
| Community | `entity-community` (cohort Runs), `entity-standing` |
| Team | `entity-team` (coaches/TAs) |
| Action (Enroll) | `entity-enroll` |
| Hero CTA | **Enroll** |
| Hero StatCards | Enrolled · Cohorts · Lessons · Completion |

**Event Space (venue / retreat) blueprint:**

| Facet | Composition |
|---|---|
| Tabs | About · Offerings · Community · Team · **Tickets** |
| About | `entity-about`, `entity-highlights`, `entity-contact`, `entity-faq` |
| Offerings | `entity-tickets`, `entity-schedule` |
| Community | `entity-community` (attendees/alumni) |
| Team | `entity-team` (coordinators) |
| Action (Tickets) | `entity-tickets` |
| Hero CTA | **Get tickets** |
| Hero StatCards | Attendees · Upcoming · Capacity filled · Standing |

> The family resemblance is intentional: every type shares About / Community and the same
> hero grammar; they diverge only on the action tab, the CTA, and which offering/practice
> modules light up. Distinct yet obviously one family (D1).

## B.4 The per-entity layout scope (the only new infrastructure)

Today the layout cascade is `route -> section -> global` (`lib/page-settings/layout.ts`
`layoutScopeChain`; stored in `page_settings.layout` jsonb `{template, slots}`; resolved by
`loadLayoutForRoute` / `pickLayoutConfig`; `parseLayout` is the back-compat reader). The one
new piece is a **space layer at the top**:

```
space -> route -> section -> global   (most-specific wins)
```

- A `type`-default blueprint provides the **route-level** layout (the typed composition in
  B.3) so every new space of that type starts non-empty.
- An owner's tweaks save at the **space level** for their own profile only, keyed by
  `(space_id, route)`.
- This re-keys `page_settings` from `route` (PK) to `(space_id, route)` (per
  ENTITY-SPACES-SYSTEM §4.10), behind the existing `parseLayout` back-compat reader so
  current single-tenant layouts keep resolving (they read as the root space).

Because the cascade is the existing resolver, the editor, the role gate, and the renderer all
keep working unchanged. **This is the structural guarantee for C3:** a module's definition is
the same registry binding for every space; only the per-space `slots` config differs.

## B.5 Chrome registration (one line, never the shell)

Register the profile route family's rail in `lib/layout/page-chrome.ts`, never in
`app-shell.tsx`:

- The in-app profile (`/spaces/*`) is a **Detail** page that renders its own in-body scope
  rail, so it registers as **`'scoped'`** (suppress the global rail, no double-rail trap).
- The owner settings surface (a Focus page, B.6) registers as **`'none'`**.
- The provisioning wizard registers as **`'none'`** (Focus).

That is the entire chrome change: add the prefixes to `page-chrome.ts` (locked by
`page-chrome.test.ts`). Per PAGE-FRAMEWORK §8.2: to reframe a route, edit `page-chrome.ts`,
never the shell.

## B.6 Owner editing UX (Focus settings + the existing layout editor)

Owners arrange their profile **within guardrails**, using surfaces that already exist:

- **Profile settings = a Focus-template surface** (`FocusTemplate`, rail `'none'`): preset
  palettes (3-5 curated skins), a contrast-validated accent, logo upload, name/tagline/about
  copy, and section order **within the blueprint's allowed module set**. Locked: nav chrome,
  type scale, spacing, grid, kit components (the THEME.md guardrail).
- **Section arrangement = the existing on-page Layout editor**
  (`components/admin/page-settings/layout-editor.tsx`): pick the interior template, drop each
  allowed entity module into a slot, set order + visibility + per-module "who sees it". It
  already does template + slot + role gate; we just scope it to the space and constrain the
  module palette to the blueprint's allowed ids.
- **Copy guardrail:** every editable string runs through NAMING + CONTENT-VOICE; the
  AI-assist path (B.7 / Vera co-host) injects `lib/ai/voice.ts` so drafts arrive on-voice.

**Provisioning wizard (<=7 steps, lands on a non-empty seeded profile):**

1. Pick type (practitioner / business / organization / coaching / event_space).
2. Name + handle (the `slug`).
3. Theme + logo (a curated skin + accent + logo upload).
4. One-line tagline (Vera can draft it).
5. Confirm seeded defaults (a sample offering, a starter About, the default tabs).
6. (Optional) invite a teammate.
7. Publish -> land on the live profile, already populated.

Steps 4 and the seed in 5 are the time-to-value mechanism: never drop an owner into a blank
profile. Defer domains/advanced settings to just-in-time (Phase later).

## B.7 AI seams (cheap now, best-practice-ready)

Two seams, both cheap, both built now (C2):

1. **Model-agnostic AI gateway.** Today every call is hard-coupled to the Anthropic SDK
   (`lib/ai/client.ts` `getAnthropic()` -> `new Anthropic()`; tiers in `lib/ai/models.ts`:
   `haiku` default / `sonnet` / `opus`). Insert a thin gateway so provider is a config
   string. Recommended: **Vercel AI Gateway (zero markup, OpenAI-compatible exit)** per
   ENTITY-SPACES-SYSTEM §5.7. This is the highest-leverage, lowest-risk AI move and it is
   free. `completeText()` (`lib/ai/complete.ts`) keeps its signature; only its transport
   swaps. Small-model routing (blurbs/drafts on `haiku`) stays the cost lever.
2. **Per-entity Vera co-host** on the cheap tier + `space_id`-scoped pgvector RAG. Vera helps
   an owner "fill my profile" and "draft my offerings" using **only the entity's own
   content** (retrieval filtered by `space_id`; RLS on the embeddings table is the
   confused-deputy backstop). Embeddings reuse the existing 384-d gte-small Edge Function
   (`lib/ai/embed.ts`) and pgvector pattern (`help_chunks`, `event_embeddings`). All
   generation reads `lib/ai/voice.ts`, so drafts obey NAMING + CONTENT-VOICE. Disclose Vera
   output as AI (EU Art. 50, due 2 Aug 2026).

**Defer (note as later, don't build now):** the eval harness in CI (Langfuse/Braintrust), the
read-first MCP server, and realtime voice. The seams above make all three a later swap, not a
rebuild.

---

# C. Master production list (the backlog)

Exhaustive, phased, checkbox. Grouped by epic. Each item is a `- [ ]`. Per the brief, this
covers migrations, tests, copy, theming, empty states, analytics, permissions, and docs/ADR
updates. **Cheap-now tag** on each epic: 🟢 free/existing infra · 🟡 small cost · 🔴 costs
real money, defer.

> **ADR numbering:** the highest existing ADR is **313**. New decisions in this work start at
> **ADR-314**. Add each to `docs/DECISIONS.md`.

## Phase 0: Foundation (the isolation spine) 🟢

> Nothing member-facing. Everything reversible. This is the gate for all of Phase 1. Uses the
> expand -> migrate -> contract approach (ENTITY-SPACES-SYSTEM §4.12). All free / existing infra.

### Epic 0.1: New `spaces` columns + entitlements
- [ ] Migration: `ALTER TABLE spaces ADD COLUMN visibility text` (`'network' | 'private'`), default `'network'`, CHECK constraint.
- [ ] Migration: `ALTER TABLE spaces ADD COLUMN plan text` (default `'free'`).
- [ ] Migration: `ALTER TABLE spaces ADD COLUMN entitlements jsonb NOT NULL DEFAULT '{}'`.
- [ ] Migration: add `event_space` to the `spaces.type` CHECK (expand-migration). ⚠️ owner decision D-2.
- [ ] Update `lib/spaces/types.ts` `Space` type with `visibility`, `plan`, `entitlements`.
- [ ] Update `lib/spaces/store.ts` reads to select the new columns.
- [ ] Regenerate `lib/database.types.ts` after the migration (WORKFLOW.md).
- [ ] Test: resolver returns the new fields; defaults applied on existing rows.

### Epic 0.2: `space_members` + invites (per-space M:N roles)
- [ ] Migration: `space_members(space_id, profile_id, role text CHECK in ('viewer','editor','moderator','admin'), status, invited_by, created_at)`, unique `(space_id, profile_id)`, `space_id` leading-column index.
- [ ] Migration: `space_invites(space_id, email, role, token, expires_at, accepted_at)`.
- [ ] RLS on both: `TO authenticated`, every tenant/auth function wrapped in `(select ...)`.
- [ ] Store helpers: `getSpaceMembership(space_id, profile_id)`, `listSpaceMembers(space_id)`, invite create/accept.
- [ ] Test (contract): a caller who is admin of space A cannot read/write space B's members.

### Epic 0.3: Ownership FKs on core objects (the glue backfill)
- [ ] Migration (expand, nullable): add `space_id uuid REFERENCES spaces(id)` to `circles`, `events`, `practices`, `journeys`/`journey_plans`, `programs`. Keep `host_id`/`created_by` for authorship.
- [ ] Dual-write: app writes `space_id` on create/update (default = resolved space, root for legacy flows).
- [ ] Backfill in batches: existing rows -> root space id; verify counts (`GROUP BY space_id`).
- [ ] Add `space_id` RLS policies (`TO authenticated`, `(select ...)`-wrapped) on each table.
- [ ] Add composite indexes with `space_id` as the leading column.
- [ ] Contract test per table: cross-tenant read/write leak test (A cannot see B).
- [ ] Contract: set `NOT NULL` once dual-write + backfill confirmed (the contract step).

### Epic 0.4: Capability resolver extension + space resolver in the request
- [ ] Extend the capability resolver (`lib/core/access-matrix.ts` pattern) with "admin/editor of the owning space," mirroring the existing `host -> their circles` edge.
- [ ] No new global staff power (the `web_role` axis stays locked, NAMING "Roles").
- [ ] Carry active `space_id` + `plan` on the JWT via the Supabase Custom Access Token hook (so RLS reads them cheaply).
- [ ] `proxy.ts`: set `x-space-id` alongside `x-pathname`/`x-search` (host -> space already resolved by `resolveSpaceForHost` in the layout; surface the id to RSCs).
- [ ] Tenant-scope every new cache key with `space_id`; space-private reads `no-store`.
- [ ] Test: capability resolver grants space A admin only A's objects; never B's.

### Epic 0.5: RLS + contract-test harness (the safety net)
- [ ] A reusable authz contract-test helper: "caller in space A, assert deny on space B" per space-scoped action.
- [ ] Cross-tenant leak test on every `service_role` / `SECURITY DEFINER` path touched.
- [ ] Migration tests for the expand/contract steps (backfill correctness, NOT NULL enforcement).
- [ ] Wire these into the existing test run so they gate every space-scoped PR.

### Epic 0.6: Docs / ADRs for Phase 0
- [ ] ADR-314: per-entity layout scope (`space -> route -> section -> global`), with rationale.
- [ ] ADR-315: `/spaces/<slug>` as the canonical in-app profile route (B.1 justification).
- [ ] ADR-316: `visibility` as a first-class column (Networked vs Private).
- [ ] Update `docs/DATABASE.md` with the new tables/columns; link from ENTITY-SPACES-SYSTEM.
- [ ] Route the docs per `docs/DOCS-PROTOCOL.md` (technical -> git; operator how-to -> Notion).

## Phase 0.5: Streamline the existing system to best practice 🟢

> From a current-state audit (the system is already ~85% best-practice). This is consolidation
> plus ONE real re-keying (`page_settings` -> `space_id`) and ONE AI-gateway consolidation, not
> a rebuild. Ordered test-first / expand-contract so live pages never break. Lock it in BEFORE
> the profiles go on top. Sequencing keeps reworks on non-overlapping files so they parallelize.

**Keep verbatim (already best-practice, do not rework):** the shell + `page-chrome.ts` map; `PageHeading` as the one header grammar; the module engine's pure core (`resolveSlots`/`layoutScopeChain`/`pickLayoutConfig`, fully unit-tested, back-compat); the theming engine (`themeToCss`/`validate`, the four-axis model, and `resolveTheme` which ALREADY reads `spaceSkin`/`spaceGeneration`); Puck for public micro-sites; `resolveSpaceForHost`; the AI governance + `MODELS` registry.

### Epic 0.5a: Re-key the layout store to `space_id` (R1, the key enabler) 🔴 highest-risk
- [ ] **0.5.1** Add contract/regression tests locking the current single-tenant `page_settings` layout + SEO resolution BEFORE touching it (the expand/contract safety net).
- [ ] **0.5.2** Expand-migration: add nullable `space_id` to `page_settings`; backfill existing rows -> root space; leading-column index. No read changes yet.
- [ ] **0.5.3** Thread `spaceId` through the ~5 store/action fns (`loadLayoutForRoute`, `loadPageSettings`, `savePageLayout`, `savePageSeo`/`Status`, `getPageLayoutForEditor`); `onConflict` -> `space_id,route`. **Fix the `React.cache` keys to `(spaceId, route)`** + add a cross-tenant cache-leak test (the §4.1 invisible-leak risk). Extend `layoutScopeChain`/`moduleScopeChain` to emit space keys. Plumb active `space_id` into the layout editor; add the "operator edits own space only" authz rule.
- [ ] **0.5.4** Contract: `space_id NOT NULL`, final composite index, RLS `TO authenticated`; cross-tenant leak test per action.

### Epic 0.5b: Consolidate the AI layer onto one gateway chokepoint (R2) 🟡
- [ ] **0.5.5** Widen `completeText` (`lib/ai/complete.ts`) to carry tools/`tool_choice`, image blocks (vision), `thinking` passthrough + a tool-loop helper; redirect the **11 raw `messages.create` sites** through it; **fix the 2 bypass leaks first** (`lib/studio/winback.ts`, `scripts/help-autodoc.mts`).
- [ ] **0.5.6** Behind a flag, route `lib/ai/client.ts` through a model-agnostic gateway (Vercel AI Gateway, zero markup; `baseURL`/transport swap), Anthropic default. Add a Vera/blurb eval gate in CI before per-space scoping.

### Epic 0.5c: Finish template adoption (kill the hand-rollers) 🟢
- [ ] **0.5.7** Migrate `app/(main)/people/[handle]/page.tsx` (603-line hand-roller) onto `DetailTemplate` as the **reference entity-profile Detail page** (sets the pattern the spaces work copies).
- [ ] **0.5.8** Migrate the edit/compose + chat hand-rollers onto `FocusTemplate`/`WizardShell` (`events/new`, `events/[slug]/edit`, `journeys/[slug]/edit`, `circles/[slug]/settings`, `pages/sequences/[slug]/edit`, `messages/[id]`, `messages/r/[roomId]`); eliminate the 6 remaining raw-`<h1>` files.

### Epic 0.5d: Kit consolidation (R5, broad - second wave) 🟡
- [x] **0.5.9** Consolidate the hand-rolled overlays onto `ui/Dialog` (a11y/scroll-lock/ESC); merge the two `SidebarCard`s + `AdminModuleCard` base; reconcile the duplicate `report-dialog`. (Run AFTER 0.5.7/0.5.8 to avoid touching the same pages.) ✅ See ADR-319: 10 centered modals migrated onto `ui/Dialog`; `SidebarCard` unified (gained `count`/`Icon`/`action`) with `AdminModuleCard` composing it; the two `ReportDialog`s are distinct features (moderation vs support) so the moderation one was renamed `ContentReportDialog` rather than merged. Deliberate full-bleed/bottom-sheet/AI/palette overlays left (a few gained inline ESC + scroll-lock to avoid an a11y gap).

### Epic 0.5e: Theming + Puck space-readiness + hygiene 🟢
- [ ] **0.5.10** Token-leak cleanup on the ~6 raw-palette files (priority `settings/notifications/form`, `unsubscribe`) so branded spaces re-theme them.
- [ ] **0.5.11** Doc/naming hygiene: add `WizardShell` to the PAGE-FRAMEWORK canon, fix the template count (there are 9 page shells), rename module-engine interior "templates" -> "layouts/grids"; clean `/lead` module set, document `quest-tasks` parked, drop the `LAYOUT_MODULE_IDS` alias.
- [ ] **0.5.12** Decide the marketing parallel kit (`components/marketing/marketing-ui.tsx`): unify with `EntityCard`/`ui/button`, or document as an intentional marketing-only variant set.
- [ ] **0.5.13** Add `space_id` to the Puck `pages` table + un-gate from the 4-slug allowlist to per-space; codify the Puck-vs-module-engine boundary in PAGE-FRAMEWORK (Puck = public micro-site block tree; module engine = authenticated in-app pages; never cross them).
- [ ] **0.5.14** Add `spaces.generation` column to feed `resolveTheme`'s already-present `spaceGeneration` param; note `brand_accent` is decorative until wired.

**De-risking (all epics):** expand -> dual-write -> backfill -> enforce, each step shippable + reversible; treat every cache key as part of the auth boundary; consolidate AI behind the existing fail-to-deterministic seam + an eval gate; migrate one page per PR (profile first), visual-diff; canary every space-scoping change on the root space (which behaves as today) before any sub-brand exists; never big-bang.

## Phase 1: Networked entity profiles (start here) 🟢

> The networked in-app profile, end-to-end, on the cheap tier. Practitioner first, then
> template outward. All on existing infra.

### Epic 1.1: Design-system work (the kit, confirmed)
- [ ] Confirm `DetailTemplate` slots cover the context band (they do: `hero/title/subtitle/badges/actions/back/tabs`); no template change needed.
- [ ] Add a small accent-aware `Badge` variant for the **type badge** (token-driven, no hex).
- [ ] Confirm `StatCard size="sm"` renders the hero stats row cleanly at mobile width.
- [ ] A11y pass on the context band: one `<h1>`, focus order, accent-on-surface contrast.
- [ ] No new layout primitives (enforce: everything composes `@/components/templates` + `components/ui/*` + `components/cards/*`).

### Epic 1.2: The entity module set (catalog + components)
- [ ] Add the ~16 entity module meta entries to `lib/widgets/modules.ts` (B.2 table).
- [ ] Add `ROUTE_MODULE_IDS` entries for each profile tab scope (`/spaces/*/about`, `/offerings`, `/practices`, `/community`, `/team`, `/<action>`).
- [ ] List the profile routes in `lib/widgets/module-routes.ts` so the Layout editor appears there.
- [ ] Bind each module to a self-fetching RSC in `lib/widgets/registry.tsx` (`components/widgets/entity/*`); each `space_id`-scoped; returns `null` when empty.
- [ ] `EmptyState` for every module's empty case (`variant="first-use"`), copy per CONTENT-VOICE.
- [ ] Each module reads only the active space's rows (RLS + explicit `space_id` filter); add a leak test per module.

### Epic 1.3: Per-type blueprints (the typed compositions)
- [ ] Author the blueprint descriptor shape (tabs, module set per tab, hero CTA, hero StatCards) as data, per B.3.
- [ ] Write the 5 blueprints: practitioner, business, organization, coaching, event_space.
- [ ] The blueprint's route-level layout seeds `page_settings.layout` per `(space_id, route)` on provisioning.
- [ ] Test: each type renders its exact tab set + CTA + StatCards; unknown type fails closed to About-only.

### Epic 1.4: Per-entity layout scope (the one new infra)
- [ ] Extend `layoutScopeChain` -> `pickLayoutConfig` with a space layer (`space -> route -> section -> global`).
- [ ] Re-key `page_settings` to `(space_id, route)`; keep `parseLayout` back-compat (legacy rows read as root space).
- [ ] `loadLayoutForRoute(route, space_id)` resolves most-specific-wins including the space layer.
- [ ] Unit tests for the new cascade (space override beats route beats section beats global).
- [ ] Migration for the `page_settings` re-key (expand/contract; backfill existing rows to root space_id).

### Epic 1.5: The profile route shell
- [ ] `app/(main)/spaces/[slug]/layout.tsx`: resolve space by slug, render `DetailTemplate` (typed band + tabs), hoist shared scope (counts, accent) once.
- [ ] Tab `page.tsx` files, each `<PageModules route="/spaces/[slug]/<tab>">` (About is the default `page.tsx`).
- [ ] Register `/spaces/*` as `'scoped'` in `lib/layout/page-chrome.ts`; update `page-chrome.test.ts`.
- [ ] Dynamic primary CTA by type (A.4 table); accent-tinted `Button` in the `actions` slot.
- [ ] Follow + Connect/QR affordances in `actions` (Connect reuses the entity's `qr_codes`).
- [ ] Per-section `<Suspense>` (PageModules already wraps each module); dimension-matched skeletons.
- [ ] 404 / suspended-space handling (fail-closed via RLS + status check).

### Epic 1.6: Provisioning wizard (<=7 steps -> non-empty profile)
- [ ] `FocusTemplate` wizard at `/spaces/new`; register `'none'` in `page-chrome.ts`.
- [ ] Steps per B.6 (type -> name/handle -> theme+logo -> tagline -> confirm seed -> invite -> publish).
- [ ] Copy-on-create: deep-copy the blueprint's seed (sample offering, starter About, default tabs) into the space's own rows; stamp `template_id`/`template_version` for analytics only.
- [ ] Slug validation reuses `isSafeSlug` (`lib/theme/validate.ts` pattern) + uniqueness check.
- [ ] Wizard copy runs CONTENT-VOICE §10; Vera can draft the tagline (Epic 1.9).
- [ ] Test: a freshly provisioned space renders a populated, legible profile (the skeptic test).

### Epic 1.7: Owner editing UX (Focus settings + layout editor)
- [ ] `FocusTemplate` settings surface at `/spaces/[slug]/settings` (rail `'none'`): logo, accent (curated palettes + validated accent), name/tagline/about, section order within allowed set.
- [ ] Constrain the existing Layout editor's module palette to the blueprint's allowed ids for this type.
- [ ] Scope the Layout editor saves to `(space_id, route)` (the space layer from Epic 1.4).
- [ ] Permission gate: only `space_members.role in ('admin','editor')` (or owner) can open settings; enforced server-side.
- [ ] Locked chrome enforced (no nav/type-scale/grid edits); test the guardrail.

### Epic 1.8: Entity directory / discovery (in-app)
- [ ] `IndexTemplate` directory at `/spaces` (browse entity profiles), `EntityCard` grid, filters by type.
- [ ] Only `visibility = 'network'` spaces appear (Private/White-Label excluded); RLS-enforced.
- [ ] `EmptyState` (`variant="no-results"`) for filtered-empty.
- [ ] Search over space name/tagline/type (Postgres FTS now; pgvector later).
- [ ] Test: a `private` space never appears in the directory or search for non-members.

### Epic 1.9: AI gateway seam + per-entity Vera co-host
- [ ] Insert the model-agnostic gateway behind `lib/ai/client.ts` / `completeText` (Vercel AI Gateway, zero markup); provider = config string. Keep `completeText` signature stable. 🟢
- [ ] Route profile-draft generations to the cheap tier (`haiku`) by default.
- [ ] Per-entity Vera "fill my profile / draft offerings" flow on the settings surface.
- [ ] Migration: `space_embeddings(space_id, source_table, source_id, embedding vector(384))`, RLS keyed to `space_id`, hnsw index. 🟢 (reuses pgvector + the existing 384-d Edge Function).
- [ ] RAG retrieval filtered by `space_id` (filter-before-retrieval; RLS as backstop).
- [ ] All generations prepend `lib/ai/voice.ts` (`withVoice`); output runs the §10 checklist.
- [ ] Disclose Vera output as AI (EU Art. 50). ⚠️
- [ ] Budget: reuse `lib/ai/budget.ts` daily cap; per-space cost accounting in `ai_usage`.
- [ ] Defer (note in ADR): eval harness in CI, MCP server, voice.

### Epic 1.10: Seed content
- [ ] Author the per-type seed (sample offering, starter About prose, default circle/Run, FAQ) as the blueprint's copy-on-create manifest. Copy per CONTENT-VOICE.
- [ ] Seed a demo space per type for QA + design review.
- [ ] Verify each seed passes the skeptic test (legible to a member, not just flexible for the owner).

### Epic 1.11: Analytics + permissions + copy QA
- [ ] Profile view + CTA-click + Follow events into the existing `engagement_events`/`interaction_events` backbone, `space_id`-tagged.
- [ ] Per-space view of its own profile analytics (RLS-scoped); never another space's.
- [ ] Permission matrix test: viewer/editor/moderator/admin can do exactly their allowed actions.
- [ ] Copy QA pass: every profile + wizard + settings + empty-state + AI string against CONTENT-VOICE §10 and NAMING (no em/en dashes, sentence case, no banned words, no "points").

### Epic 1.12: QA gate (RLS / a11y / responsive / voice)
- [ ] RLS: full cross-tenant leak sweep across every entity module and the directory.
- [ ] A11y: keyboard nav of band + tabs, contrast on accent, no-JS tab navigation, focus order.
- [ ] Responsive: container-query checks at mobile / `@lg` / `@2xl` for every module slot.
- [ ] Performance: confirm the shell paints without blocking on slow awaits; each section streams.
- [ ] Voice: final §10 checklist sign-off on all member-facing copy.

### Epic 1.13: Docs / ADRs for Phase 1
- [ ] ADR-317: the entity module catalog + per-type blueprint composition.
- [ ] ADR-318: the AI gateway seam (decouple Vera from the raw Anthropic SDK).
- [ ] Update `docs/PAGE-FRAMEWORK.md` route map with `/spaces/*` (Detail, scoped rail).
- [ ] Update `docs/THEME.md` if any token/accent guardrail changed.
- [ ] Operator how-to ("provision and tune your space") -> Notion per DOCS-PROTOCOL.

## Later phases (deferred epics, with the cheap-now lens)

> These are real, but deferred to keep bootstrapping cheap. Each lists its tasks and tags
> what is free/existing vs what costs money. Full strategy in ENTITY-SPACES-SYSTEM §6 /
> ENTITY-SPACES-PLAN §12.

### Phase 2: QR studio + CRM per space 🟢 (mostly free/existing)
- [ ] Migration: add `space_id` + `splash jsonb` to `qr_codes`; per-plan code cap.
- [ ] Splash builder at `/q/<slug>` reusing the constrained block pattern (the same kit, not Puck).
- [ ] Migration: add `space_id` scope to `crm_deals` / `crm_activities` / `crm_stages`; per-space pipeline.
- [ ] Migration: `client_notes(space_id, contact_id, author_profile_id, body)`. ⚠️ GDPR/CCPA personal data.
- [ ] Event Space check-in: point a code at a check-in `node` (reuses `nodes`/`captures`, free).
- [ ] Per-space QR analytics (RLS-scoped); contract tests; copy; ADR.

### Phase 3: Email / marketing / comms 🟡 (Resend free tier now, costs scale later)
- [ ] Integrate Resend (already in the stack); per-space sender domain (DKIM + aligned Return-Path; DMARC aligns on SPF+DKIM).
- [ ] Migration: `sender_domains`, `outreach_sends`; `space_id` on `campaigns`; per-space `email_suppressions` scope.
- [ ] Audience builder over `contacts` (segments/tags); campaign composer (reuse the block pattern); schedule.
- [ ] RFC 8058 one-click unsubscribe; <0.1% complaint target; per-space kill-switch.
- [ ] SMS (`sms_consent` + `space_id`). ⚠️ A2P 10DLC / TCPA.
- [ ] Compliance: tenant AUP + anti-spam terms + Art. 28 DPA; per-space physical address. ⚠️ Counsel: CAN-SPAM initiator reach; Vera joint-controller.
- [ ] Migration to Amazon SES "tenants" only at scale. 🔴 defer.
- [ ] Contract tests, copy, ADR.

### Phase 4: Earnings / payouts / commerce 🟡 (Stripe Connect exists; per-feature build)
- [ ] Space-level Stripe Connect binding; per-space earnings dashboard (Dashboard template + StatCards).
- [ ] Migrations: `bookings`, `availability`, `packages` (practitioner); `event_ticket_types`/`event_tickets` + `space_id` (event_space); `donations`, `donation_receipts` (organization); `subscriptions`, `installment_plans`, `orders`, `payouts`; `space_id` on `financial_transactions`.
- [ ] IRS receipt rules ($250 acknowledgment + $75 quid-pro-quo deductible). ⚠️
- [ ] Tiered refund/cancellation engine; deposits/holds; dunning. ⚠️ PCI (hosted fields only).
- [ ] Contract tests, copy, ADR.

### Phase 5: White-label web (the public Puck micro-site) 🔴 (custom-domain TLS costs ops)
- [ ] Owner theme editor writing the space `skin` within the token allowlist (`isSafeSlug` + `TOKEN_ALLOWLIST`).
- [ ] The public micro-site composes Puck blocks (Puck is already installed: `@measured/puck`, `components/page-editor/*`, `app/edit`); brandable, `visibility: private`.
- [ ] Migration: `custom_domains(space_id, hostname, is_primary, verification_token, verified_at, tls_status)`. 🔴 TLS + verification via host Domains API (ops cost).
- [ ] 301/canonical from the `*.frequency.app` subdomain (SEO).
- [ ] Schema.org / JSON-LD on public profile/event pages (what agents read).
- [ ] "Remove Frequency branding" tier + branded transactional email. ⚠️
- [ ] Contract tests, copy, ADR.

### Phase 6: Premium / native apps 🅿️ 🔴 (done-for-you top tier, real money)
- [ ] Native branded app program (every competitor reserves this for the top tier). Defer entirely.
- [ ] Read-first tenant-scoped MCP server (Vera's tool registry is most of the work). 🔴 defer.
- [ ] Eval harness in CI (Langfuse/Braintrust) gating AI deploys. 🔴 defer.

---

# D. Phased plan + sequencing

**The order, with dependencies and the cheap/bootstrapping annotation.**

| Phase | Outcome | Depends on | Cheap-now lens |
|---|---|---|---|
| **0 Foundation** | Spaces can own things; isolation proven | nothing | 🟢 free: migrations + RLS + tests only, no new infra |
| **1 Networked profiles** | Practitioner profile end-to-end, then template outward | Phase 0 | 🟢 free: existing kit + page framework + pgvector + Anthropic key; AI gateway is zero-markup |
| **2 QR + CRM per space** | Reach + relationships | Phase 0 (space_id), Phase 1 (a space to attach to) | 🟢 mostly free: extends existing `qr_codes`/`contacts`/`nodes` |
| **3 Email** | Per-space sending | Phase 0, Phase 2 (contacts scoped) | 🟡 Resend free tier now; SES tenants only at scale 🔴 |
| **4 Earnings** | Money per space | Phase 0, the relevant deep feature per type | 🟡 Stripe Connect exists; build per feature; PCI ⚠️ |
| **5 White-label web** | Public branded micro-site | Phases 0-1; theme editor | 🔴 custom-domain TLS is the first real ops cost; Puck itself is already free |
| **6 Native + premium AI infra** | Top tier | everything proven | 🔴 🅿️ defer (native apps, MCP server, eval infra) |

**Roles roll out one at a time on Phase 0-1:** Practitioner -> Business -> Coaching -> Event
Space -> Organization, each adding its blueprint + the one or two deep features it needs
(bookings, ticketing/check-in, donations). No existing role changes; each new role is a
descriptor + config (ENTITY-SPACES-SYSTEM §2.10).

**Why this order is cheap:** Phase 0 and Phase 1 spend **zero new money** (they are migrations,
tests, and composition on infra that already exists). The first real cost (custom-domain TLS)
is Phase 5, deliberately late. AI is built as **seams** in Phase 1 (the gateway is zero-markup,
the cheap tier is `haiku`, RAG reuses the existing 384-d embeddings), so AI is "important and
present" without being expensive.

---

# E. Definition of done + the ready-to-start gate

## E.1 Definition of done (per space-scoped epic)

An epic is done when all of these are true:

- [ ] **Migrations** are expand/contract, additive, idempotent, RLS on, applied via WORKFLOW; `lib/database.types.ts` regenerated.
- [ ] **RLS + contract tests** pass: a caller in space A can never read/write space B's rows; every `service_role`/`SECURITY DEFINER` path is leak-tested.
- [ ] **Composed, not authored:** UI is built from `@/components/templates` + the kit primitives; no hand-rolled header/card/grid; no `text-[Npx]`; no hardcoded hex.
- [ ] **Chrome registered** in `lib/layout/page-chrome.ts` (not the shell); `page-chrome.test.ts` updated.
- [ ] **Empty states** via `EmptyState`; **section headers** via `SectionHeader`.
- [ ] **Responsive** via container-query slots; **a11y** (one `<h1>`, focus order, contrast, no-JS tabs); **performance** (no blocking await, per-section Suspense, dimension-matched skeletons).
- [ ] **Copy** (incl. AI-generated) passes CONTENT-VOICE §10 + NAMING; no em/en dashes; AI paths inject `lib/ai/voice.ts` and disclose AI (Art. 50).
- [ ] **Analytics** events emitted, `space_id`-tagged, into the existing backbone.
- [ ] **Permissions** enforced server-side via the capability resolver (no new global staff power).
- [ ] **Docs/ADR** updated: technical -> git (`docs/*.md`, `DECISIONS.md`); operator how-to -> Notion (DOCS-PROTOCOL).

## E.2 The "ready to start Phase 0" gate

Phase 0 may begin once these are confirmed (mostly owner sign-off, no code blockers):

- [ ] Owner confirms **`event_space`** as a dedicated `spaces.type` (D-2; recommended yes).
- [ ] Owner confirms **`visibility`** as a first-class column (recommended yes).
- [ ] Owner confirms **Practitioner** as the first role to ship end-to-end (recommended yes).
- [ ] Owner confirms **`/spaces/<slug>`** as the canonical in-app profile route (D-1; recommended yes).
- [ ] Owner confirms **Vercel AI Gateway** (zero markup) as the gateway target (recommended yes).
- [ ] Confirm the expand/contract migration window and backfill batching plan (no downtime).
- [ ] Confirm the contract-test harness location so it gates every space-scoped PR from day one.

## E.3 The first 3-5 concrete tasks to start the networked profiles

In order, these are the literal first commits:

1. **Land the new `spaces` columns** (`visibility`, `plan`, `entitlements`) + the `event_space`
   type (Epic 0.1): one expand-migration, update `lib/spaces/types.ts` + `store.ts`,
   regenerate types. Reversible, nothing member-facing.
2. **Create `space_members` + invites with RLS** (Epic 0.2) and the **contract-test helper**
   (Epic 0.5): the isolation primitive + its safety net, before any feature reads it.
3. **Add `space_id` to `circles`/`events`/`practices`/`journeys` (expand + dual-write +
   backfill to root)** (Epic 0.3): the glue, behind the leak tests.
4. **Extend the capability resolver** with "admin of the owning space" + surface `x-space-id`
   in `proxy.ts` (Epic 0.4): the server-authoritative "what may this caller do here."
5. **Stand up `app/(main)/spaces/[slug]/layout.tsx` as a `DetailTemplate` + one entity module
   (`entity-about`)** and register `/spaces/*` as `'scoped'` in `page-chrome.ts` (Epics 1.1,
   1.2, 1.5, partial): the first visible, composed profile slice, proving the kit composition
   end-to-end before the full module set lands.

After step 5, the spine is load-bearing and every subsequent module/blueprint is additive.
