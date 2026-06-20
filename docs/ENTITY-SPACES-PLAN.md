# Entity Spaces: Best-Practice Build-Out Plan

**Status:** ⏳ Plan / strategy (no code). Prepared 2026-06-19.
**Scope:** Fully-featured, templated, eventually white-label spaces for four verticals (**Practitioners, Businesses, Event Spaces, Non-Profits**), each with their own Events, Circles, Practices, Journeys, branded profile/landing pages, member-management admin, and a QR studio / splash-page builder, leading to full business suites with CRM + email marketing.

---

## 0. Executive summary (read this first)

1. **This is an *extension*, not a green-field build.** Frequency already has the white-label multi-tenant primitive in the schema: a **`spaces`** table (`20260619000000_spaces_tenancy.sql`) typed for exactly these verticals (`practitioner | business | organization | coaching | partner | lab | root`), with **custom-domain routing** (`proxy.ts → getSpaceByDomain()`), **per-space theming** (`spaces.skin → themeToCss()`), **per-space brand** fields (`brand_name/logo/accent`), an **`entities`** money-partition (Foundation / Labs), partner **personas**, a real **CRM** (`contacts`/`crm_deals`/`crm_activities`), a **QR studio** (`qr_codes`/`nodes`/`qr_scans`), the **module/template page framework**, and a role-scoped **Circle→Hub→Nexus** hierarchy. The work is *glue*, not foundation.

2. **Our structural differentiator is the one thing the market does *not* do well: a connected network of spaces.** Circle, Mighty, Heartbeat, Skool, and Nas.io all top out at **separate, disconnected community instances joined only by a "switcher."** Frequency's `spaces.network_connected` flag means a member can carry **one identity, one gamified Quest (Pillars/Zaps/rank/streak), and cross-space discovery** across every entity space. That is the moat. Lead with it.

3. **White-label in two stages, matching how every serious competitor actually ships it.** *Web* white-label (custom domain + remove-our-branding + branded email) is a mid-tier, self-serve feature and is **largely already scaffolded**. Do it first. A *native branded app* (own App Store listing) is, for **every** competitor (Circle Plus, Mighty Pro, Heartbeat Scale), a **high-price, done-for-you, top-tier service**, not a toggle. Defer it; price it as premium.

4. **CRM: build on what we have. Email marketing: integrate an ESP, don't build a mail server.** We already own CRM tables, so scope them per space. For email, every competitor treats it as a **paid add-on** (Circle's Email Hub ~$99/mo, Heartbeat/Nas built-in-but-light). Wrap a transactional+marketing ESP (recommendation: **Resend** to start, **Customer.io or Loops** as we scale) with per-space sender domains; build the audience/campaign UI on top of our `contacts`.

5. **Hook recommendation (preliminary; I could not read the repo in this session).** Because Frequency **already owns the white-label core**, the bar for adopting Hook wholesale is high. The likely answer is **"build on Frequency's `spaces`, and harvest specific modules from Hook"** (most plausibly its email-marketing and/or website-builder, if those are more mature than ours) rather than re-platform onto Hook. Final verdict needs a code read. See §10 for the exact evaluation and how to grant access.

6. **Sequence to de-risk:** Foundation (ownership FKs + `space_members`) → Spaces own Circles/Events → per-space admin → QR/splash + CRM scoping → email/outreach → earnings/payouts → website builder + advanced white-label → (much later) native apps.

---

## 1. What already exists (the foundation we build on)

