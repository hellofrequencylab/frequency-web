# CRM Strategy: My Contacts (free) → Spaces CRM (paid)

> **Status:** ✅ P1 shipped (the free keep-in-touch foundation); P2/P3 designed, not built.
> Strategy + foundation plan for turning **My Contacts**
> (`/network/contacts`) into a lightweight, in-person relationship CRM that doubles as the
> **lead generator** for the full CRM that paid **Spaces** (business / practitioner / org
> accounts) run. Decision: [ADR-361](DECISIONS.md). Owner-approved direction (2026-06-23):
> strategy-first, **one-way + met-context** QR capture, **freemium barbell** as proposed.
>
> **Source of truth (code):** `lib/connections/*`, `app/(main)/network/contacts/`,
> `app/(main)/connections/*`, `lib/crm/*`, `lib/spaces/*`, `lib/core/access-matrix.ts`,
> `supabase/migrations/*network_contact*`, `*crm_pipeline*`, `*spaces*`.
> **Sibling docs:** [NETWORK-CRM.md](NETWORK-CRM.md) (the capture tool) ·
> [CONNECTION-LAYER.md](CONNECTION-LAYER.md) (the people graph) ·
> [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) (the operator comms/CRM spine) ·
> [SPACES.md](SPACES.md) (tenancy) · [ROLES.md](ROLES.md) + access matrix (gating).

## TL;DR

1. **We already own both ends.** A private personal contact book (`network_contacts`, with
   notes + tags) *and* a full operator pipeline (`crm_deals` / `crm_stages` / `crm_activities`,
   ADR-102) both ship today. We are missing the **middle**: the keep-in-touch layer that makes
   the personal book sticky, the **in-person QR capture**, and the **graduation seam** from
   personal → Space CRM.
2. **The play is a freemium barbell.** Give away a delightful *relationship keeper* (capture +
   tags + notes + follow-up reminders + a daily "reach out" list); charge for the *operating
   system* (pipelines, automation, team sharing, email/calendar sync, reporting) that a Space runs.
3. **The free tier is the funnel.** Its job is to manufacture the "I've outgrown this" moment —
   a second pipeline, a teammate, an automation you wish fired itself. That bump routes a member
   to upgrade into a Space.

## 1. What already exists (so we extend, not rebuild)

| Layer | Status | Where |
|---|---|---|
| Personal contact book — `network_contacts` (+ `network_contact_notes`, `network_contact_tags`) | ✅ Shipped | [NETWORK-CRM.md](NETWORK-CRM.md), `lib/connections/*`, `app/(main)/network/contacts/` |
| Card-scan AI harvest (Sonnet vision OCR → fields + note + tags) | ✅ Shipped | `lib/ai/connections-ai.ts` |
| Member match / merge (`linked_profile_id`), shared-CRM bridge (`linked_contact_id`) | ✅ Shipped | `lib/connections/matching.ts`, `crm-sync.ts` |
| Operator pipeline — deals, stages, activities, due-dated tasks | ✅ Built (ADR-102) | `lib/crm/pipeline.ts`, `/admin/crm` |
| Unified shared contact — `contacts` (consent, engagement, `space_id`) | ✅ Built (ADR-027) | `lib/studio/contacts.ts`, `lib/crm/person.ts` |
| Spaces tenancy + per-space CRM scope, `businessCrm` access surface | ✅ Shipped | [SPACES.md](SPACES.md), `lib/core/access-matrix.ts` |
| People graph — resonance, near-miss, "this week" pulse | ✅ Shipped | [CONNECTION-LAYER.md](CONNECTION-LAYER.md) |
| **Keep-in-touch layer** — reminders, last-contacted, "reach out today" | ✅ Shipped (P1) | this doc, P1 · `network_contact_reminders`, `last_contacted_at` |
| **In-person QR capture** — scan a member's QR → a contact | 🔴 Missing | this doc, P2 |
| **Graduation** — personal → Space CRM upgrade path | 🔴 Missing | this doc, P3 |

## 2. The freemium barbell (the free/paid line)

Synthesized from the category (Dex, Clay/Folk, HiHello, HubSpot free→paid, Pipedrive, Attio):
**give away the relationship-keeper, charge for the operating system.**

| | **FREE — "My Contacts"** (hook + lead-gen) | **PAID — Spaces CRM** (the killer system) |
|---|---|---|
| Audience | every member | Practitioner / Business / Org Spaces |
| Capture | card scan + **in-person QR** + manual | + import + lead-capture forms (RSVP, web) |
| Organize | tags, notes, sorting | + custom fields, saved segments |
| Relationship | **follow-up reminders + "reach out today" + last-contacted** | + **automation / sequences** (auto follow-up, rebooking, "dormant 30d" nudge) |
| Pipeline | — (single lifecycle status) | **multiple pipelines + per-segment stage templates** |
| Scale | private, single owner | **team sharing + roles**, email/calendar sync, reporting, branding removal |

