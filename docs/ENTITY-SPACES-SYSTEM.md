# Entity Spaces: system design (the dream-suite build spec)

> **The answer, first.** Build a "dream suite" of branded **entity Spaces** by treating
> Frequency's existing `spaces` row as the tenant, scoping every space-private object with
> `space_id` + RLS, and composing each space from shared subsystems gated by per-space
> **entitlements**. Every space runs in one of **three modes** (Networked · Private ·
> Full White-Label), serves one of **five+ roles** (Practitioner · Business · Organization ·
> Coaching · Event Space), and opts into the Quest economy with a single flag. Correctness of
> isolation is non-negotiable; sophistication is deferred. New roles and features are
> **additive** (a blueprint + an entitlement), never a refactor.

**Status:** ⏳ Design / build-spec (no code in this doc). Prepared 2026-06-19.
**Companion to:** [`docs/ENTITY-SPACES-PLAN.md`](ENTITY-SPACES-PLAN.md) (strategy, research,
market analysis, phased roadmap). This doc is the *how-we-build-it* spine.
**Grounded in:** `lib/spaces/*`, `lib/core/access-matrix.ts`, `lib/core/roles.ts`,
`lib/core/entitlement.ts`, `lib/widgets/modules.ts`, `lib/verticals/registry.ts`,
`supabase/migrations/` (spaces, entities, personas, CRM, QR, tickets, themes, page_settings,
stewardships, email).
**Canon it obeys:** [`docs/SPACES.md`](SPACES.md) (ADR-249/250) · [`docs/NAMING.md`](NAMING.md)
· [`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md) · [`docs/PRESENTATION.md`](PRESENTATION.md) ·
[`docs/THEME.md`](THEME.md) · [`docs/PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md).

Status legend: ✅ build now · ⏳ later phase · ⚠️ compliance-gated · 🔴 not built / blocker · 🅿️ parked.

---

## Table of contents