| Capability | Status | Where |
|---|---|---|
| **Spaces (white-label tenant)** | ✅ table exists | `spaces`: `slug, name, type, entity_id, skin, domain, network_connected, enabled_verticals[], owner_profile_id, brand_*` (`20260619000000_spaces_tenancy.sql`, `lib/spaces/*`) |
| **Custom-domain routing** | ✅ wired | `proxy.ts` → `getSpaceByDomain()` |
| **Per-space theming + brand** | ✅ | `spaces.skin` → `themeToCss()`; `brand_name/logo/accent`; `themes` table |
| **Money/legal partition** | ✅ | `entities` (Foundation / Labs); financial_transactions + event tickets already `entity_id`-scoped |
| **Partner personas** | ✅ | `profile_personas` (collaborator/practitioner/business/organization, multi-select, stripe + entity binding) |
| **CRM suite** | ✅ built, server-mediated | `contacts`, `crm_deals`, `crm_stages`, `crm_activities`, `team_members`; pipeline board at `/admin/crm` |
| **QR studio** | ✅ built | `qr_codes` (slug, destination, style jsonb, analytics), `nodes` (check-ins), `qr_scans`; partner-scoped |
| **Module/template page framework** | ✅ | `lib/widgets/modules.ts` (route-scoped module sets), templates, per-slot/role layout in `page_settings.layout` |
| **Hierarchy + scoped admin** | ✅ | Region→Outpost→Nexus→Hub→Circle; `stewardship_edges`; role-scoped admin queries |
| **Ownership FKs on core objects** | 🔴 missing | circles/events = `host_id` (a person); practices/journeys = `created_by`. No `space_id`/`owner_entity_id` |
| **Per-space membership/roles** | 🔴 missing | no `space_members` table |
| **Per-space module layouts** | 🔴 missing | layout is per-route/global, not per-space |
| **Email marketing / ESP** | 🔴 missing | no provider wired; outreach is a stub |
| **Website / splash builder** | 🔴 stub | matrix stub only; QR destinations are raw URLs |
| **Per-space earnings/payout UI** | ⏳ partial | transactions are entity-scoped; no per-space dashboard/payouts |

**Implication:** ~70% of the hard architecture (tenancy, theming, domains, money partition, CRM, QR, page framework) exists. The plan is mostly *connecting core objects to spaces* and *adding the suites on top*.

---

## 2. Market landscape & where we sit

Cross-platform findings (June 2026 research; see appendix for citations/confidence). Vendor pages were largely fetch-blocked, so figures are cross-source and should be re-verified before any pricing decision.

| Platform | Nesting | Web white-label | Native branded app | Built-in CRM/email | Multi-tenant model | Take rate |
|---|---|---|---|---|---|---|
| **Circle** | Space Group → Space (2 deep) | Custom domain (Pro $89), remove-branding (Business $199) | **Plus only** (~custom/$$$, done-for-you) | Email/Marketing Hub **add-on ~$99/mo** | One community / sub; switcher | 2% / 1% / 0.5% |
| **Mighty Networks** | Spaces (+ sub-spaces) | Yes (mid/high tiers) | **Mighty Pro only** (premium, done-for-you) | Light CRM + email; AI "People Magic" | One network; **Mighty Pro = own apps** | tiered |
| **Heartbeat** | Group → subgroup (≈2) | **All paid tiers** (domain + remove branding + branded email) | **Scale only** ($849/mo, done-for-you) | Member directory + workflow email | Separate instances + switcher | 5% / 2.5% / 1.25% |
| **Skool** | **None (flat)** | **None** (subdomain only) | **None** (shared app) | Broadcast every 72h; no real CRM | $99 per standalone group | 0%→ (Pro) |
| **Nas.io** | None (flat hubs) | **None** (nas.io URL) | **None** (Nas-branded app) | Members CRM + Magic Reach (email/WhatsApp) | Sibling communities, own plans | **7.9% / 4.9% / 2.9%** + processor |

**Patterns to copy:**
- **Web white-label is a solved, mid-tier feature.** Custom domain + remove branding + branded email. We're already scaffolded for it.
- **The native app is the expensive, done-for-you moat** every leader reserves for its top tier. Don't self-serve it early.
- **CRM/email ships as a paid add-on**, not bundled. Good for our pricing.
- **"Template" mostly means *space-type presets + duplication*** (Circle "Duplicate space"), not a big template gallery. A blueprint-per-vertical + clone is the pragmatic pattern.

**Closest architectural analogs** (study these, not Skool): **Disco**'s "sub-portals" (one operator spins up many branded, data-siloed academies under one umbrella with unified admin) is the cleanest "one network → many branded sub-spaces" model; **Hivebrite**'s chapters are the best "delegated sub-space admins" model; **Mindbody** is the only one pairing **consumer discovery** with per-business branded spaces (but taxes it at a resented ~23.5% combined fee).