**Why this line.** The free features (capture, notes, reminders, the daily reach-out list) are
the ones that build a *daily habit* and reliance — the "aha" that earns trust. The paid features
(pipelines, automation, collaboration) are the ones a person needs the moment they start running
this as a *practice or business* — i.e. exactly when a Space is the right home. The single most
important free feature is the **daily "people to reach out to" list**: it is the defining feature
of every personal CRM and the reason the free tier is sticky enough to catch a business owner's eye.

## 3. My Contacts, repositioned: the in-person / local book

My Contacts becomes the home for **people you meet in real life** — scanned from a card or poster,
or captured by scanning their Frequency QR in person. Private by default; promotion into the wider
network stays the deliberate, consent-gated act it already is (ADR-099/132).

### 3.1 Tabs

`All · Card · QR Scan · New · Active · Archived`

These are **two facets** sharing one filter row — *how it arrived* and *where it sits in your
lifecycle* — which is fine, but worth naming so the UI reads as a smart-filter row, not a single
exclusive tab set:

| Tab | Filter | Notes |
|---|---|---|
| **All** | everything | default |
| **Card** | `source in (card_scan, poster)` | physical card / poster scans |
| **QR Scan** | `source = 'qr_scan'` | **new** — in-person QR captures (§4) |
| **New** | `status = 'new'` | needs triage / first follow-up |
| **Active** | `status = 'active'` | in a relationship rhythm |
| **Archived** | `status = 'archived'` | parked |

`source` already exists (`manual / card_scan / poster / import`); ✅ **P1 added `'qr_scan'`**
to the CHECK constraint, and the My Contacts facet tabs (`All · Card · QR Scan · New · Active ·
Archived`) now read it. The QR *capture* itself lands in P2.

### 3.2 The lightweight CRM layer (free)

| Feature | State | Plan |
|---|---|---|
| Tags | ✅ exists (`network_contact_tags`) | surface as filter chips + sort |
| Notes | ✅ exists (`network_contact_notes`) | already on the detail page |
| Sorting | ✅ Shipped (P1) | by recently added · last contacted · follow-up due · name |
| **Follow-up reminders** | ✅ Shipped (P1) | `network_contact_reminders` (owner, contact, `due_at`, note, `done_at`); add/complete/delete on the detail page |
| **Last-contacted** | ✅ Shipped (P1) | `last_contacted_at` on `network_contacts`, stamped by adding a note or completing a follow-up (QR scan in P2) |
| **"Reach out today"** | ✅ Shipped (P1) | a derived list (open reminders due soon + overdue) atop My Contacts; the home pulse is a fast-follow |

The reminders table + `last_contacted_at` are the only genuinely new primitives, and they are the
backbone for both the free reach-out list and (later) paid reporting. They reuse the shape of the
existing `crm_activities` due-dated tasks rather than inventing a new pattern.

## 4. In-person QR capture (decided: one-way + met-context)

**Today** a member's personal Frequency QR (`/q/<slug>`, purpose `connect`) only sets a referral
cookie and redirects — scanning it creates **no** contact. We add a capture step in that resolver
when the scanner is a **signed-in member** and the code is a personal connect code.

**Decided build (one-way + met-context):**

1. **One-way capture.** Member scans someone's QR → create a `network_contact` for the scanner,
   `source='qr_scan'`, `linked_profile_id` = the code owner, pre-filled from the owner's **public
   profile** (name, avatar, handle, title), `visibility='private'`. No consent needed — it is the
   scanner's private "I met them" note, exactly like a card scan. Lands in the **QR Scan** tab.
2. **Met-context auto-stamp.** `record_qr_scan` already captures coarse geo + the place/event.
   Stamp "Met at <Event/Space> · <date> · <city>" onto the capture. Stored in the existing
   `details` jsonb → **no migration for the context itself.**
3. **Follow-up at the moment.** Right after the scan, surface "Add a note / remind me to follow
   up." One tap drops them into the reach-out list. This is the highest-ROI CRM habit.

**Fast-follow (not in the first cut):** the **reciprocal handshake** ("Share yours back?" → both
parties capture each other), gated behind an explicit consent confirm (à la HiHello / Blinq).

**Schema cost:** add `'qr_scan'` to the `source` check constraint; everything else reuses
`network_contacts`, `/q/<slug>`, and `record_qr_scan`.

