# Spaces: the white-label tenancy model (one app, one graph, many sub-brands)

> **The model, in one line.** Every sub-brand (a practitioner's mini-site, a business
> with a loyalty program, an organization, a physical Lab, a coaching platform like Hook)
> is a **Space**: a white-label tenant of the *one* Frequency app and database, with its own
> brand, domain, and entity, and a single switch that ports it into the shared network.
>
> Status: **strategy / decision doc.** Canonical record: [ADR-249](DECISIONS.md). It locks
> in the tenancy primitive and **resolves the long-open "home of Labs" question**
> (PLATFORM-VISION §10, ADR-246): the answer is *Spaces in one database by default*, with
> federation (HOOK-FEDERATION) as the escape hatch for already-separate or standalone
> products. Authority order unchanged: running code + `supabase/migrations/` > this doc.

Status legend: ✅ built · ⏳ partial · 🔴 not built yet · 🅿️ parked.

---

## Status update (2026-06): the tenancy spine and entity profiles shipped

> **What changed since this doc was written.** The Space model below is the strategy and the
> primitive; the **Entity Spaces** build then shipped Phases 0 to 3 of it (the tenancy spine,
> `/spaces` profiles, and per-space QR / CRM / check-in / email). This doc is no longer the
> current build status; read it for the *why*, and the trilogy + ADRs for what is live:

- **The build spec + status:** [`ENTITY-SPACES-SYSTEM.md`](ENTITY-SPACES-SYSTEM.md) (the data
  model + architecture), [`ENTITY-SPACES-BUILD.md`](ENTITY-SPACES-BUILD.md) (the phased backlog
  + the per-phase `✅ Shipped` status blocks), and [`ENTITY-SPACES-PLAN.md`](ENTITY-SPACES-PLAN.md)
  (strategy + roadmap).
- **The decisions:** [ADR-320 through ADR-337](DECISIONS.md) (the tenancy primitive, the profile
  shell, the deep features, and the security-isolation hardening).
- **Two corrections to §1 below:** (1) the live `spaces.type` set now includes **`event_space`**
  (a venue / retreat role, ADR-325), in addition to the types in the §1 table. (2) The
  public-vs-walled axis is now the first-class `spaces.visibility` column (`network` vs `private`,
  ADR-322), distinct from the `network_connected` gamification switch in §3.