**The gap we can own (from the 16-platform synthesis):** *no major player cleanly combines (a) a shared community + discovery network, (b) many cheaply-branded entity sub-spaces, AND (c) an optional graduate-to-full-white-label path, under transparent, low take-rate pricing.* Disco does (b)+(c) but has no consumer network; Mindbody does (a)+(b) but with a punitive fee and only "branded" (not true white-label) apps; Skool is cheap-per-space but has no umbrella and no white-label. Frequency's `network_connected` spaces + the gamified Quest + one cross-space identity is precisely (a)+(b)+(c): a member belongs to several practitioners/studios/nonprofits at once and keeps one continuous practice history. That is the wedge.

---

## 3. The entity model

### 3.1 Spaces are the tenant; entities are the money; personas are the hat
- **Space** = the tunable, brandable container a Practitioner/Business/Event Space/Non-Profit operates. The white-label tenant.
- **Entity** (Foundation / Labs) = the legal/financial partition a space's revenue belongs to (already built). A space points to one entity.
- **Persona** (practitioner/business/organization) = a *capability hat* on a personal profile; it's what lets a person *operate* a space of that type.
- **Owner attaches via `spaces.owner_profile_id`**: an owner keeps their **personal account + Quest** and "wears" the space through ownership/membership. Exactly the model the brief describes ("personal account with the entity page attached").

### 3.2 The four verticals (one `spaces.type` each + a vertical blueprint)
| Vertical | `type` | Primary jobs-to-be-done |
|---|---|---|
| **Practitioner** | `practitioner` | 1:1 client relationships, bookings, client notes, their own Practices/Journeys to assign, a personal brand page |
| **Business** (studio/gym/brand) | `business` | Memberships/classes, staff/roles, schedule, retention, CRM pipeline, branded space |
| **Event Space** (venue/retreat) | `organization` or new `venue` | Ticketed events, capacity, check-in (QR), calendar, attendee CRM |
| **Non-Profit** | `organization` (entity = Foundation) | Programs, volunteers, donations, members, grant/impact reporting |

> **Decision needed:** do Event Spaces get their own `type` (`venue`/`event_space`) or reuse `organization`? Recommend a dedicated type so the blueprint, modules, and pricing differ cleanly.