**Privacy posture (unchanged doctrine).** A capture stays personal/private. It enters the
marketing `contacts` DB only as `consent_state='unknown'` and becomes mailable only on opt-in
(ADR-099). Scanning someone's QR is a one-sided private note until the reciprocal handshake makes
it mutual with consent. Aligns with [CONNECTION-LAYER.md](CONNECTION-LAYER.md) ("proximity is a
feeling you grant, not a coordinate you expose").

## 5. Future-proof data model (graduate without a rewrite)

The canonical extensible CRM model is **Person · lifecycle-status · Activity-timeline · Deal ·
Pipeline/Stage · owner+workspace scope**, with typed custom fields from day one. Mapped to our
tables — most of it already exists:

| Primitive | Our table | Rule that keeps it future-proof |
|---|---|---|
| **Person** | `network_contacts` (personal) ↔ `contacts` (shared) | keep `linked_contact_id` as the bridge; never fork a third person table |
| **Lifecycle** | `status` field | model lead/contact/client as **status**, not a separate "leads" table — so a personal contact "becomes" a Space lead with no data move |
| **Activity timeline** | `network_contact_reminders` (new) + `crm_activities` (shared) | one chronological stream powers last-contacted (free) *and* reporting (paid) |
| **Deal / engagement** | `crm_deals` | generalize beyond sales: business deal = practitioner client-engagement = org gift/relationship |
| **Pipeline + stage** | `crm_stages` | per-Space, multiple pipelines; stage transitions are the automation hooks |
| **Custom fields** | `details` jsonb (personal) / `meta` jsonb (shared) | extensible without migrations |
| **Owner + workspace scope** | `owner_id` (personal) → `space_id` (shared) | private → shared is a **scope flip + roles**, not a migration |

## 6. Graduation: personal → Spaces CRM (the upgrade funnel)

The graduation moment is **structural, not a migration**. When a member runs a Space
(practitioner / business / org), offer **"Bring your contacts into your Space CRM"**: take their
`network_contacts` (or a tagged subset) into the Space's `contacts(space_id)`, optionally seeding
`crm_deals` in a per-segment pipeline. The bridge (`linked_contact_id`) and the scan-to-invite
sync (`lib/connections/crm-sync.ts`) already exist — extend them.

**The conversion is contextual.** Surface the upgrade exactly where a free member bumps into a
ceiling: wants a second pipeline, wants to share a contact set with a teammate, wants an automation
to fire a follow-up for them. Those are the proven upgrade-trigger events; instrument them.

Gating rides the existing access matrix surface **`businessCrm`** (practitioner = limited,
business / organization = full) and the Space plan/entitlements columns (ADR-322).

## 7. Segment templates (one model, many shapes)

Same primitives, different **stage + field templates per Space `type`** — which we already store:

| Segment | "Pipeline" is really | Stage template (starting point) |
|---|---|---|
| **Business** | a sales funnel | Lead → Contacted → Qualified → Proposal → Won / Lost |
| **Practitioner** | a client journey | Inquiry → Intake → Active → Lapsed → Rebook |
| **Org / nonprofit** | a supporter lifecycle | Prospect → First gift → Recurring → Lapsed → Reactivated |

## 8. Phasing

| Phase | Scope | Migration cost |
|---|---|---|
| ✅ **P1 — Foundation (free)** | tab/IA facets + `qr_scan` source; `network_contact_reminders`; `last_contacted_at`; "reach out today"; sorting | 1 small additive migration (`20260723000000_network_contacts_crm_p1.sql`) |
| **P2 — QR capture** | `/q/<slug>` in-person capture (one-way + met-context + follow-up affordance); reciprocal handshake as a fast-follow | resolver change, no new tables |
| **P3 — Graduation (paid)** | "Bring contacts into your Space CRM"; contextual upgrade prompts at the ceilings; wire `/spaces/<slug>/crm` pipeline UI over `crm_*` | reuses `crm_*`; per-space gating |

## 9. Economy alignment (don't reward the row)

Reuse the existing **zaps = real-life / outreach** currency and the engine doctrine from
[NETWORK-CRM.md](NETWORK-CRM.md): pay for **real outcomes**, idempotent + daily-capped. *Adding a
row is not an outcome.* A QR capture earns a small "grew your network" zap (first N/day, not
per-row); a captured person who **joins** pays the existing `invite_accepted` reward. The reach-out
list nudges a real follow-up, never farming.

## 10. Non-goals / open items

- **Not** a marketing-email tool on the free side — comms stays governed by
  [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) consent/suppression lanes.
- **Reconcile the two contact surfaces.** `network_contacts` renders on both `/network/contacts`
  (My Contacts, canonical) and the Friends `ContactsList` (`app/(main)/friends/contacts-list.tsx`).
  Decide which is the home and make the other a view, before adding the CRM layer twice.
- **Reciprocal QR handshake** consent UX — design in P2.
- **Custom objects** (beyond custom fields) — top paid tiers only, later.

## 11. Copy + naming (provisional)

All member-facing strings here — tab labels (`Card`, `QR Scan`), the "reach out today" nudge,
upgrade prompts, and any AI-drafted follow-up copy — are **provisional** and must pass
[NAMING.md](NAMING.md) (terminology) and [CONTENT-VOICE.md](CONTENT-VOICE.md) (voice; no em dashes
in brand copy; §10 checklist) before they ship.

## References

- Decision: [ADR-361](DECISIONS.md)
- Capture tool: [NETWORK-CRM.md](NETWORK-CRM.md) · People graph: [CONNECTION-LAYER.md](CONNECTION-LAYER.md)
- Operator spine: [COMMS-CRM-ARCHITECTURE.md](COMMS-CRM-ARCHITECTURE.md) · Tenancy: [SPACES.md](SPACES.md)
- Gating: [ROLES.md](ROLES.md), `lib/core/access-matrix.ts` · Economy: [ECONOMY-AND-JOURNEYS.md](ECONOMY-AND-JOURNEYS.md)
- Pipeline (built): ADR-102 · Scan→invite→credit: ADR-099 · Unified person: ADR-130