1. [Overview, principles, and the three operating modes](#1-overview-principles-and-the-three-operating-modes)
2. [The role model + per-role feature catalogs](#2-the-role-model--per-role-feature-catalogs)
3. [Cross-cutting feature systems (shared platform)](#3-cross-cutting-feature-systems-shared-platform)
4. [Complete data model](#4-complete-data-model)
5. [Architecture and tech stack](#5-architecture-and-tech-stack)
6. [Execution path and expand-without-breaking](#6-execution-path-and-expand-without-breaking)
7. [Open decisions and recommended sequencing](#7-open-decisions-and-recommended-sequencing)

---

## 1. Overview, principles, and the three operating modes

### 1.1 Product vision

A **Space** is a brandable, optionally-standalone tenant of the one Frequency app and
database. A practitioner's micro-site, a studio's membership program, a non-profit's donor
home, a retreat's ticketing portal, a coaching academy - each is one `spaces` row, scoped by
`space_id` + RLS, skinned by its own theme, served on its own domain, posting money to its own
entity. The "dream suite" is the full set of operator tools every such space can compose:
profile/site, events, circles, practices, CRM, comms, monetization, scheduling, QR studio,
analytics, AI co-host, and admin - each a shared subsystem turned on per space.

The structural differentiator (the moat) is the one thing the market does **not** do: a
**connected network of spaces**. With `network_connected` on, a member carries one identity,
one gamified Quest, and one practice history across every space they touch, and spaces appear
in shared discovery. Competitors top out at disconnected instances joined by a switcher.

### 1.2 Design principles (the non-negotiables)

| # | Principle | What it means in practice |
|---|---|---|
| P1 | **One network, many spaces** | One app, one DB, one `profiles` row per human. A space is a partition + a skin, never a separate system. Identity, the game, trust, and the library are *shared spine*; a space gets a scoped view, never a copy. |
| P2 | **Gamification is optional** | The Quest economy (Pillars/Journeys/Practices/Zaps/Gems/ranks) is opt-in per space via `network_connected` + a `gamification` entitlement. A Private studio can run with zero game; a Networked practitioner runs the full game. |
| P3 | **Templated + tunable** | A space spins up from a **role blueprint** (copy-on-create), then the owner tunes within guardrails (curated palettes, typed page fields, allowed module set). Never a blank space; never a free-form page builder early. |
| P4 | **Expand without breaking** | Every new capability ships behind an **entitlement/feature-flag**; every schema change is **expand/contract**; new roles are a **blueprint + config**, not core edits; RLS + contract tests are the safety net. |
| P5 | **Server-authoritative isolation** | The server is the source of truth for "which space" and "what may this caller do here." `space_id` + RLS + tenant-scoped cache keys. A cross-tenant leak is the worst-case bug; treat it like the auth gate. |
| P6 | **Correctness over sophistication** | Isolation correctness is shipped first and proven with tests. Deep per-role features (room maps, payroll, fund accounting) are layered on after the tenancy spine is load-bearing. |
| P7 | **Plain copy, magic in the proper nouns** | All member/operator-facing copy obeys NAMING + CONTENT-VOICE: camp-counselor-you-respect voice, no em dashes, run the §10 checklist. AI-generated space copy reads the same primer (`lib/ai/voice.ts`). |

### 1.3 The three operating modes

A mode is a **named bundle of `spaces` flags + entitlements**, not a new code path. The
resolver reads the row; the shell composes accordingly. The three modes are points on a
spectrum of *isolation from the network* and *visibility of Frequency's brand*.

| Facet | **Networked** | **Private** | **Full White-Label** |
|---|---|---|---|
| One-liner | Lives inside Frequency, fully gamified, discoverable | On Frequency infra but walled-off; own roster, no leakage | Own domain, own brand, Frequency invisible; optional native app |
| `spaces.network_connected` | `true` | `false` | `false` (may federate back: see §1.5) |
| `spaces.visibility` *(new)* | `network` | `private` | `private` |
| `spaces.domain` | `frequency.app/<slug>` or `<slug>.frequency.app` | `<slug>.frequency.app` (own subdomain) | custom apex (e.g. `studio.com`) + TLS |
| `spaces.skin` / brand fields | Frequency-forward, accent customizable | Own brand prominent, "powered by Frequency" footer | Own brand only; **no** Frequency chrome |
| Member roster | Shared network identity; cross-space history | Own `space_members` roster; identity still one `profiles` row, but **discovery-isolated** | Own roster; own email-sender domain |
| Quest / gamification | ✅ full (Pillars/Journeys/Practices/Zaps/ranks) | ◦ optional (toggleable, off by default) | ◦ optional |
| Cross-space discovery / feed | ✅ in shared discovery + feed | 🔴 excluded from discovery, feed, people-search | 🔴 excluded |
| Library contribution | Authored content can enter the shared library + compete | Stays inside the space | Stays inside the space (unless federated) |
| Email sender | Frequency transactional + per-space marketing domain | Per-space marketing domain; transactional may stay Frequency | Fully own sender domain (SPF/DKIM/DMARC) |
| Native app | Shared Frequency PWA/app | Shared PWA | ⏳ own native app (done-for-you top tier) |
| Money | Own entity + Stripe Connect (take-rate applies) | Own entity + Connect | Own entity + Connect (lowest take rate) |
| Typical plan | Free / Starter / Pro | Pro / Business | Business / White-Label+ |

> `◦` = optional / off by default. The single switch that defines Networked is
> `network_connected`; the single switch that defines public-vs-walled is the **new
> `visibility`** column. Everything else (skin, domain, branding, native app) is a
> consequence of plan + entitlements, not a separate mode flag.

### 1.4 Mode → flags / entitlements / features (the authoritative map)

| Capability | Networked | Private | Full White-Label | Driven by |
|---|---|---|---|---|
| Resolve by custom domain | ◦ subdomain | ✅ subdomain | ✅ apex + TLS | `spaces.domain` + `custom_domains` (§4) |
| Remove Frequency branding | 🔴 | ⏳ partial (footer stays) | ✅ | `entitlements.white_label` |
| Cross-network discovery | ✅ | 🔴 | 🔴 | `spaces.visibility` |
| Shared Quest accrual | ✅ | ◦ | ◦ | `network_connected` + `entitlements.gamification` |
| Cash-in the Vault (spend Gems) | ✅ (member's own paid tier) | ◦ | ◦ | member `membership_tier` (`canCashIn`) + space `gamification` |
| Library contribution / hosting | ✅ | 🔴 | 🔴 (◦ if federated) | `network_connected` |
| Own marketing sender domain | ◦ | ✅ | ✅ | `entitlements.email` + `sender_domains` |
| Own transactional sender domain | 🔴 | ◦ | ✅ | `entitlements.white_label_email` |
| Stripe Connect payouts | ✅ | ✅ | ✅ | `profile_personas.stripe_account_id` / space Connect acct |
| Native branded app | 🔴 | 🔴 | ⏳ | `entitlements.native_app` (done-for-you) |
| CRM + email suite | add-on | add-on | add-on/included | `entitlements.crm`, `entitlements.email` |

Entitlements live in a single `spaces.entitlements jsonb` (plus a `spaces.plan` label) so a
new capability is **one key**, never a schema migration (P4). The resolver reads them once and
puts the active `space_id` + `plan` into the JWT (§5).

### 1.5 Upgrade / downgrade paths (and what must NOT break)

Mode changes are **flag edits**, never data migrations. The data is already `space_id`-tagged;
switching modes changes *which shared seams the space's events flow into* and *which chrome
renders*, never *where the rows live*.

| Transition | What changes | What must NOT break |
|---|---|---|
| Networked → Private | `visibility: network → private`; pull from discovery/feed; optionally turn gamification off | Members keep their `profiles` identity + history; existing Quest accruals are **frozen, not deleted**; bookmarks/links to in-space content keep resolving |
| Private → Networked | `visibility: private → network`; `network_connected: true`; opt content into library | No retroactive leak: only content the owner explicitly opts in enters discovery; member rosters do not auto-merge into global people-search beyond consent |
| Private → White-Label | add custom domain + TLS; `white_label` entitlement on; flip transactional sender | 301/canonical from the old `*.frequency.app` subdomain so SEO/links survive; existing member sessions stay valid across the host change |
| White-Label → Private | drop custom domain (or keep), `white_label` off | Custom-domain links 301 back to the subdomain; no orphaned TLS certs left serving |
| Any → suspended/archived | `spaces.status` flips | Reads fail-closed (RLS denies); money already settled is untouched; a `kill-switch` halts all sends |
| Federated escape hatch | a standalone product (e.g. Hook) federates back via the versioned contract + signed webhooks (HOOK-FEDERATION) | Identity links and points roll-up only with consent; money never crosses entities |

**Invariant across all transitions:** one human = one `profiles` row; money stays on the
space's entity; isolation (`space_id` + RLS) is identical in every mode - the mode only changes
*visibility and branding*, never the *security boundary*.

---

## 2. The role model + per-role feature catalogs

### 2.1 The role model

A **role** (the brief's "partner role" / vertical) is the *kind* of operator a space serves.
It maps to `spaces.type` and selects a **blueprint** (default modules, theme, seed content,
entitlements, compliance gates). Roles are orthogonal to modes: any role can run in any mode.

| Role | `spaces.type` | Persona hat (`profile_personas`) | Money entity default | Primary job-to-be-done |
|---|---|---|---|---|
| **Practitioner** | `practitioner` | `practitioner` | `labs` | 1:1 client relationships, bookings, assignable Practices/Journeys, a personal brand page |
| **Business** (studio/gym/brand) | `business` | `business` | `labs` | Memberships, classes, staff roles, retention, CRM pipeline, branded space |
| **Organization** (non-profit) | `organization` | `organization` | `foundation` | Programs, donations, recurring giving, volunteers, tax-compliant receipts |
| **Coaching** (academy) | `coaching` | `business`/`organization` | `labs` | Cohort + 1:1 programs, curriculum, accountability, progress (Hook is the federated prototype) |
| **Event Space** (venue/retreat) | `event_space` *(new; recommend dedicated, see §7)* | `business`/`organization` | `labs` | Ticketing, capacity/waitlist, room maps, meal plans, installment plans, check-in, waivers |

The `spaces.type` CHECK today is `('root','practitioner','business','organization','lab','partner','coaching')`.
Adding `event_space` is one expand-migration to the CHECK + one blueprint (§6).

**Authority model (reuse, don't reinvent).** A space owner is `spaces.owner_profile_id`; they
keep their personal account + Quest and "wear" the space. Per-space roles live in the new
`space_members` table (`viewer | editor | moderator | admin`), independent per space. The
**access matrix** (`lib/core/access-matrix.ts`) already encodes the partner-persona columns
(`practitioner`/`business`/`organization`) on the Studio surfaces (`businessCrm`, `website`,
`earnings`, `qrStudio`, `growthStudio`, `hookNetwork`); the per-space capability resolver
extends it with "admin of the owning space" (mirroring the existing `host → their circles`
pattern). The global staff axis (`web_role`) stays separate and locked.

### 2.2 What a role blueprint consists of (the extensibility contract)

> **⚠️ Superseded (2026-07-01, ADR-489).** The per-type `RoleBlueprint` registry
> (`lib/spaces/blueprints.ts`) and the four-template layer (`lib/spaces/templates.ts`) have been
> DELETED. The public profile is now **operator-composed feature-block pages** (Phase 5 of the profile
> redesign); the only per-type nuances that survive are DATA in `lib/spaces/profile-config.ts` (default
> accent / primary-CTA label / hero stat set) plus the provisionable-types helper there. "Adding a role"
> is now: add the value to `SpaceType`, add its row to `profile-config.ts`, and (optionally) a Mode
> descriptor in `lib/spaces/modes.ts`. The blueprint shape below is retained only as historical context.

Adding a role = authoring a **blueprint descriptor** (data) + registering it. No core edit. A
blueprint is the role-level analog of `lib/verticals/registry.ts`'s `Vertical` descriptor.

```
RoleBlueprint {
  type            // 'practitioner' | … | 'event_space'  (spaces.type)
  label, voice    // operator-facing name + onboarding tone (CONTENT-VOICE)
  entityDefault   // 'foundation' | 'labs'
  enabledVerticals[]      // which lib/verticals ids switch on
  defaultModules  // per-route module sets (lib/widgets/modules.ts ROUTE_MODULE_IDS)
  defaultSkin     // a theme slug (themes table)
  seedContent     // copy-on-create: starter pages (Puck block tree), sample
                  //   circle/event/practice/journey, default CRM pipeline stages
  entitlements    // default jsonb the plan grants (crm, email, gamification, …)
  deepFeatures[]  // role-specific modules to register (bookings, ticketing, donations…)
  complianceGates // PCI, ESIGN, IRS receipts, lodging tax, CAN-SPAM/TCPA, GDPR/CCPA
  onboardingWizard// the ≤7-step golden path that lands on a non-empty space
}
```

The provisioning engine reads a blueprint and **deep-copies** its `seedContent` into the
space's own rows (copy-on-create, never live-reference), stamping `template_id` /
`template_version` for analytics only. After creation, rendering never depends on the template
(P3). New role = new descriptor in the registry array; the core composes it.

### 2.3 Surface coverage legend (used in every catalog)

Each role catalog below enumerates every surface. Per feature: **status** (✅ build-now /
⏳ later / ⚠️ compliance-gated) and **build-vs-integrate** (Build = community/engagement we
own; Integrate = a commodity we wrap, e.g. Stripe, an ESP, payroll).

---

### 2.4 Practitioner (the recommended first role)

**JTBD:** a solo healer/coach/teacher runs 1:1 client relationships, sells sessions and
packages, assigns Practices/Journeys, and presents a personal brand page. Smallest surface,
clearest value, cleanest end-to-end slice.

| Surface | Features | Status · Build/Integrate |
|---|---|---|
| Profile / micro-site | Branded landing (Puck block tree): hero, bio, offerings, testimonials, booking CTA, Connect QR; SEO meta per page | ✅ Build |
| Events | 1:1 sessions + small group sessions; RSVP; reminders; recurring | ✅ Build (events engine) |
| Circles | Optional private client group / Run | ✅ Build |
| Practices & Journeys | Assign a Practice/Journey to a client; build custom Journeys; track progress | ✅✅ Build (core) |
| Members & CRM | Client list; client notes (private, per-client); intake; tags; engagement score | ✅ Build; notes ⚠️ (sensitive data, GDPR/CCPA) |
| Comms | Per-client email/SMS reminders; nurture sequences; broadcast to clients | ✅ email Integrate (ESP) · ⚠️ SMS (A2P 10DLC/TCPA) |
| Monetization | Sessions, **packages** (multi-session packs), tips, subscriptions; Connect payouts | ✅ Integrate (Stripe Connect) · ⚠️ PCI |
| Scheduling / booking | **1:1 booking** with availability, buffers, time-zones, no-show policy, calendar sync | ✅✅ Build engine + Integrate (Google Calendar) |
| QR studio + splash | Profile/booking-link code; splash landing per code; analytics | ✅ Build |
| Analytics / insights | Bookings, revenue, retention, client engagement; at-risk client signals | ✅ Build · ⏳ churn model |
| Admin / roles | Light: owner + optional assistant (`editor`); per-space invites | ✅ Build |
| AI / automation | Per-space Vera co-host: drafts bios/offerings, suggests session follow-ups, RAG over the practitioner's own content | ✅ Build (guardrailed) |
| **Deep features** | 1:1 booking · client notes · packages/packs · session follow-up automations | ✅ |

**Blueprint:** modules = `{profile, bookings, practices, journeys, crm-clients, comms}`;
theme = warm single-practitioner skin; seed = a sample offering + a booking page + the default
"Lead → Contacted → Booked → Client" pipeline. **Compliance gates:** PCI (hosted Stripe
fields), GDPR/CCPA (client notes are personal data; DPA + export/delete), CAN-SPAM/TCPA
(consent on `contacts.consent_state` + `sms_consent`).

---

### 2.5 Business (studio / gym / brand)

**JTBD:** a studio runs recurring classes, memberships, staff, retention, and a branded space.

| Surface | Features | Status · Build/Integrate |
|---|---|---|
| Profile / site | Branded site; schedule embed; membership CTA; locations | ✅ Build |
| Events | Classes/workshops; recurring schedule; capacity; **waitlist auto-fill** | ✅✅ Build · waitlist ⏳ |
| Circles | Class cohorts; member community feed; Runs | ✅ Build |
| Practices & Journeys | Assign programs to members; on-demand library | ✅ Build |
| Members & CRM | Lead → trial → member pipeline; attendance; **at-risk/churn intelligence** | ✅ pipeline · ⏳ churn model (Build, our edge) |
| Comms | Class reminders (email/SMS/push); win-back; broadcasts; segments | ✅ Integrate ESP · ⚠️ SMS |
| Monetization | **Memberships** (recurring + dunning), class packs, drop-ins, retail/**POS** | ✅ Integrate (Stripe billing) · POS ⏳ · ⚠️ PCI |
| Scheduling | Class schedule, staff assignment, room/resource calendar | ✅ Build |
| QR studio + splash | Class check-in code, promo codes, member referral | ✅ Build (check-in via `nodes`) |
| Analytics | Attendance, retention cohorts, revenue, LTV, no-show rates | ✅ Build |
| Admin / roles | **Staff roles** (instructor/front-desk/manager → `space_members`); payroll export | ✅ roles · payroll ⏳ Integrate (ADP/Gusto) |
| AI / automation | Vera: retention nudges, schedule blurbs, win-back copy, RAG over the studio's content | ✅ Build |
| **Deep features** | classes/memberships · staff roles · payroll-integration · retention intelligence · POS/retail | ✅ core · ⏳ POS/payroll |

**Blueprint:** modules = `{site, schedule, memberships, members-crm, circles, comms,
analytics}`; theme = bold studio skin; seed = a weekly class template + membership tiers + the
"Lead → Trial → Member → At-risk → Won-back" pipeline. **Compliance:** PCI, recurring-billing
dunning, **ESIGN/UETA digital liability waivers** ⚠️, CAN-SPAM/TCPA, GDPR/CCPA. **Don't
rebuild** payroll/heavy back-office - integrate.

---

### 2.6 Organization (non-profit)

**JTBD:** an org runs programs, raises money (one-time + recurring), manages volunteers, and
issues tax-compliant receipts. Entity defaults to **Foundation**.

| Surface | Features | Status · Build/Integrate |
|---|---|---|
| Profile / site | Mission page, programs, impact, donate CTA, volunteer signup | ✅ Build |
| Events | Fundraisers, volunteer days, program sessions; ticketed galas | ✅ Build |
| Circles | Programs / chapters; volunteer cohorts | ✅ Build |
| Practices & Journeys | Program curricula; assigned to participants | ✅ Build |
| Members & CRM | **Donor profile as the spine** - every donation/event/volunteer/message writes one record | ✅✅ Build (highest leverage) |
| Comms | Appeals, newsletters, campaigns; segmented by giving history | ✅ Integrate ESP · ⚠️ CAN-SPAM |
| Monetization | One-time + **recurring giving** (first-class), hosted donation forms, **fee-coverage** ("donor covers fees"), P2P/team fundraising | ✅ Integrate (Stripe) · ⚠️ PCI |
| Scheduling | Volunteer shift scheduling | ⏳ Build |
| QR studio + splash | Donate code, volunteer-signup code, event check-in | ✅ Build |
| Analytics | Donor retention, recurring-revenue, campaign ROI, grant reporting, fund accounting | ✅ Build · fund accounting ⏳ |
| Admin / roles | Volunteer/role management; chapter admins (`space_members`) | ✅ Build |
| AI / automation | Vera: appeal drafts, thank-you notes, grant-narrative help, RAG over the org's content | ✅ Build |
| **Deep features** | donations · recurring giving · volunteers · grants · **tax-compliant receipts** | ✅ core · receipts ⚠️ |

**Tax receipts (the frequent gap, ⚠️):** auto-compute the IRS **$250 written-acknowledgment**
threshold AND the **$75 quid-pro-quo** rule - event tickets/auctions must show the *deductible
portion* (amount paid minus fair-market value of benefits). Build this into the receipt
generator, not as an afterthought. **Blueprint:** modules = `{site, donate, donors-crm,
volunteers, events, comms}`; theme = trustworthy non-profit skin; seed = a donation form + a
recurring-giving tier + the "Prospect → First gift → Recurring → Lapsed" donor pipeline.
**Compliance:** PCI (DSS 4.0 client-side rules if we host forms) ⚠️, charitable-solicitation
registration awareness ⚠️, IRS receipt rules ⚠️, CAN-SPAM/TCPA, GDPR/CCPA.

---

### 2.7 Coaching (academy)

**JTBD:** a coaching brand runs cohort and 1:1 programs with curriculum, accountability, and
progress tracking. Hook is the **federated** prototype of this type; a *new* coaching brand is
a native `coaching` space (no separate codebase).

| Surface | Features | Status · Build/Integrate |
|---|---|---|
| Profile / site | Program landing, curriculum overview, enrollment CTA, testimonials | ✅ Build |
| Events | Live cohort calls, office hours, accountability check-ins | ✅ Build |
| Circles | Cohort container (a Run); peer accountability groups | ✅✅ Build |
| Practices & Journeys | **Curriculum as a Journey** (lessons/blocks); assignments; completion | ✅✅ Build (journey block model) |
| Members & CRM | Enrollment pipeline; client progress; **accountability** signals | ✅ Build |
| Comms | Cohort announcements, nudges, drip sequences | ✅ Integrate ESP |
| Monetization | Cohort tuition, 1:1 packages, **installment plans**, subscriptions | ✅ Integrate (Stripe) · installments ⏳ · ⚠️ PCI |
| Scheduling | 1:1 + group call scheduling; calendar sync | ✅ Build + Integrate |
| QR studio + splash | Enrollment code, cohort check-in | ✅ Build |
| Analytics | Cohort completion, progress, engagement, NPS | ✅ Build |
| Admin / roles | Lead coaches, TAs, mentors (`space_members`) | ✅ Build |
| AI / automation | Vera: lesson drafts, progress summaries, nudge copy, RAG over the curriculum | ✅ Build |
| **Deep features** | cohort/1:1 programs · curriculum · accountability · progress | ✅ |

**Federation note:** a federated coaching space (Hook) links identity, rolls up points with
consent, and never crosses money - by the versioned contract (HOOK-FEDERATION). A native
coaching space uses the in-DB path. **Blueprint:** modules = `{site, curriculum-journeys,
cohort-circles, enrollment-crm, scheduling, comms}`; seed = a sample 6-week curriculum +
cohort. **Compliance:** PCI, CAN-SPAM/TCPA, GDPR/CCPA, consumer-education disclosures where
applicable ⚠️.

---

### 2.8 Event Space (venue / retreat)

**JTBD:** a venue or retreat sells tickets, manages capacity and lodging, runs installment
payment plans, checks attendees in, and gates on waivers/insurance. Recommend a **dedicated
`event_space` type** (§7) so blueprint, modules, and pricing differ cleanly.

| Surface | Features | Status · Build/Integrate |
|---|---|---|
| Profile / site | Retreat/venue site; itinerary; lodging/meal info; book CTA | ✅ Build |
| Events | **Tiered ticketing** + **capacity** + **waitlist**; multi-day; sessions | ✅✅ Build (event_ticket_types exists) |
| Circles | Attendee community before/after; alumni | ✅ Build |
| Practices & Journeys | Pre/post-retreat practice plans | ⏳ Build |
| Members & CRM | Attendee CRM; intake; dietary/preferences; emergency contacts | ✅ Build; sensitive fields ⚠️ |
| Comms | Confirmations, reminders, pre-arrival sequences, refunds comms | ✅ Integrate ESP · ⚠️ SMS |
| Monetization | Tickets, **deposits with expiring holds**, **installment payment plans** (auto-billing), tiered refund/cancellation engine | ✅ tickets · installments ⏳ · ⚠️ PCI |
| Scheduling | Room/space booking; session calendar | ⏳ Build |
| QR studio + splash | **Ticket/attendee check-in** (verified, zaps-earning via `nodes`); on-site codes | ✅✅ Build (reuses `nodes`) |
| Analytics | Sales, capacity/fill, check-in rate, refunds, lodging occupancy | ✅ Build |
| Admin / roles | Door staff, coordinators (`space_members`); check-in roster | ✅ Build |
| AI / automation | Vera: itinerary drafts, pre-arrival emails, FAQ co-host, RAG over the retreat info | ✅ Build |
| **Deep features** | ticketing · capacity/waitlist · **room-map/lodging** · **meal plans** · installment plans · check-in · **waivers/insurance** | ✅ core · room-map/meals ⏳ · waivers ⚠️ |

**The retreat money + lodging engine (our edge):** installment plans with auto-billing,
deposits with expiring holds, **room-map assignment** (capacity/gender/preference), meal plans
+ dietary tags, and **waiver/insurance gating** before check-in. **Blueprint:** modules =
`{site, ticketing, capacity, check-in, attendee-crm, comms}`; seed = a sample multi-tier
ticketed retreat. **Compliance:** PCI (hosted Stripe fields) ⚠️, **configurable tiered
refund/cancellation engine** ⚠️, **per-jurisdiction lodging tax** ⚠️, **ESIGN/UETA waivers**
⚠️, CAN-SPAM/TCPA.

---

### 2.9 Cross-role compliance gate summary

| Gate | Practitioner | Business | Organization | Coaching | Event Space |
|---|---|---|---|---|---|
| PCI (hosted Stripe fields) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| ESIGN/UETA digital waivers | ◦ | ⚠️ | ◦ | ◦ | ⚠️ |
| IRS receipt rules ($250/$75) | n/a | n/a | ⚠️ | n/a | n/a |
| Charitable solicitation reg. | n/a | n/a | ⚠️ | n/a | n/a |
| Lodging tax (per jurisdiction) | n/a | n/a | n/a | n/a | ⚠️ |
| CAN-SPAM / TCPA (email/SMS) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| GDPR/CCPA (personal data) | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| Recurring-billing dunning | ◦ | ⚠️ | ⚠️ | ⚠️ | ◦ |

`⚠️` = a gate that must be satisfied before that capability ships for that role. Gates are
enforced as **entitlement preconditions** (a role can't turn on donations until the receipt
generator is live), so the platform never exposes a non-compliant surface.

### 2.10 Adding a future role/vertical (extensibility)

A new role (e.g. `school`, `clinic`, `agency`) is **config + a blueprint**, never a refactor:

1. Add the `type` value to the `spaces.type` CHECK (expand-migration).
2. Author a `RoleBlueprint` descriptor (§2.2) and register it.
3. Register any role-specific deep-feature modules (a `Vertical` descriptor in
   `lib/verticals/registry.ts` - nav, admin modules, rail rules, capability resolver, all
   namespaced).
4. Seed the blueprint's default theme + sample content.
5. Add an entitlements default + any compliance-gate preconditions.
6. Add the role's onboarding wizard copy (CONTENT-VOICE).

No existing role changes. The registry composes the new descriptor; the resolver, shell, and
RLS are role-agnostic (they key on `space_id`, not on type).

---

## 3. Cross-cutting feature systems (shared platform)

Every space composes these shared subsystems; a role blueprint just selects and seeds them.
Build-vs-buy is called out per subsystem.

### 3.1 Spaces core

The `spaces` row is the tenant; `resolveSpaceForHost(host)` (`lib/spaces/store.ts`) is the
single entry point that resolves the active space (custom-domain match wins, else the root
space). `activeVerticalsForSpace()` joins the space to its enabled verticals. **Extend:** add
`visibility`, `plan`, `entitlements jsonb` columns (§4); the resolver puts `space_id` + `plan`
into the JWT (§5). **Build** (it's the tenancy primitive, already ~70% present).

### 3.2 Membership & roles (per-space many-to-many)

New `space_members(space_id, profile_id, role, status)` - `role ∈ {viewer, editor, moderator,
admin}`, independent per space. A person's role in space A is independent of space B. **Invites**
by email or shareable link; an owner can grant a colleague admin of *their* space without
making them a global staff member (the key isolation win). The capability resolver gains "admin
of the owning space," mirroring the existing `host → their circles` pattern and the
`stewardships` edge model. **Build.**

### 3.3 Templated provisioning + page/site builder

- **Copy-on-create.** On "create a space," deep-copy the versioned blueprint manifest into the
  space's own rows (landing block tree, default circle/event/practice/journey, theme preset);
  stamp `template_id`/`template_version` for analytics, never for rendering (P3).
- **JSON block model (Puck, MIT).** A page = ordered `content` array of `{ type, id, props }`;
  developers own the component catalog + field schemas; owners edit **typed fields only**, never
  code. Mirrors the existing `page_settings.layout jsonb` + `lib/widgets/modules.ts` module-set
  model - extend the layout scope cascade to `space → route → section → global`.
- **Token guardrails.** Editable = 3-5 curated palettes + a contrast-validated accent, logo,
  hero, copy, section order within an allowed set; locked = nav chrome, type scale, spacing,
  grid, kit components. No free hex (house rule + THEME.md).
- **≤7-step onboarding wizard** onto a **non-empty** space: type → name/handle → theme+logo →
  confirm seeded defaults → publish; defer domains/advanced settings to just-in-time. The
  seeded blueprint content *is* the time-to-value mechanism. Position between Skool (too locked)
  and Mighty (too flexible). **Build** (composes the existing page framework).

### 3.4 Theming / branding

Server-resolved CSS-variable tokens, no FOUC. The `themes` table holds named DAWN token
override sets (light/dark/feel) rendered as a scoped `<style>` selected by `data-skin`; the
space's `skin` + `brand_*` fields resolve server-side from the host, so server and client markup
match (zero flash, no blocking script). An owner-facing theme editor writes the space's skin
within the allowlist (`lib/theme/validate.ts isSafeSlug`, token allowlist). **Build** (theme
seam exists; add the editor + the per-space binding).

### 3.5 Custom domains

Wildcard subdomains (`<slug>.frequency.app`) now → programmatic custom domains
(`studio.com`) later. `spaces.domain` + `getSpaceByDomain()` resolve already; add the **ops
piece**: a `custom_domains` table (status, verification token, TLS state), automated TLS
issuance + domain verification via the host's Domains API, and one **primary** domain per space
with 301/canonical from the subdomain (SEO). **Build the binding; integrate** TLS/verification.

### 3.6 QR studio + splash/landing/site builder

`qr_codes` (slug, destination, `style jsonb`, analytics) + `qr_scans` (append-only) +
`nodes`/`captures` (verified check-ins) exist and are server-mediated. **Extend:** add
`space_id`; enforce a per-plan code cap (e.g. 5 on Pro); store a small splash `jsonb` document
per code (hero, headline, body, CTAs, brand) rendered at `/q/<slug>` (or
`<customdomain>/q/<slug>`) - the same constrained block builder as the space templates, reused.
Event Spaces point a code at a check-in `node` for verified attendee check-in for free.
**Build.**

### 3.7 CRM

Built on our Postgres + RLS - `contacts` (unified record, `lower(email)` unique, auto-linked to
`profile_id` on signup), `crm_deals`, `crm_stages` (reorderable), `crm_activities` (notes/calls/
emails/meetings/tasks). **Extend:** add `space_id` to deals/activities/contacts-scope (contacts
stay globally unique by email, but *deal/activity ownership* is per space); per-space pipeline
customization (stages/fields in space settings). Cheapest, highest-leverage suite because the
engine exists. **Build.**

### 3.8 Email / marketing / comms (buy the infra)

**Buy the sending infrastructure; build a thin orchestration layer.** Each space sends from its
**own authenticated domain with isolated reputation**.

- **Provider path:** **Resend** now (best DX, per-domain custom Return-Path built for
  multi-tenant, programmatic domain verification + webhooks, lean Broadcasts). The deliverability
  loop already exists: `email_events` (Resend webhook log) + `email_suppressions` (checked before
  every send). **At scale, migrate the marketing-send layer to Amazon SES "tenants"**
  (per-tenant reputation, auto-pause a degrading tenant). Mailgun subaccounts is the managed
  fallback. **Avoid** SendGrid (subuser ceiling), Customer.io/Loops (single-workspace) for
  per-space sending.
- **Per-space domain auth (non-negotiable onboarding):** DKIM + a custom aligned Return-Path so
  **DMARC aligns on both SPF and DKIM**. Default to a managed **shared IP pool**, not per-space
  dedicated IPs. Build to full bulk-sender compliance for every space regardless of volume:
  SPF+DKIM+DMARC, **RFC 8058 one-click unsubscribe**, <0.1% complaint target. ⚠️
- **Build on top:** audience builder over `contacts` (segments/tags), campaign composer (reuse
  the block/template pattern), schedule, `outreach_campaigns`/`outreach_sends` for status/opens/
  clicks; honor `contacts.consent_state`. Per-space suppression by default (unsubscribing from
  Studio A still hears from Studio B) + a platform-wide abuse layer + a per-space kill-switch.
- **SMS:** ⚠️ A2P 10DLC + TCPA; `sms_consent` exists. **Notifications:** consider **Knock** later
  for unified multi-channel transactional notifications (orchestrates *through* the ESP).
- **Compliance posture ⚠️:** the space is the "sender"/controller; Frequency is the
  "initiator"/processor - needs a tenant-facing AUP + anti-spam terms + Art. 28 DPA, each space's
  valid physical address, a per-space kill-switch. Counsel review flagged (CAN-SPAM initiator
  reach; whether Vera tips us into joint-controller).

### 3.9 Payments / monetization / payouts

**Stripe Connect per space/entity.** Subscriptions, packs, tickets, donations, installment
plans. `event_tickets` already moves money as a destination charge (platform fee +
transfer to the host's connected account); `financial_transactions` is the append-only,
entity-partitioned ledger; `profile_personas.stripe_account_id` binds a persona to a Connect
account. **Extend:** space-level Connect account binding; subscriptions + dunning; installment
plans + deposits/holds; donation forms + fee-coverage; a **take-rate buy-down** (fee decreases
as a space upgrades). **Integrate** (Stripe) + **Build** the orchestration + per-space earnings
dashboard. ⚠️ PCI (hosted fields only).

### 3.10 Events & booking engine

The events engine (`events`, `event_ticket_types`, `event_tickets`, `event_rsvps`,
recurrence, cohosts, event posts/media, check-in `nodes`) is the spine for sessions, classes,
tickets, capacity. **Extend** with `space_id` ownership, waitlist auto-fill, capacity tiers,
installment/deposit holds, room-map (Event Space). **Build.**

### 3.11 Scheduling

1:1 + group availability, buffers, time-zones, no-show policy, calendar sync (Google Calendar
MCP/API). New `bookings` + `availability` tables, `space_id`-scoped. **Build engine + Integrate**
calendar.

### 3.12 Analytics / insights

Per-space dashboards over the space's own rows (events, CRM, money, engagement) + the
`engagement_events` / `interaction_events` backbone. At-risk/churn intelligence is our edge
(Build, ⏳ model). Each space sees only its own data (RLS). **Build.**

### 3.13 Gamification integration (opting into the Quest economy)

A space opts in with `network_connected: true` + `entitlements.gamification`. Then: practices
logged in the space accrue Zaps to the member's one ledger; finishing a Journey mints a Pillar
Trophy (+75 Zaps); the space's content can enter the shared library and compete; members earn
shared points and trust. Accrual runs for everyone on the free tier; **cash-in** (spend Gems)
is the member's paid unlock (`canCashIn` in `lib/core/entitlement.ts`). A Private/White-Label
space can leave gamification off entirely. **Build** (the economy exists; wire the per-space
opt-in seam).

### 3.14 The AI layer (per-space Vera / co-host)

A per-space co-host (Vera, the one system voice) that helps **set up** (drafts bios, offerings,
itineraries, appeal letters) and **operate** (retention nudges, follow-ups, FAQ answering),
with **RAG over the space's own content** only (isolation: retrieval is `space_id`-scoped). All
generation reads the shared voice primer (`lib/ai/voice.ts`) so output obeys NAMING +
CONTENT-VOICE. Model-agnostic gateway, guardrails + evals (§5). **Build** (Vera exists;
add per-space scoping + the operator co-host surfaces). ⚠️ Counsel: joint-controller question.

### 3.15 Notifications (multi-channel)

In-app, email, push, SMS with per-space preferences. `notification_queue`,
`notification_preferences`, `push_subscriptions` exist; extend with `space_id` + per-space
preference scoping. Consider Knock later. **Build + integrate.**

### 3.16 Search / discovery (per-space + cross-network, incl. vector)

Per-space search over the space's own content (RLS-scoped) + cross-network discovery for
`visibility: network` spaces only. Vector search via **pgvector** (embeddings tables already
exist: `event_embeddings`, `room_message_embeddings`, `help_chunks`). Discovery respects the
visibility flag - a Private/White-Label space never appears. **Build.**

### 3.17 Mobile

**PWA now** (the shared Frequency PWA serves Networked + Private spaces). **Native white-label
later** (⏳, done-for-you top tier - every competitor reserves this for premium). Don't promise
self-serve native apps early.

---

## 4. Complete data model

> **As-built note (2026-06): design names vs shipped names.** The tables below are the design
> plan; several shipped under different names or were deliberately not created. The shipped schema
> is the source of truth ([DATABASE.md](DATABASE.md) "Entity Spaces", ADR-320 to ADR-337). The
> deltas:
>
> | This doc (design) | Shipped as | Note |
> |---|---|---|
> | `bookings` / `availability` (§4.7) | `space_bookings` / `space_availability` | Practitioner 1:1 booking v1 (ADR-325); service-role, double-book guard, pure DST-aware slots. |
> | `subscriptions` (§4.7, member-of-space billing) | `space_membership_tiers` / `space_memberships` | Business memberships v1 (ADR-327); tiers + join with **no billing** (Stripe deferred to Phase 4). |
> | `sender_domains` (§4.6) | **not created** | Deliberately deferred in Phase 3 (ADR-335): Spaces share the verified Resend `send.` subdomain; a per-Space DKIM domain is counsel/cost gated. |
>
> Other Phase 2/3 tables shipped close to plan (`client_notes`, `outreach_sends`) or as additive
> nullable `space_id` on existing tables (`qr_codes`+`splash`, `crm_*`, `nodes`/`captures`,
> `campaigns`, `email_suppressions`); `ai_usage` also gained a nullable `space_id` (ADR-330 follow-up).

### 4.1 Isolation model (the foundation)

- **Shared-schema + `space_id` + RLS.** Every space-private row carries `space_id` (or
  `owner_entity_id` for money). RLS is the security backstop; queries also filter `space_id`
  (defense-in-depth + speed). This is the right call for a *connected network* - schema-per-tenant
  or db-per-tenant would break the network effect and explode ops.
- **JWT claims.** A Supabase Custom Access Token hook carries the active `space_id` + `plan` so
  RLS reads them cheaply (no per-row subquery to resolve the space).
- **Supabase RLS performance rules (mandatory):** index `space_id` as the **leading column** of
  composite indexes; wrap every auth/tenant function in `(select …)` so it runs once, not
  per-row; scope policies `TO authenticated`. (Supabase benchmarks: 171ms→<0.1ms; up to
  178,000ms→12ms.)
- **Tenant-scope every cache key** (CDN, Redis, Next.js data cache); mark space-private pages
  `no-store`. Audit every `service_role`/`SECURITY DEFINER` path - that's where leaks hide.

### 4.2 Spaces & tenancy

| Table | Status | Key columns | Tenancy | Used by |
|---|---|---|---|---|
| `spaces` | ✅ extend | `id, slug, name, type, status, entity_id, skin, domain, network_connected, enabled_verticals[], owner_profile_id, brand_name/logo/accent` **+ new:** `visibility ('network'|'private')`, `plan text`, `entitlements jsonb` | self | all modes/roles |
| `space_members` | 🔴 new | `space_id, profile_id, role ('viewer'|'editor'|'moderator'|'admin'), status, invited_by, created_at`; unique `(space_id, profile_id)` | `space_id` | all (Private/WL especially) |
| `space_invites` | 🔴 new | `space_id, email, role, token, expires_at, accepted_at` | `space_id` | all |
| `entities` | ✅ | `id, key ('foundation'|'labs'), name, kind` | global ref | all (money partition) |
| `custom_domains` | 🔴 new | `space_id, hostname, is_primary, verification_token, verified_at, tls_status` | `space_id` | Private/WL |
| `space_subscriptions` | 🔴 new | `space_id, plan, stripe_subscription_id, status, current_period_end` | `space_id` | space-level billing |

### 4.3 Ownership FKs on core objects (the "glue" backfill)

| Table | Status | Change | Tenancy |
|---|---|---|---|
| `circles` | ✅ extend | add `space_id` (backfill → root space); keep `host_id` for authorship | `space_id` |
| `events` | ✅ extend | add `space_id` (backfill → root); keep `host_id` | `space_id` |
| `practices` | ✅ extend | add `space_id` (backfill → root); keep `created_by` | `space_id` |
| `journeys`/`journey_plans` | ✅ extend | add `space_id` (backfill → root); keep `created_by` | `space_id` |
| `programs` | ✅ extend | add `space_id` | `space_id` |

Keep `created_by`/`host_id` for authorship/audit; `space_id` is the **tenancy** axis. Backfill
existing rows to the seeded root space (the root owns all pre-existing single-tenant data).

### 4.4 CRM (space-scoped)

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `contacts` | ✅ extend | `email (lower unique), profile_id, consent_state, engagement_score, source, meta` **+** `space_id` scope (contact globally unique by email; *ownership* per space) | `space_id` |
| `crm_stages` | ✅ extend | add `space_id` (per-space pipeline) | `space_id` |
| `crm_deals` | ✅ extend | add `space_id` | `space_id` |
| `crm_activities` | ✅ extend | add `space_id` (or inherit via deal) | `space_id` |
| `client_notes` | 🔴 new | `space_id, contact_id, author_profile_id, body, created_at` (private per-practitioner) ⚠️ | `space_id` |

### 4.5 QR studio + splash

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `qr_codes` | ✅ extend | `slug, title, destination_type ('url'|'node'), target_url, node_id, style jsonb, active, valid_from/until, scan_count` **+** `space_id`, `splash jsonb` | `space_id` |
| `qr_scans` | ✅ | append-only `qr_code_id, profile_id, scanned_at` (+ geo/medium migrations) | via code |
| `nodes` / `captures` | ✅ | verified check-ins (zaps-earning) | reuse for Event Space check-in |

### 4.6 Outreach / campaigns

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `campaigns` | ✅ extend | `subject, body, segment, status, recipient_count` **+** `space_id` | `space_id` |
| `outreach_sends` | 🔴 new | `space_id, campaign_id, contact_id, status, opened_at, clicked_at, unsubscribed_at` | `space_id` |
| `sender_domains` | 🔴 new | `space_id, domain, dkim_status, spf_status, dmarc_status, return_path, verified_at` | `space_id` |
| `email_events` | ✅ | Resend webhook log `email, event_type, provider_id, payload` | scoped via send |
| `email_suppressions` | ✅ extend | `email, reason` **+** per-space suppression scope (Studio A ≠ Studio B) | `space_id` |
| `sms_consent` | ✅ extend | add `space_id` ⚠️ TCPA | `space_id` |

### 4.7 Commerce / bookings / tickets / orders

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `event_tickets` | ✅ extend | `event_id, buyer_profile_id, qty, amount_cents, platform_fee_cents, status, stripe_*` **+** `space_id` (has `entity_id`) | `space_id`/`entity_id` |
| `event_ticket_types` | ✅ extend | tiered ticket definitions; add `space_id` | `space_id` |
| `bookings` | 🔴 new | `space_id, provider_profile_id, client_contact_id, starts_at, ends_at, status, package_id` | `space_id` |
| `availability` | 🔴 new | `space_id, provider_profile_id, rule jsonb (slots/buffers/tz)` | `space_id` |
| `packages` | 🔴 new | `space_id, name, sessions, price_cents, expiry` | `space_id` |
| `orders` | 🔴 new | `space_id, buyer_profile_id, total_cents, status, stripe_payment_intent_id` | `space_id` |
| `subscriptions` | 🔴 new | `space_id, member_profile_id, plan, stripe_subscription_id, status` (member-of-space billing) | `space_id` |
| `installment_plans` | 🔴 new | `space_id, order_id, schedule jsonb, next_charge_at, status` ⚠️ | `space_id` |

### 4.8 Donations / receipts (Organization)

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `donations` | 🔴 new | `space_id, donor_contact_id, amount_cents, recurring, fee_covered, fund, stripe_*` | `space_id` |
| `donation_receipts` | 🔴 new | `space_id, donation_id, deductible_cents, fmv_cents, receipt_no, issued_at` ⚠️ IRS $250/$75 | `space_id` |
| `volunteers` | 🔴 new | `space_id, contact_id, shifts jsonb, hours` | `space_id` |

### 4.9 Money ledger / payouts

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `financial_transactions` | ✅ extend | append-only `entity_id, revenue_type, amount_cents, stripe_account_id, source_table/id, idempotency_key` **+** `space_id` for per-space rollups | `entity_id` + `space_id` |
| `payouts` | 🔴 new | `space_id, stripe_account_id, amount_cents, status, arrival_date` | `space_id` |

### 4.10 Theming / branding / page layout

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `themes` | ✅ | `slug, name, kind ('skin'|'occasion'), tokens jsonb (light/dark/feel), status, is_default, window_*` | global; space binds via `skin` |
| `page_settings` | ✅ extend | `route PK, seo_*, og_image_url, status, visibility_role, layout jsonb` **→ re-key to** `(space_id, route)` so each space tunes its own pages | `space_id` |
| `space_pages` | 🔴 new (optional) | `space_id, slug, block_tree jsonb (Puck content[]), template_id, template_version, published` | `space_id` |

### 4.11 Roles / personas / stewardship / audit

| Table | Status | Key columns | Tenancy |
|---|---|---|---|
| `profile_personas` | ✅ | `profile_id, persona ('collaborator'|'practitioner'|'business'|'organization'), state, stripe_account_id, entity_id` | profile |
| `stewardships` | ✅ | scoped edge `(profile_id, role, scope_type, scope_id, state)` (community trust) | scope |
| `space_audit_log` | 🔴 new | `space_id, actor_profile_id, action, target_table, target_id, meta jsonb, at` | `space_id` |
| `admin_audit_log` | ✅ | platform-level audit | global |

### 4.12 The expand/contract migration approach (backfill `space_id` with no downtime)

The "add `space_id` everywhere" migration is the riskiest step. Do it as **Phase 0**, behind
tests, before any feature work, using **expand → migrate → contract**:

1. **Expand (additive, nullable).** `ALTER TABLE … ADD COLUMN space_id uuid REFERENCES spaces(id)`
   - nullable, no default scan. Index it as the leading column of new composite indexes.
2. **Dual-write.** App writes `space_id` on every new/updated row (default = the resolved space,
   root for existing single-tenant flows). Reads still tolerate NULL.
3. **Backfill in batches.** Backfill existing rows → the root space `id` in chunks (avoid a
   table-rewrite lock). Verify counts (`SELECT space_id, count(*) … GROUP BY 1`).
4. **Add RLS + enforce.** Add the `space_id` RLS policy (`TO authenticated`, `(select …)`-wrapped
   tenant function). Add a contract test per space-scoped action (cross-tenant leak test).
5. **Contract.** Once backfilled + dual-writing, set `NOT NULL` and add the final composite
   indexes. Keep `created_by`/`host_id` (authorship), drop nothing.

Each step is independently deployable and reversible; APIs stay backward-compatible throughout
(P4). House style: additive + idempotent migrations, RLS on, applied via the documented apply
path (WORKFLOW.md), `lib/database.types.ts` regenerated after.

---

## 5. Architecture and tech stack

### 5.1 Multi-tenant architecture

- **One deployment.** Hostname → space resolution at the edge: the proxy/middleware reads the
  request host and `resolveSpaceForHost(host)` returns the active space (custom-domain match
  wins, else root). The shell renders that space's skin/brand server-side (no FOUC). `proxy.ts`
  already exposes `x-pathname`/`x-search` to server components; add `x-space-id`/host resolution
  alongside.
- **Tenant-scoped cache keys.** Every CDN/Redis/Next.js data-cache key includes `space_id`;
  space-private pages are `no-store`. A cache key that omits the space is the classic invisible
  cross-tenant leak.

### 5.2 Identity

Many-to-many from day one: one `profiles` row per human; `space_members` gives a role per
space. Passkeys-ready (Supabase Auth). Active `space_id` + `plan` ride the JWT (Custom Access
Token hook) so RLS reads them cheaply. Never retrofit identity later - it's the one thing the
research says you must model M:N up front.

### 5.3 Theming, domains, email, payments, search

| Concern | Approach | Build vs buy |
|---|---|---|
| Theming | Server-resolved CSS-variable tokens from `themes` + space `skin`/`brand_*`, inline `<style>`, no flash | Build |
| Domains | Wildcard subdomains → programmatic custom domains; TLS + verification via host Domains API | Build binding · Integrate TLS |
| Email | Resend now → Amazon SES tenants at scale; per-space DKIM/SPF/DMARC + aligned Return-Path; shared IP pool | Buy infra · Build orchestration |
| Payments | Stripe Connect per space/entity; destination charges; subscriptions; installments; take-rate buy-down | Integrate Stripe · Build orchestration |
| Search + vector | Per-space RLS-scoped search + cross-network discovery (visibility-gated); pgvector embeddings | Build |

### 5.4 The AI gateway

Model-agnostic gateway, RAG over the space's own content (`space_id`-scoped retrieval),
guardrails + evals, shared voice primer (`lib/ai/voice.ts`). Per-space Vera co-host for setup +
operation. Embeddings in pgvector. ⚠️ joint-controller counsel question.

### 5.5 Real-time, background jobs, durable workflows

- **Real-time:** Supabase Realtime, channel names tenant-scoped (`space:<id>:…`).
- **Background jobs / durable workflows:** the existing queue tables (`notification_queue`,
  `nurture_*`, `automation_rules`) + a durable-workflow runner for installment billing, dunning,
  domain verification polling, send batching. Idempotency keys on every money/send job
  (`financial_transactions.idempotency_key` is the pattern).
- **Observability:** structured logs, per-space metrics, deliverability dashboards
  (`email_events`), audit logs.

### 5.6 Testing (the safety net)

- **RLS/authz contract tests** per space-scoped action - assert a caller in space A can never
  read/write space B's rows.
- **Cross-tenant leak tests** on every `service_role`/`SECURITY DEFINER` path and every cache
  key.
- **Migration tests** for expand/contract steps (backfill correctness, NOT NULL enforcement).
- "Correctness of isolation is non-negotiable" - these tests gate every space-scoped PR.

### 5.7 Forward architecture & emerging-tech bets

From a June 2026 trends pass (identity, AI-native UX, agentic web/commerce, regulation, infra). Standards in flux are flagged; vendor adoption figures are directional. Structure: **Adopt now (low-regret, durable) · Prepare (build the seam, do not commit) · Ignore (watch only).**

**What Frequency already has vs the gaps** (so the bets are concrete, not abstract): already in the stack are **pgvector**, **Stripe Connect**, **Resend**, **Upstash Redis**, the **Puck** visual editor, a **`public/llms.txt`**, **Next.js 16 / React 19**, **Supabase RLS**, and **Vera as a tool-using agent with a tool registry** (RAG already powers help/search). The gaps the bets below fill: **no MCP server**, AI is **hard-coupled to the Anthropic SDK** (no model-agnostic gateway), **no passkeys / SAML SSO**, no eval harness in CI, no consent-as-a-service, no per-space sender-domain email, no durable-workflow layer, and no Schema.org markup.

#### ✅ Adopt now (the durable, low-regret layer)
| Bet | Why now / Frequency fit |
|---|---|
| **Model-agnostic AI gateway** (Vercel AI Gateway: zero markup, OpenAI-compatible exit) | Highest-leverage, lowest-risk move. Vera is currently hard-coupled to the Anthropic SDK; route every model call through a gateway so provider = a config string. Price/quality leadership rotates quarterly. |
| **Small-model routing** through the gateway | Send blurbs/classification/tagging to a distilled model, reserve frontier models for Vera's reasoning. 10-30x cost lever. |
| **Eval-driven dev + AI observability** (Langfuse self-host on Supabase, or Braintrust) | Wire into CI; gate Vera/blurb deploys on eval scores before the surface grows. |
| **pgvector + RLS "filter-before-retrieval" isolation** | Our RLS is a genuine moat: RLS on the `embeddings` table keyed to `space_id` gives database-enforced per-tenant retrieval isolation that most platforms bolt on imperfectly. Agentic RAG = hybrid (pgvector dense + Postgres FTS/BM25) → rerank → small-to-big chunking. |
| **Read-first, tenant-scoped MCP server** (one server, not one-per-space; Vercel `mcp-handler`, OAuth 2.1 + PKCE, StreamableHTTP transport, RLS as the confused-deputy backstop) | Vera's existing tool registry is most of the work. MCP is now Linux-Foundation-governed (Anthropic + OpenAI + Google). Read tools first; writes later with human-in-the-loop. This IS the "agent API" - do not also build a bespoke one. |
| **Schema.org / JSON-LD** on public space/practitioner/event pages | What agents and AI answers actually read. (Skip `llms.txt` beyond the existing stub - Google rejects it, ~97% never read.) |
| **Passkeys** (Supabase beta, as an added factor) + **SAML SSO** for white-label tenants (RLS keyed to the org/`sso_provider_id` claim) | Passkeys are mainstream (portability objection dissolved by CXP/CXF, 2025); SSO is the correct white-label B2B identity primitive. Keep email/OAuth primary until Supabase passkeys go GA; design recovery deliberately. |
| **Durable async: Supabase Queues (pgmq) + pg_cron** in-stack; **Inngest** for multi-step AI/payment/onboarding workflows | The safe, boring, correct layer for emails, Stripe-webhook → provisioning, embedding jobs, digests. Skip Temporal (needs persistent workers). |
| **Postgres-native search** (`tsvector` now → `pg_search` BM25 hybrid + RRF later) + **Supabase Realtime** | Avoid standing up Elasticsearch; Supabase Realtime covers gamified/live UX. (Confirm `pg_search` availability on our Supabase tier.) |
| **Regional compute co-located with Supabase** (Vercel Fluid Compute) | "Everything at the edge" is officially dead (Vercel reverted edge rendering to regional Node). Reserve edge Middleware for the cheap stateless work we already do there: host→space routing. |
| **Cache Components / `use cache`** page-by-page | Ideal for branded space pages (static shell + dynamic personalized rails behind Suspense) - exactly our PAGE-FRAMEWORK §5 model. Adopt incrementally, not as a blanket migration. |
| **Consent-as-a-platform-service** + **EU data-residency path** (Supabase EU project/read replicas) | Both are sellable white-label features AND compliance necessities: a German practitioner will demand "where does my members' data live, who can subpoena it." Tenant = controller; per-tenant consent records + Consent Mode v2. |
| **Bounded generative UI** (AI selects from our vetted component catalog, AI SDK UI not the paused RSC path) | Brand-safe + accessible. Evolve **Vera from "generates" → "operates the space"** (configure, moderate, run engagement loops) - competitively urgent: Mighty + Circle already ship the "AI co-host." |
| **Art. 50 AI transparency** (disclose Vera + all AI-generated copy as AI) | The one EU AI-Act date that hits us and was NOT deferred: **2 Aug 2026**. (Synthetic-media watermarking by Dec 2026.) |

#### ⏳ Prepare (build the seam, do not commit)
| Bet | Seam to keep clean |
|---|---|
| **Write/action MCP tools + agentic checkout** (Stripe ACP-over-Connect) | Keep checkout server-authoritative + idempotent and merchant-of-record on the connected account, so an agent path reuses it. Wait for Stripe to GA ACP-on-Connect, then flip a switch. |
| **Agent/AI identity hardening** (OAuth 2.1 + per-agent scoped, short-lived, auditable tokens) | The threat is live the moment Vera touches user data/external APIs; the clean standards (IETF OBO, Okta XAA, IPSIE) are 6-12+ months out. Don't block on them. |
| **Portable-identity anchor** | Give each member a durable internal anchor (a stable user key/"DID-like") that survives space moves; borrow AT Protocol's mental model, not its stack. Reputation portability is a data-model problem we own. |
| **pgvectorscale / dedicated vector DB** | Only when a tenant cluster nears ~5-10M vectors. Pre-validate the migration; don't wait for a fire. |
| **Realtime voice** (Vera voice / live coaching rooms) | Production-ready APIs exist; add as a practitioner/coaching-tier feature behind the gateway. |
| **Local-first sync** (Zero / ElectricSQL) | Prototype on ONE bounded surface (presence/activity in a single space) behind a flag. Unsolved: mapping their permission models onto Supabase RLS for multi-tenancy - the gating risk. |
| **Event-driven backbone** (CDC → Redpanda) + **A2A** | Keep event names/schemas stable now (transactional outbox table) so Debezium CDC can front Postgres later without rewriting producers. A2A only if spaces become delegating agents (~12 months). |
| **Native white-label apps** + **mDL / ID verification** | Done-for-you premium tier (every incumbent gates it to the top). mDL only if wellness regulation forces age/ID checks - integrate a vendor, don't build the standard. |

#### 🔴 Ignore as hype (for our profile, now)
In-agent "buy in chat" native checkout (OpenAI **pulled** Instant Checkout Mar 2026 - stay Stripe-native) · `llms.txt` beyond a stub · free-form generative UI ("AI renders the whole interface") · edge databases / `runtime='edge'` for data paths · Temporal / self-managed Kafka / LiveStore as a backbone · issuing our own **DIDs / Verifiable Credentials** or building to the **EUDI wallet** (consume later, never build now) · adopting **AT Protocol** wholesale · the EU AI-Act **high-risk conformity machinery** (we're a deployer/light provider; deadlines moved to 2027-2028) · "cookiepocalypse" / Privacy Sandbox migration (both dead) · picking an **agentic-payment standard winner** (ACP vs UCP vs AP2 - let Stripe absorb the churn) · the **$4.6T "services-as-software"** TAM as a roadmap driver (build the capability; the moat is our proprietary consented network data, not the model).

---

## 6. Execution path and expand-without-breaking

### 6.1 Phased roadmap

| Phase | Outcome | Key work | Status |
|---|---|---|---|
| **0 - Foundation** | Spaces can *own* things | `space_id` FKs on circles/events/practices/journeys (+ backfill to root); `space_members`; `visibility`/`plan`/`entitlements` columns; extend capability resolver; **RLS + contract tests** | ⏳ |
| **1 - Spaces operate** | One role end-to-end (**Practitioner**) | provisioning wizard + blueprint; `/spaces/<slug>` + admin; circles/events under a space; per-space layout override; bookings + packages | ⏳ |
| **2 - Reach & convert** | QR + CRM per space | `space_id` on `qr_codes` (+ cap) + splash builder; `space_id` on CRM; per-space pipeline | ⏳ |
| **3 - Communicate** | Email marketing | Resend integration, per-space sender domains (DKIM/SPF/DMARC), audience/campaign UI, `outreach_*`, consent/compliance | ⏳ ⚠️ |
| **4 - Earn** | Money per space | per-space earnings dashboard; Stripe Connect payouts; subscriptions/installments; tax helpers (1099 / Form 990 nudges, IRS receipts) | ⏳ ⚠️ |
| **5 - White-label+** | Self-serve branded web | theme editor, remove-branding tier, branded email, automated custom-domain TLS; website builder; `visibility: private` | ⏳ |
| **6 - Premium** | Native apps (done-for-you) | branded app program as a top tier - only after 1-5 are proven | 🅿️ |

Roles roll out one at a time on Phase 0-1: Practitioner → Business → Coaching → Event Space →
Organization, each adding its blueprint + the one or two deep features it needs.

### 6.2 How to expand safely (the mechanisms)

| Mechanism | Guarantee |
|---|---|
| **Entitlements / feature flags** | Every new capability is one `entitlements` key; off by default; no schema change to gate it |
| **Expand/contract migrations** | Additive → dual-write → backfill → enforce; each step deployable + reversible; no downtime |
| **Backward-compatible APIs** | Server actions keep their signatures; new fields are optional; old clients keep working |
| **Role-blueprint pattern** | New verticals are a descriptor + config, never a core edit (§2.2, §2.10) |
| **RLS + contract tests** | Isolation correctness is gated by tests on every space-scoped PR |
| **Canary / staged rollout** | New capability ships to a canary space first, then a cohort, then GA |
| **Correctness > sophistication** | Ship the isolation spine + prove it before layering deep features |

### 6.3 Checklist: add a new role/vertical

1. ☐ Add the `type` value to `spaces.type` CHECK (expand-migration).
2. ☐ Author the `RoleBlueprint` descriptor (modules, theme, seed, entitlements, gates, wizard).
3. ☐ Register any deep-feature modules as a `Vertical` descriptor (namespaced caps/nav/admin/rail).
4. ☐ Seed the default theme + sample content (copy-on-create).
5. ☐ Set entitlement defaults + compliance-gate preconditions.
6. ☐ Write the onboarding wizard copy (CONTENT-VOICE §10 checklist).
7. ☐ Add RLS + contract tests for any new role-specific tables.
8. ☐ Verify no existing role's behavior changed (resolver/shell are type-agnostic).

### 6.4 Checklist: add a new shared feature

1. ☐ Add the table(s) with `space_id` + RLS (`TO authenticated`, `(select …)`-wrapped, leading-column index).
2. ☐ Gate it behind a new `entitlements` key (off by default).
3. ☐ Wire it into the relevant blueprint(s) as a default module + seed.
4. ☐ Tenant-scope every cache key + new query.
5. ☐ Add the capability to the access matrix / per-space resolver (no new global staff power).
6. ☐ Add contract tests (cross-tenant leak) + a kill-switch if it sends/charges.
7. ☐ Member/operator copy through NAMING + CONTENT-VOICE; AI paths read `lib/ai/voice.ts`.
8. ☐ Compose the UI from `@/components/templates` (PAGE-FRAMEWORK); register the rail in `lib/layout/page-chrome.ts`.

---

## 7. Open decisions and recommended sequencing

### 7.1 Decisions the owner must make

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Event Space type:** dedicated `event_space` or reuse `organization`? | **Dedicated `event_space`** - blueprint, modules, pricing, lodging tax differ cleanly. One expand-migration. |
| 2 | **First role end-to-end:** Practitioner, Business, or Event Space? | **Practitioner** - smallest surface, clearest value, cleanest isolation slice. Template outward from it. |
| 3 | **`visibility` as a first-class column?** | **Yes** - it's what cleanly separates Networked from Private without overloading `network_connected`. |
| 4 | **Email provider now:** standardize on Resend? | **Yes** (→ Amazon SES tenants at scale). Per-space DKIM/SPF/DMARC from day one. |
| 5 | **Entitlements home:** `spaces.entitlements jsonb` + `plan`, or a `space_subscriptions` table? | **Both** - jsonb for fast resolver reads (the feature gates), a row for billing state. |
| 6 | **Pricing posture:** web white-label mid-tier, native app premium, CRM/email add-on, low take-rate buy-down? | **Confirm** before detailing tiers (numbers need live-page re-verification per the PLAN appendix). |
| 7 | **Counsel review (⚠️):** CAN-SPAM "initiator" reach; whether Vera tips Frequency into GDPR joint-controller. | **Get counsel** before white-label email + AI features ship. |
| 8 | **Hook:** federate (contract) vs harvest modules into native? | Hook is the **federated** prototype of `coaching`; harvest email/website-builder modules only if more mature (needs the code read per PLAN §10). |

### 7.2 Recommended first move

**Start Practitioner, end-to-end, on Networked mode, then template outward.**

1. **Phase 0** - land the isolation spine: `space_id` FKs + backfill to root, `space_members`,
   the new `spaces` columns (`visibility`/`plan`/`entitlements`), the capability-resolver
   extension, and the RLS + contract tests. Nothing member-facing; everything reversible.
2. **Phase 1** - ship the Practitioner blueprint + provisioning wizard + `/spaces/<slug>` +
   per-space admin + bookings/packages. One role, fully working, in Networked mode.
3. **Template outward** - extract the blueprint pattern, then add Business, Coaching, Event
   Space, Organization one at a time, each as a descriptor + its one or two deep features.

This proves the moat (connected, gamified, cross-space identity) on the smallest surface,
establishes the isolation safety net everything else rides on, and makes every later role
additive rather than a rebuild.

---

### Appendix: grounding (real code/tables this spec maps onto)

| Concept | Where it lives today |
|---|---|
| Spaces tenancy | `lib/spaces/{types,store,index}.ts`, `20260619000000_spaces_tenancy.sql`, `20260626000000_space_brand.sql` |
| Resolution | `resolveSpaceForHost()` / `getSpaceByDomain()` (`lib/spaces/store.ts`), `proxy.ts` |
| Access matrix / roles | `lib/core/access-matrix.ts`, `lib/core/roles.ts`, `lib/core/entitlement.ts`, `stewardships` |
| Personas / money | `profile_personas`, `entities` + `financial_transactions`, `event_tickets`, `event_ticket_types` |
| CRM | `contacts`, `crm_stages`/`crm_deals`/`crm_activities`, `team_members` |
| QR + check-in | `qr_codes`, `qr_scans`, `nodes`/`captures` |
| Email | `email_events`, `email_suppressions`, `campaigns`, `sms_consent` |
| Theming / pages | `themes`, `page_settings`, `lib/widgets/modules.ts`, `@/components/templates`, `lib/layout/page-chrome.ts` |
| Verticals / expansion | `lib/verticals/registry.ts`, `docs/EXPANSION-FRAMEWORK.md`, `docs/SPACES.md` |
| Federation escape hatch | `docs/HOOK-FEDERATION-ARCHITECTURE.md` |

> **Confidence:** high on the architecture (it maps onto code that exists today - tenancy,
> theming, money partition, CRM, QR, page framework, the access matrix); medium on exact
> pricing/take-rate numbers (re-verify per the PLAN appendix) and on the two counsel-flagged
> compliance questions. Mode names, the three-mode flag map, the role blueprint contract, and
> the expand/contract migration approach are recommendations for owner sign-off.