> **Canonical role-type set (2026-06-20, ADR-339; Lab + Partner provisionable 2026-06-20, ADR-341;
> type-driven template/blueprint registry retired 2026-07-01, ADR-489).** The **full role-type set**
> (every value a `spaces.type` row may hold) is: `root`, `practitioner`, `business`, `organization`,
> `coaching`, `event_space`, `lab`, `partner`. All eight are members of `SpaceType`. The
> **provisionable set** (a member can stand one up in the create wizard) is the subset in the canonical
> provisionable-types helper `lib/spaces/profile-config.ts` (`provisionableTypes` / `isProvisionableType`,
> re-homed there when `lib/spaces/blueprints.ts` was deleted). As of **ADMIN-05 (ADR-341)** that subset
> is the full **seven** member-facing roles: `practitioner`, `business`, `organization`, `coaching`,
> `event_space`, **`lab`**, and **`partner`**. `root` is the platform host (never wizard-provisioned,
> never provisionable). Adding any future role is one row in `profile-config.ts`, never a removal from
> `SpaceType`.
>
> **Lab + Partner (ADR-341).** A **Lab** is a physical Frequency place (entity partition
> `labs`): it invites people to **Visit** and reads on a green accent (`--color-success`, the per-type
> default in `profile-config.ts`). A **Partner** is a brand running a Frequency loyalty program (entity
> partition `partner`): it surfaces **Perks**, invites members to **Join**, and shares the Business
> brand accent (`--color-broadcast`). Both compose the **universal owner four**
> (Members / QR / CRM / Email) the settings hub already gives every Space; neither adds a
> role-specific deep owner control in v1 (a Lab runs on the shared event / circle / QR door tools; a
> Partner's loyalty-program engine is a later, money-adjacent phase like memberships v1). The
> `spaces.type` CHECK already allows both values, so making them provisionable needed no migration.

---

## 0. Why this exists

The grand vision has many subsidiary verticals and many sub-brands: Practitioners,
Businesses, Partners, Organizations, Labs, plus Hook. The recurring temptation is to build
each as its own product with its own database. That path forks identity (the same human is
a different row in five systems), forks the game and the trust score, and forks the code:
the exact lock-in the [SCALE-ARCHITECTURE](SCALE-ARCHITECTURE.md) and
[PLATFORM-VISION](PLATFORM-VISION.md) docs are built to avoid.

The Space model gives every sub-brand the feeling of its own product **without** any of
that forking. One app, one database, one identity per human, one game, one trust score.
A Space is a *partition and a skin*, not a separate system.

---

## 1. What a Space is

A **Space** is the tenant unit: a brandable, optionally-standalone surface that belongs to
one operator (a practitioner, a business, an org, a Lab, a Hook-style coaching brand).

| Facet | What it carries |
|---|---|
| **Type** | `practitioner` · `business` · `organization` · `event_space` (venue / retreat, ADR-325) · `lab` · `partner` · `coaching` (Hook-like). Drives the default capabilities, per-type profile defaults (accent / CTA / stats, `lib/spaces/profile-config.ts`), and onboarding track. |
| **Brand / skin** | name, logo, palette, and a `skin` token set (the `[data-skin]` axis of the four-axis theme model, [`docs/THEME.md`](THEME.md)). The look is the operator's; the kit underneath is ours. |
| **Domain** | a Frequency subpath, a subdomain, or a custom domain. Routing resolves the Space from the host/path. |
| **Entity** | `foundation` · `labs` · `partner`: the money-partition tag (PLATFORM-VISION §1). A Space's commerce posts to `financial_transactions` under its entity; money never commingles. |
| **`network_connected`** | the one switch (see §3). Off = standalone white-label app. On = ported into the shared Frequency network. |

**Space-private data is tagged `space_id` and RLS-scoped to the Space.** A Space's own
lessons, programs, members, loyalty events, and bookings live in the shared tables but are
walled to that Space by `space_id` + Row-Level Security: the same backstop pattern the
[connections store](../lib/connections/store.ts) uses for owner-scoping today.

---

## 2. The shared spine (what every Space draws from)

The whole point is that Spaces are partitions on **one** foundation, not islands. The
shared spine is entity-blind and tenant-blind:

| Spine element | Shared because | Source of truth |
|---|---|---|
| **Identity** | one human = one `profiles` row across every Space they touch | `profiles` (anchor `auth_user_id`) |
| **Community graph** | personas, relationships, place-tree, channels/circles | hierarchy tables (PLATFORM-VISION §1) |
| **The game** | one entity-blind engagement/reward ledger | `engagement_events` (ADR-019/025) |
| **Trust score** | one derived, contextual reputation read | `trust_signals` → `trust_scores` (ADR-247) |
| **E-learning library** | a lesson/journey/course authored in any Space can be hosted in the shared library | journey/course block model (ADR-244) |
| **Capability resolver + contract RPCs** | nav and permissions are the union of (role ⊕ personas ⊕ Space ⊕ scope) | capability resolver (ADR-017), `/discover` RPCs (ADR-018) |

A Space does not get its own copy of any of these. It gets a *scoped view* of them.

### 2.1 Per-Space CRM + graduation (CRM-STRATEGY P3 ✅)

Every owner gets a per-Space CRM. There are two surfaces, both scoped by `space_id` (ADR-331/333):

- **CRM board** — `app/(main)/spaces/[slug]/crm` (Dashboard template, full-width, rail `'none'`): the
  Space's pipeline (per-segment stages + deals) and contacts, read through `lib/crm/pipeline.ts` scoped
  to the Space. **Gated twice:** the Space's plan must grant CRM (`spaceHasEntitlement(space,'crm')`) AND
  the viewer must be an **owner / admin** of the Space. When either fails the page renders a tasteful
  **locked / upgrade state**, not a 404 dead end (a missing/not-visible Space still 404s). All reads are
  fail-safe (`[]` on error).
- **Client notes** — `app/(main)/spaces/[slug]/settings/crm` (Focus): per-contact private notes, owner-
  gated personal data (ADR-333). The board's contacts list links here.

**Per-segment stage templates** (`lib/crm/stage-templates.ts`, pure + tested): `defaultStagesForSpaceType`
seeds a different starting pipeline per `spaces.type` — business = sales funnel, practitioner/coaching =
client journey, organization = supporter lifecycle, everything else = a generic funnel.
`ensureSpaceStages(spaceId, type)` seeds them idempotently on first CRM open (a no-op once stages exist,
so an owner's customized pipeline is never overwritten).

**Graduation** (`lib/crm/graduation.ts`, owner + crm-entitlement gated): "Bring your contacts into your
Space CRM" copies the owner's `network_contacts` (optionally a status/tag subset) into the Space's
`contacts(space_id)` via the upsert-by-email bridge (`syncContactToSpaceCrm`), links each personal row
back via `linked_contact_id`, and seeds one open `crm_deal` per imported contact in the Space's first open
stage. Idempotent (already-linked contacts are skipped) and fail-safe. The personal My Contacts list is
unchanged; this is a scope flip, not a move. A light dismissible prompt on My Contacts points members who
are running a business toward this path.

### 2.2 Functions & access (per-Space tools gated by member role · ADR-366)

Every Space tool (CRM, email, members, QR codes, the per-type surfaces, plan/billing, profile/brand) is
gated on **two axes**, resolved by one pure function: `spaceFunctionAccess(space, fn, viewerSpaceRole)`
in `lib/spaces/functions.ts`. The registry `SPACE_FUNCTIONS` is the catalog; adding a tool is **one row**
(plus one entitlement key if it is plan-gated), never a schema change. The resolver is pure and
**fail-safe**: an unknown function, a null/unknown viewer role, or a malformed blob all read as NO access.

- **ON/OFF — `spaces.entitlements`.** A PLAN-GATED function (CRM, email) reads its plan entitlement key
  (default-deny). A UNIVERSAL function (members, QR, profile, billing, the per-type surfaces) keys the
  SAME blob by its function key, **default-ON** (only an explicit `false` turns it off). No new column for
  the switch. (Projecting `entitlements` onto the resolved Space in `lib/spaces/store.ts` is also the fix
  for the latent CRM lock: the board read `undefined` for `crm` before and was locked for everyone.)
- **MIN-ROLE — `spaces.feature_roles`.** A jsonb mapping a function key to the lowest `SpaceRole`
  (viewer < editor < moderator < admin) that may use it, **sparse** against a code default
  (`DEFAULT_FUNCTION_ROLE`). An empty blob = every function at its code default, so this reproduces
  today's gating exactly. Defaults: universal tools at editor (the old `canEditProfile` threshold),
  check-in at moderator, billing + CRM + email at admin.

**Who controls it (two tiers).**

| Control | Surface | Scope |
| --- | --- | --- |
| Operator absolute switch | `/admin/spaces/[id]` "Features and access" grid (janitor) | One Space; the override beats the plan |
| Operator per-type defaults | `/admin/spaces/defaults` (janitor) → `space_function_type_defaults` | What every NEW Space of a type starts with |
| Owner toggle + min-role | `/spaces/<slug>/settings/features` (owner/admin) | One Space, within the plan only |

`space_function_type_defaults` is RLS-on, **service-role only** (no client policies), sparse (one row per
`(type, fn)` an operator touched), and **fail-safe**: a missing row = the code default, so an empty table
resolves exactly as today. A new Space **seeds** its `entitlements` + `feature_roles` from those per-type
defaults merged over the code defaults (`seedSpaceConfigFromDefaults`, in `lib/spaces/provision.ts`);
plan-gated tools are never seeded ON (a new Space starts free). Existing Spaces are untouched.

**Defense in depth.** Each settings surface gates BOTH the page render AND its server action through the
same resolver, so a lowered/disabled per-Space setting is enforced on the write, not merely hidden. A
locked tool renders a calm `FeatureLockedNotice` (turn it on, upgrade the plan, or ask whoever runs the
Space), never a 404 of a visible Space. The settings hub hides cards for tools the viewer cannot use (no
dead cards). A platform janitor previewing a Space they do not manage keeps the existing read-only
preview; the resolver is bypassed only for that staff-view render, and every write stays gated.

---

## 3. The network switch (the direct port into the network)

Every Space has one switch: **Connect to the Frequency Network** (`network_connected`).

- **Off: standalone white-label app.** The Space runs as the operator's own branded
  product on its own domain and (where commerce applies) its own subscription. Members,
  programs, and internal gamification stay inside the Space. This is the "pay a subscription
  to use the app outside of Frequency" path the owner described.
- **On: ported into the network.** The Space's internal gamification, programs, and
  library link into the shared network. Concretely: a lesson plan authored in a Space can
  be **hosted in the Frequency library** and **compete in the full gamified network**; the
  Space's members earn **shared points and trust** for real practice; the Space appears in
  shared discovery. Money still stays on the Space's entity rail; only identity, points,
  trust, and content cross, by the same contract the federation uses.

The switch is a property of the Space, read by the resolver. Turning it on never migrates
data; it changes which shared seams the Space's events flow into.

---

## 4. Two deployment shapes (and where Hook sits)

A Space is a *concept*; it can be deployed two ways. **Both are Spaces:** same identity,
same game, same trust, same switch. Only the hosting and the integration mechanism differ.

| Shape | What it is | Integration | Default for |
|---|---|---|---|
| **Native Space** | lives inside the one Frequency app/DB, scoped by `space_id` + RLS | in-process; reads the spine directly | **all new sub-brands** (practitioners, businesses, orgs, Labs) |
| **Federated Space** | an externally-deployed product with its own DB | the versioned contract + signed webhooks ([HOOK-FEDERATION](HOOK-FEDERATION-ARCHITECTURE.md)) | a product that already exists separately, or one an operator insists on self-hosting |

**Hook is one Space among many: the federated one.** It is an already-built, separately
deployed coaching/e-learning product, so it integrates as a **Federated Space** by contract
(ADR-158): identity links, points roll up, trust is portable with consent, money never
crosses. Going forward, a *new* coaching brand would simply be a `coaching`-type **Native
Space**, no separate codebase needed. Hook is the prototype of the type, not a separate
category.

> **This resolves the open decision.** PLATFORM-VISION §10 and ADR-246 left "the home of
> Labs: in-house module vs. separate product (Hook)" open. Locked: **Native Space in one
> database is the default**; federation is the escape hatch, not the rule. One human is one
> `profiles` row whether they are a community member, a gym member, and a Hook client.

---

## 5. How a Space relates to verticals

Spaces and verticals are **orthogonal**, and the distinction is the whole architecture:

- **Verticals are capabilities** the platform offers: Circles, Channels, Journeys,
  Practices, Challenges, Events, Marketplace, Store, Programs (the core member verticals),
  each a module against the registry (PLATFORM-VISION §4, ADR-033/248).
- **Spaces are tenants** that turn those capabilities on under their own brand. A
  practitioner Space might enable Journeys + Events + Store; a business Space might enable a
  loyalty Partner program + Events.

So adding a sub-brand is **not** new code: it is a new `spaces` row that selects which
existing vertical modules it exposes, under its skin, on its domain, tagged to its entity.
That is the clean-scaling promise made concrete.

---

## 6. What must be true first (the gating prerequisites)

The Space model rides on seams that must be load-bearing before sub-brands ship. None are a
rewrite; all are *activation* (BASELINE-ASSESSMENT, ADR-248):

1. ⏳/🔴 **Activate the module/WidgetSlot registry** (ADR-033/248). A Space composes by
   selecting modules; if the registry isn't wired, every Space hand-wires nav/admin and the
   promise breaks. **This is the keystone.**
2. ✅ **Entity partition** (ADR-029/246). `entities` + `financial_transactions` exist, so a
   Space's money has a partitioned home from day one.
3. 🔴 **Trust signals seam** (ADR-247). Spaces emit trust signals the way they emit
   engagement events; seam it before commerce Spaces ship so each emits from day one.
4. ⏳ **The `spaces` table + `space_id` scoping + skin axis** (this doc). The tenancy
   columns + the `[data-skin]` resolver exist; the theme seam is now generalized to a
   **multi-axis `data-*` model** (mode × skin × occasion × generation) with a `server-only`
   `resolveTheme()` and typed `lib/theme/` registries (see [`docs/THEME.md`](THEME.md), ADR-257).
   Remaining: full `space_id` RLS on new vertical tables, the `spaces.generation` default column,
   `space_members`, and custom-domain content-routing.

Sequence: **registry activation → spaces table + skin → trust seam → first Space.** Build a
Space before the registry is load-bearing and it accretes hand-wiring: the one thing this
model exists to prevent.

---

## 7. One-screen summary

- **One app, one database, one identity per human.** Spaces are partitions + skins, not
  separate systems.
- **Shared spine:** identity, community graph, the game, the trust score, the e-learning
  library, the capability resolver. Spaces draw from it; they never copy it.
- **A Space = type + brand/skin + domain + entity + a network switch.** Space-private data
  is `space_id`-scoped under RLS.
- **The switch ports a Space into the network:** its lessons enter the shared library and
  compete in the game; its members earn shared points and trust; money stays on its entity
  rail.
- **Native Space (in-DB) is the default; Federated Space (by contract) is the escape hatch.**
  Hook is the federated prototype: one Space among many, not a separate category.
- **Sub-brands are configuration, not new code:** a `spaces` row selecting existing
  vertical modules, *once the registry is load-bearing.*