### 3.3 Data-model extensions (the "glue")
- `ALTER TABLE circles | events | practices | journeys ADD COLUMN space_id uuid REFERENCES spaces(id)` (backfill existing → root space). Keep `created_by`/`host_id` for authorship/audit.
- New **`space_members(space_id, profile_id, role, status, created_at)`**: roles `viewer | editor | moderator | admin` (tunable per type). A person's role in space A is independent of space B.
- Extend the capability resolver: `getCircleCapabilities()` → also honor "admin of the owning space." Reuse the existing role-scoped query pattern (`host → their circles`) for `space admin → their space's objects`.
- Per-space entitlement: a `spaces.plan`/`space_subscriptions` row (space-level tier, distinct from a member's personal `membership_tier`).

---

## 4. Per-vertical needs & the templated-space engine

### 4.1 Feature matrix (what each blueprint turns on)
| Capability | Practitioner | Business | Event Space | Non-Profit |
|---|---|---|---|---|
| Circles | optional (client group) | ✅ classes/cohorts | optional | ✅ programs/chapters |
| Events | ✅ sessions | ✅ classes/workshops | ✅✅ ticketed, capacity, check-in | ✅ fundraisers/volunteer |
| Practices / Journeys (assign) | ✅✅ | ✅ | ◦ | ✅ |
| Bookings / scheduling | ✅✅ 1:1 | ✅ class schedule | ✅ room/space booking | ◦ |
| CRM | clients | ✅ leads→members pipeline | attendees | donors/volunteers |
| Email/comms | ✅ | ✅ | ✅ reminders | ✅ campaigns/appeals |
| Monetization | sessions/packages | memberships | tickets | donations |
| QR (5) + splash | profile/booking link | class check-in, promos | **ticket check-in** | donate/volunteer signup |
| Member admin | light | ✅ staff roles | door staff | volunteer/role mgmt |

(◦ = optional/off by default.)

**Per-vertical table-stakes + the differentiators we can win on** (from vertical research; each has hard compliance gates, treated as table-stakes, not nice-to-haves):
- **Practitioner / Business (wellness/fitness):** table-stakes = online booking + recurring classes + **waitlist auto-fill**, client profiles + attendance, automated reminders (email/SMS/push), **PCI-compliant payments + recurring billing + dunning + class packs**, role-based admin, and **digital liability waivers (ESIGN/UETA)**. Our edge = the **community/engagement layer** incumbents bolt on awkwardly: at-risk/churn intelligence from behavioral signals, in-app social feed, hybrid live+on-demand. Don't rebuild payroll/heavy back-office. **Integrate** (Stripe, ADP/Gusto).
- **Event Space / Retreat:** table-stakes = tiered ticketing + capacity + waitlist, **QR check-in** (our `nodes` mechanism already does verified check-ins), automated confirmations/reminders, refunds. Win on the **retreat money + lodging engine** generic tools lack: **installment payment plans** with auto-billing, deposits with expiring holds, **room-map assignment** (capacity/gender/preference), meal plans + dietary, and **waiver/insurance gating**. Compliance: PCI (hosted Stripe fields), a **configurable tiered refund/cancellation engine**, and **per-jurisdiction lodging tax**.
- **Non-Profit:** build the **donor profile (CRM) as the spine**, where every donation/event/volunteer/message writes back to one record (the market's #1 complaint is fragmentation). Table-stakes = one-time + **recurring giving** (first-class, since it's where the growth + retention are), hosted donation forms, and **auto tax-compliant receipts that compute the IRS $250 acknowledgment AND the $75 quid-pro-quo deductible amount** (event tickets/auctions must show the deductible portion, a frequent gap). Differentiators: P2P/team fundraising, the **fee-coverage model** ("donors can cover fees → org gets 100%", now an expectation), volunteer management, fund accounting. Compliance: PCI (DSS 4.0 client-side rules if we host forms), charitable-solicitation registration awareness, CAN-SPAM/TCPA.

### 4.2 Templated spaces (spin up → tune)
Build on the **existing module/template framework**, which already does route-scoped module sets + saved per-slot/role layouts:
1. **Blueprint per `type`**: a seed definition of which `enabled_verticals[]`, which modules per page, default theme `skin`, default circles/pages, sample content. Stored as data, not code.
2. **Provisioning wizard**: on "create a space", pick type → name/brand → pick a skin → blueprint instantiates pages/modules/sample objects (the "Duplicate space" pattern Circle uses, generalized).
3. **Per-space layout override**: store `page_settings.layout` keyed by `(space_id, route)` so each space tunes its own pages without code. (Today layout is per-route/global; add `space_id` to the scope cascade: `space → route → section → global`.)
4. **Guardrails**: owners tune within the blueprint's allowed modules; destructive/structural bits stay locked. Matches every competitor's "presets + safe customization," avoiding a full page-builder's complexity early.

**Patterns the research is clear on:**
- **Copy-on-create, not live-reference.** At creation, deep-copy the versioned blueprint manifest into the space's *own* rows (landing block tree, default events/circles/practices, theme preset); stamp `template_id`/`template_version` for analytics but never let rendering depend on the template afterward. A customized space is write-heavy by design, so a one-time copy avoids template-update-vs-local-override conflicts.
- **Landing/profile page = a JSON block tree with a registered catalog (adopt Puck, MIT).** Page = ordered `content` array of `{ type, id, props }`; developers own the component catalog + field schemas; owners edit **typed fields only**, never code (mirrors Notion's block-in-Postgres model and fits our Supabase stack). A Puck-style config doubles as both the editor UI and the renderer.
- **Guardrail with tokens + presets, not free hex** (already our house rule): editable = 3-5 curated palettes + a **contrast-validated** accent picker, logo, hero, copy, section order within an allowed set; locked = nav chrome, type scale, spacing, grid, kit components.
- **A ≤7-step golden-path wizard that lands on a NON-EMPTY space:** type → name/handle → theme+logo → confirm the seeded defaults → publish; defer domains/advanced settings to just-in-time. The seeded blueprint content *is* the time-to-value mechanism (never drop an owner into a blank space). **Position deliberately between Skool (too locked, owners can't brand) and Mighty (too flexible, members get lost):** enough brand expression, protected chrome so members never get lost. Test each seeded space against a skeptic: is it instantly legible to a *member*, not just flexible for the *owner*?

---

## 5. Member management & admin (per space)
- **Roster:** `space_members` + a `/spaces/<slug>/admin/members` surface (reuse the role-scoped member-list pattern from `/admin/members`).
- **Roles & invites:** per-space `viewer/editor/moderator/admin`; invite by email or shareable link; an owner can grant a colleague admin of *their* space without making them a global staff member (this is the key isolation win).
- **Scoped management:** space admins see/manage only their space's circles/events/practices/CRM, enforced server-side via `space_id` + the capability resolver, never client trust.
- **Keep platform/operator admin separate** (the `web_role` staff axis stays global and locked, the same boundary we just shipped for beta access).

---

## 6. QR studio + splash/landing builder (per space)
- Add `space_id` (or reuse `owner_entity_id`) to `qr_codes`; enforce the **5-codes-per-space** cap on create (more on higher tiers).
- **Splash/landing builder:** store a small `jsonb` document per code (hero, image, headline, body, buttons/CTAs, brand) and render a space-branded landing at `/q/<slug>` (or `<customdomain>/q/<slug>`). This is a constrained block builder: the same "blocks + safe customization" pattern as the space templates, reused.
- **Analytics per space** (`qr_scans` already append-only): scans, unique, conversion → only the owning space sees its codes.
- Event Spaces specifically: a code's destination can be a **check-in node** (the existing `nodes` mechanism already does verified, zaps-earning check-ins) → ticket/attendee check-in for free.

---

## 7. White-label architecture
**Tenancy model:** keep the **shared-schema + `space_id` + RLS** approach (already Frequency's pattern). It's the right call for a *connected network* (cross-space identity, one Quest, cross-space discovery): schema-per-tenant or db-per-tenant would break the network effect and explode ops. Industry consensus for "many tenants in one product with cross-tenant features" is shared-schema-with-row-scoping; reserve heavier isolation only for an eventual enterprise/regulated tier.

**Web white-label (do first, mostly scaffolded):**
- Custom domain per space (`spaces.domain` + `proxy.ts` resolution already exist). Add the **ops piece**: automated TLS + domain verification (Vercel Domains API for issuance; store status on the space).
- Per-space theming (`skin` + tokens) and brand (`brand_*`) already render. Add an **owner-facing theme editor** (token/color picker writing the space's skin).
- "Remove Frequency branding" + **branded notification email** (from the space's domain) as a tier feature, mirroring Circle Business / Heartbeat.
- Per-space **feature flags / `enabled_verticals[]`** already on the table → drive which modules/suites a space exposes.

**Implementation rules the research is unanimous on (cheap up front, expensive to retrofit):**
- **Model identity many-to-many from day one**: a person belongs to *many* spaces with a *role per space* (`space_members`). This is the one thing every source says you must NOT simplify; retrofitting it later is a painful identity migration. Carry the active `space_id` + `plan` in the JWT (Supabase Custom Access Token hook) so RLS reads them cheaply.
- **RLS is the security backstop; also filter `space_id` in queries (defense-in-depth + speed).** Supabase's own benchmarks: index `space_id` as the **leading column** of composite indexes (171ms→<0.1ms), wrap every auth/tenant function in `(select …)` so it runs once not per-row (up to 178,000ms→12ms), and scope policies `TO authenticated`. Skip these and a 5ms policy becomes seconds at scale.
- **Tenant-scope every cache key** (CDN, Redis, Next.js data cache); mark space-private pages `no-store`. A cache key that omits the space is the classic invisible cross-tenant leak (the Railway-class incident). Audit every `service_role`/`SECURITY DEFINER` path, where leaks hide.
- **Theming with no flash:** because the space is resolved server-side from the host, render its semantic-token CSS variables straight into the space layout's HTML (inline `style`/`<style>`), not from `localStorage`, so server and client markup match, there's zero FOUC and no blocking script. Keep it all in the existing token system (no hardcoded hex).
- **Custom-domain SEO:** one **primary** domain per space with 301/canonical from the `*.frequency.app` subdomain, or you dilute ranking with duplicate content.

**Native branded app (defer):** every competitor makes this a premium, done-for-you service (Circle Plus, Mighty Pro, Heartbeat Scale). Treat the existing PWA as the near-term mobile story; offer native apps later as a high-touch top tier, not a self-serve toggle.

---

## 8. CRM + Email Marketing
**CRM: build on what we own.** `contacts` + `crm_deals` + `crm_activities` + reorderable `crm_stages` already exist and are server-mediated. Add `space_id` to deals/activities (contacts stay globally unique by email but deal ownership is per-space), and per-space pipeline customization (stages/fields in space settings). This is the cheapest, highest-leverage suite to ship because the engine exists.

**Email marketing: BUY the sending infrastructure, build a thin orchestration layer on top.** The deciding axis is the multi-tenant model: each space must send **from its own authenticated domain with isolated reputation**.
- **Provider path:** start on **Resend** (best DX), and (uniquely) a **per-domain custom Return-Path built explicitly for multi-tenant apps**, programmatic domain verification + `domain.updated` webhooks, and a lean **Broadcasts** product for early per-space newsletters. We own the space→domain mapping, per-space suppression, and complaint monitoring in our own Postgres. **At scale, migrate the marketing-send layer to Amazon SES "tenants"** (Aug 2025: up to 10k tenants, independent per-tenant reputation, auto-pause a degrading tenant so it can't harm the others), the most purpose-built per-tenant primitive at the lowest cost, optionally fronted by self-hosted **Listmonk** for the campaign UI. **Mailgun subaccounts** is the managed fallback. **Avoid** SendGrid (~15-subuser ceiling), Customer.io ($1k/mo for workspaces), and Loops (single-workspace) for per-space sending.
- **Per-space domain authentication is non-negotiable onboarding** (it's now a hard requirement, not a nicety): each space verifies its own domain with **DKIM + a custom aligned Return-Path** so **DMARC aligns on both SPF and DKIM**. Reputation accrues to (and damage stays with) that space's domain; domain reputation now outweighs IP at Gmail/Outlook. Default to a **managed shared IP pool**, not per-space dedicated IPs (a single practitioner/studio will never hit the ~50k/mo volume a dedicated IP needs to stay warm; a cold IP *hurts* them).
- **Build to full bulk-sender compliance for every space regardless of volume:** SPF+DKIM+DMARC, **RFC 8058 one-click unsubscribe**, <0.1% complaint target (the Feb-2024 Gmail/Yahoo + May-2025 Outlook rules reject, not junk, non-compliant mail).
- **Compliance posture (get counsel to confirm 2 flagged items):** the **space is the "sender"/controller; Frequency is the "initiator"/processor**, and "just the pipe" is not a complete defense, so we need a tenant-facing **AUP + anti-spam terms + Art. 28 DPA**, each space's valid physical address, **per-space suppression by default** (unsubscribing from Studio A still hears from Studio B) plus a platform-wide abuse layer, and a per-space **kill-switch**. ⚠️ Counsel review: (1) CAN-SPAM initiator reach to a pure-infra platform, and (2) whether **Vera/AI features tip Frequency into joint-controller** status.
- **Build on top:** audience builder over `contacts` (segments/tags), campaign composer (reuse the block/template pattern), schedule, and `outreach_campaigns`/`outreach_sends` for status/opens/clicks. Honor `consent_state` (already on `contacts`).
- **Notifications:** consider **Knock** later for unified multi-channel transactional notifications with per-space preferences. It orchestrates *through* the ESP, it doesn't replace it.

**Pricing:** make the CRM + Email suite a **paid per-space add-on** (the market standard, Circle's Email Hub is ~$99/mo), not bundled into the base.

---

## 9. Monetization / pricing model (for the entity tiers)
Borrowing the market's proven gating (verify exact numbers before publishing):
- **Free/Starter space:** networked space, basic circles/events/practices, 1 to 2 QR codes, Frequency-branded URL.
- **Pro space:** custom domain, theme editor, more QR codes (5), basic CRM, member admin/roles.
- **Business space:** remove Frequency branding, branded email, full CRM + email suite, advanced analytics, more admins.
- **Premium / White-label+:** native branded app (done-for-you), priority support, lowest take rate.
- **Take rate:** keep it **well under Nas.io's 7.9%** and competitive with Circle's 2%/1%/0.5%; the network effect (one identity, cross-space discovery, the Quest) is the value that justifies a modest platform fee.

This ladder mirrors the **universal gating pattern** across all 16 platforms studied, which de-risks it: **custom domain** unlocks at the entry-to-mid paid tier, **"remove our branding" + branded email** at mid, the **true native white-label app** is reserved for the top tier / a premium add-on / done-for-you (every incumbent does this: Mighty Pro ~$30k/yr, Circle Plus, Hivebrite enterprise, Walla +$279/mo, Mindbody +$249/mo), and **API/SSO** at the top. The most common monetization spine in community/creator land is a **transaction-fee buy-down** (the fee *decreases* as a space upgrades); adopting that directly counters the resented Mindbody (~23.5%) / Nas.io (7.9%) stacking. **CRM + email is a differentiator, not table stakes** (only Kajabi/Mindbody/Pabau ship deep marketing automation; Circle/Skool/Heartbeat/Disco are light), so our built-in suite is a real edge for the Business/Non-Profit verticals.

---

## 10. Hook: build vs. reuse (preliminary; needs a code read)

**I could not read `hellofrequencylab/hook` in this session.** Both the GitHub API and the git proxy reject it as out-of-scope, and the workspace `add_repo` tool isn't available here. **To unblock:** add `hellofrequencylab/hook` to this environment's repository list (Claude Code on the web → environment *Sources/Repositories*), or start a session scoped to both repos.

**Preliminary lean:** Frequency **already owns** the white-label core (spaces, domains, theming, money partition, CRM, QR, page framework). So the most likely correct answer is **NOT "re-platform onto Hook,"** but one of:
- **(A) Build on Frequency's `spaces`, harvest specific modules from Hook**, most plausibly its **email-marketing** and/or **website/splash builder**, *if* those are more mature than ours. (Most likely outcome.)
- **(B) Extract a shared package** both apps consume (monorepo), only if Hook and Frequency are the same stack *and* will both keep evolving the same white-label/CRM core.
- **(C) Build our own**, if Hook is a different stack, prototype-grade, or its white-label logic is entangled with Hook-specific domain code.

**The evaluation I'll run the moment I have access** (decision table):
| Signal | Tips toward |
|---|---|
| Next.js + Supabase + TS like Frequency? | A/B if yes; C if divergent |
| Mature multi-tenant isolation / custom domains already working? | borrow it (A) |
| Email-marketing + website builder real and modular? | **harvest these into Frequency (A)**: they're our biggest gaps |
| White-label core cleanly separable from Hook's domain logic? | B (shared package) if yes; C if fused |
| Production-grade + tested vs. prototype? | A/B if yes; C if throwaway |

> Note: Frequency's access matrix already has a **`hookNetwork`** surface labeled *"Org product"*, so the two were apparently designed to interoperate, which slightly favors (A)/(B). Confirm on read.

---

## 11. Risks & pitfalls (multi-tenant retrofit)
- **The "add `space_id` everywhere" migration** is the riskiest step: every core table, every query, every RLS policy, and a careful backfill to the root space. Do it as **Phase 0**, behind tests, before any feature work.
- **RLS / data isolation bugs** are the worst-case (one space seeing another's members/CRM). Treat space-scoping like the auth gate we just shipped: **server is the source of truth**, add an authz contract test per space-scoped action.
- **Custom-domain ops:** TLS issuance, domain verification, and renewal are an operational surface (not just code). Automate via the host's domains API; surface status to owners.
- **Email deliverability & reputation per tenant:** a single bad sender can poison a shared IP. Per-domain auth + an ESP that isolates reputation; throttle + monitor complaints.
- **Scope creep across four verticals:** booking, ticketing, donations, memberships are each deep. **Ship one vertical end-to-end first** (recommend **Practitioner**, the smallest surface, clearest value), then template the next.
- **Noisy-neighbor / performance** at scale: index on `space_id`; watch the heaviest cross-space queries (feed, discovery).
- **Don't promise native white-label apps early.** It's the most over-promised, hardest-to-deliver item in this whole space (even the incumbents punt it to done-for-you top tiers).

---

## 12. Phased roadmap
| Phase | Outcome | Key work |
|---|---|---|
| **0: Foundation** | Spaces can *own* things | `space_id` FKs on circles/events/practices/journeys (+ backfill to root); `space_members`; extend capability resolver; authz contract tests |
| **1: Spaces operate** | One vertical end-to-end (start **Practitioner**) | space provisioning wizard + blueprint; `/spaces/<slug>` + admin; circles/events under a space; per-space layout override |
| **2: Reach & convert** | QR + CRM per space | `space_id` on `qr_codes` (+5 cap) + splash builder; `space_id` on CRM; per-space pipeline |
| **3: Communicate** | Email marketing | ESP integration (Resend), per-space sender domains, audience/campaign UI, `outreach_*`, consent/compliance |
| **4: Earn** | Money per space | per-space earnings dashboard; Stripe Connect payouts; tax helpers (1099 / Form 990 nudges) |
| **5: White-label+** | Self-serve branded web | theme editor, remove-branding tier, branded email, automated custom-domain TLS; website builder |
| **6: Premium** | Native apps (done-for-you) | branded app program as a top tier, only after 1 to 5 are proven |

Verticals roll out **one at a time** on top of Phase 0 to 1: Practitioner → Business → Event Space → Non-Profit, each adding its blueprint + the one or two deep features it needs (bookings, ticketing/check-in, donations).

---

## 13. Open decisions for you
1. **Event Space `type`:** dedicated `venue` type, or reuse `organization`? (Recommend dedicated.)
2. **First vertical to build end-to-end:** I recommend **Practitioner** (smallest surface). Agree, or start with Business/Event Space?
3. **Email provider:** OK to standardize on **Resend** now (→ Customer.io/Loops later)?
4. **Hook:** add `hellofrequencylab/hook` to this session so I can do the real assessment? (Or tell me its stack + whether it has custom-domains/CRM/email so I can sharpen the preliminary call.)
5. **Pricing posture:** confirm the "web white-label mid-tier, native app premium, CRM/email add-on, low take-rate" shape before I detail tiers.

---

### Appendix: research sourcing & confidence
Built on June 2026 deep research: **16 platforms** (Circle, Mighty Networks, Skool, Disco, Heartbeat, Nas.io, Hivebrite, Bettermode, Kajabi, Patreon, Geneva, + wellness: Mindbody, Walla, Momence, Practice [shut down Nov 2025], Pabau), the **four verticals'** needs + compliance, **multi-tenant/white-label architecture** (Supabase RLS, Vercel domains, theming), **templated-space patterns** (copy-on-create, Puck block model, onboarding wizards), **CRM/email build-vs-buy** (providers, deliverability, CAN-SPAM/GDPR), and **retrofit pitfalls/sequencing**, plus a full read of Frequency's own schema/code.

Confidence is **high** on the *models* (nesting depth, white-label staging, CRM-as-add-on, separate-instance multi-tenancy, the gating ladder, the RLS/identity/cache pitfalls, the CRM-build/email-buy verdict) and **medium** on *exact* per-tier prices, member caps, and transaction-fee breakdowns. Most vendor pricing pages were fetch-blocked, so numbers are triangulated from third-party sources and **must be re-verified on live pricing pages before any commercial decision.** Two items explicitly **need legal counsel** before white-label launch: CAN-SPAM "initiator" liability reach, and whether Vera/AI features create GDPR joint-controller status.
