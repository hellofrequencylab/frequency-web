# Spaces: the white-label tenancy model (one app, one graph, many sub-brands)

> **The model, in one line.** Every sub-brand — a practitioner's mini-site, a business
> with a loyalty program, an organization, a physical Lab, a coaching platform like Hook —
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

## 0. Why this exists

The grand vision has many subsidiary verticals and many sub-brands: Practitioners,
Businesses, Partners, Organizations, Labs, plus Hook. The recurring temptation is to build
each as its own product with its own database. That path forks identity (the same human is
a different row in five systems), forks the game and the trust score, and forks the code —
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
| **Type** | `practitioner` · `business` · `organization` · `lab` · `partner` · `coaching` (Hook-like) — drives the default capabilities, templates, and onboarding track. |
| **Brand / skin** | name, logo, palette, and a `skin` token set (the `[data-skin]` axis of the four-axis theme model, [`docs/THEME.md`](THEME.md)). The look is the operator's; the kit underneath is ours. |
| **Domain** | a Frequency subpath, a subdomain, or a custom domain — routing resolves the Space from the host/path. |
| **Entity** | `foundation` · `labs` · `partner` — the money-partition tag (PLATFORM-VISION §1). A Space's commerce posts to `financial_transactions` under its entity; money never commingles. |
| **`network_connected`** | the one switch (see §3). Off = standalone white-label app. On = ported into the shared Frequency network. |

**Space-private data is tagged `space_id` and RLS-scoped to the Space.** A Space's own
lessons, programs, members, loyalty events, and bookings live in the shared tables but are
walled to that Space by `space_id` + Row-Level Security — the same backstop pattern the
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

---

## 3. The network switch (the direct port into the network)

Every Space has one switch: **Connect to the Frequency Network** (`network_connected`).

- **Off — standalone white-label app.** The Space runs as the operator's own branded
  product on its own domain and (where commerce applies) its own subscription. Members,
  programs, and internal gamification stay inside the Space. This is the "pay a subscription
  to use the app outside of Frequency" path the owner described.
- **On — ported into the network.** The Space's internal gamification, programs, and
  library link into the shared network. Concretely: a lesson plan authored in a Space can
  be **hosted in the Frequency library** and **compete in the full gamified network**; the
  Space's members earn **shared points and trust** for real practice; the Space appears in
  shared discovery. Money still stays on the Space's entity rail — only identity, points,
  trust, and content cross, by the same contract the federation uses.

The switch is a property of the Space, read by the resolver. Turning it on never migrates
data; it changes which shared seams the Space's events flow into.

---

## 4. Two deployment shapes (and where Hook sits)

A Space is a *concept*; it can be deployed two ways. **Both are Spaces** — same identity,
same game, same trust, same switch. Only the hosting and the integration mechanism differ.

| Shape | What it is | Integration | Default for |
|---|---|---|---|
| **Native Space** | lives inside the one Frequency app/DB, scoped by `space_id` + RLS | in-process; reads the spine directly | **all new sub-brands** (practitioners, businesses, orgs, Labs) |
| **Federated Space** | an externally-deployed product with its own DB | the versioned contract + signed webhooks ([HOOK-FEDERATION](HOOK-FEDERATION-ARCHITECTURE.md)) | a product that already exists separately, or one an operator insists on self-hosting |

**Hook is one Space among many — the federated one.** It is an already-built, separately
deployed coaching/e-learning product, so it integrates as a **Federated Space** by contract
(ADR-158): identity links, points roll up, trust is portable with consent, money never
crosses. Going forward, a *new* coaching brand would simply be a `coaching`-type **Native
Space** — no separate codebase needed. Hook is the prototype of the type, not a separate
category.

> **This resolves the open decision.** PLATFORM-VISION §10 and ADR-246 left "the home of
> Labs — in-house module vs. separate product (Hook)" open. Locked: **Native Space in one
> database is the default**; federation is the escape hatch, not the rule. One human is one
> `profiles` row whether they are a community member, a gym member, and a Hook client.

---

## 5. How a Space relates to verticals

Spaces and verticals are **orthogonal**, and the distinction is the whole architecture:

- **Verticals are capabilities** the platform offers — Circles, Channels, Journeys,
  Practices, Challenges, Events, Marketplace, Store, Programs (the core member verticals),
  each a module against the registry (PLATFORM-VISION §4, ADR-033/248).
- **Spaces are tenants** that turn those capabilities on under their own brand. A
  practitioner Space might enable Journeys + Events + Store; a business Space might enable a
  loyalty Partner program + Events.

So adding a sub-brand is **not** new code — it is a new `spaces` row that selects which
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
Space before the registry is load-bearing and it accretes hand-wiring — the one thing this
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
  Hook is the federated prototype — one Space among many, not a separate category.
- **Sub-brands are configuration, not new code** — a `spaces` row selecting existing
  vertical modules — *once the registry is load-bearing.*
