# Smart Business Importer

> **The answer.** A draft-first tool that seeds a complete business into Frequency (Spotlight
> is a member surface, not a business one, so the three business surfaces are the **Space
> profile**, the public **Site** at `/sites/[slug]`, and an optional **Spotlight demo card**)
> from URLs, social handles, and pasted content. It **researches**, **double-checks every
> commercial fact against a citation**, **reframes** the business in the Frequency voice, and
> **materializes** it. One engine, two front doors: an **Operator Seeder** (priority) and an
> **Owner Wizard**. Nothing it invents reaches a live surface without a source or a human confirm.

**Status legend:** ✅ done · ⏳ in progress · ⚠️ needs attention · 🔴 blocker.
**Status of this doc:** ✅ Spec. P0 (materializer) ✅ shipped (#1599). P1 (research + verification pipeline:
harvest, extract, verify, ledger, staging table) ✅ shipped (ADR-574): `lib/importer/{harvest,extract,verify}/`
+ `pipeline.ts` + `store.ts` + `queue.ts`, `lib/ai/web/`, migration
`supabase/migrations/20261022000000_business_intake.sql` (⚠️ awaiting apply by the coordinator; the draft
`.txt` is removed). P2+ (reframe/compose, console, wizard) pending. Authority order: running code +
`supabase/migrations/` > this doc.

This spec follows [`DOCS-PROTOCOL.md`](DOCS-PROTOCOL.md) (technical → git), [`PRESENTATION.md`](PRESENTATION.md)
(lead with the answer, tables, status legend), [`NAMING.md`](NAMING.md) + [`CONTENT-VOICE.md`](CONTENT-VOICE.md)
(no em dashes in any product-facing copy proposed here). The load-bearing decisions are recorded as an
ADR in [`DECISIONS.md`](DECISIONS.md) (ADR-569).

---

## 1. Goals and non-goals

### Goals
- Seed a **complete, believable business** (Space profile + public Site + an optional Spotlight-style demo
  card) from a handful of inputs (website URL, social handles, a pasted content block), in minutes not hours.
- **Verify before it publishes.** Every commercial fact (price, hours, address, phone, claim,
  certification) carries a citation or a human confirmation. Reframing may rephrase a verified fact; it
  may never invent one.
- **Reframe through the Frequency lens.** Populated copy reads in the brand voice (`lib/ai/voice.ts`),
  passes the CONTENT-VOICE §10 skeptic test, and uses the naming canon.
- **Two front doors, one engine.** An Operator Seeder (heavy-assist, mostly automated, the priority) and
  an Owner Wizard (question-led, conversational) both drive the same pipeline and the same materializer.
- **Draft-first, idempotent.** A staging record (`business_intake`) holds everything; applying is a
  separate, idempotent step that never dirties a live Space until an operator approves.

### Non-goals (v1)
- Not a scraper of auth-walled social platforms. We rely on **paste + oEmbed + web search** (see §7).
- Not a paid-transaction seeder. Offerings/tiers seed as **display-only** (matches the current Space
  model, where `price_cents` is display-only in v1).
- Not a custom-domain publisher. The Site renders at `/sites/[slug]` on the platform domain.
- Not a multi-page website generator. The Site is **single-page** (the Space Home doc, filtered for the
  `website` surface). Multi-page profiles are a separate paid entitlement (`space_full_website`).
- Not a replacement for the block editor. It **writes the same `EntityLayout` jsonb** the editor reads;
  a concurrent effort owns `components/entity-blocks/*` and `lib/entity-blocks/*`, and this importer treats
  those as read-only.

---

## 2. The two front doors, one engine

| | Operator Seeder (P0-P3, priority) | Owner Wizard (P4) |
|---|---|---|
| **User** | Frequency operator seeding demo businesses | A real business owner clarifying their message |
| **Input** | URLs + handles + pasted content, minimal typing | Conversational Q&A led by Vera, plus the same inputs |
| **Automation** | Heavy-assist: harvest and extract run automatically; operator reviews | Light-assist: Vera asks, confirms, and fills gaps as it goes |
| **Data source** | Public web about the business (third-party facts) | The owner's own words and assets (first-party) |
| **Default publish** | Unlisted / draft until the operator flips live (§7, §9b) | The owner's own Space, owner decides visibility |
| **Surface reused** | `EntityManageConsole` board, `WizardShell` for the input step | `WizardShell` + `wizard-progress.tsx` + Vera (`conciergeTurn`) |
| **Shared** | ONE `business_intake` record, ONE pipeline (§3), ONE materializer (§5) | same |

The engine is the pipeline (§3) plus the materializer (§5). The front doors differ only in **who supplies
inputs** and **how review happens**. The Owner Wizard is a thin Vera-driven intake that writes the same
`business_intake` draft the Seeder writes; from Extract onward the path is identical.

---

## 3. Data model: the `business_intake` staging table

**Principle: draft-first.** Nothing touches a live Space until Apply. The record holds inputs, harvested
raw sources, the extracted draft, a per-field provenance ledger, and a status machine. A `target_space_id`
is null until Apply provisions (or an operator picks) the Space.

### 3.1 Table (draft migration in Appendix A; unapplied)

```
public.business_intake
  id              uuid pk
  created_by      uuid  -> profiles(id)          -- operator or owner who started it
  mode            text  -- 'operator' | 'owner'
  status          text  -- 'intake'|'researching'|'review'|'applied'|'failed'  (see 3.5)
  inputs          jsonb -- IntakeInputs (3.2)
  raw_sources     jsonb -- HarvestedSource[] (raw crawl/search/oembed payloads, 3.3)
  draft           jsonb -- BusinessProfile (3.4) -- the extracted + reframed draft
  ledger          jsonb -- ProvenanceLedger: Record<fieldPath, LedgerEntry[]> (3.6)
  budget_spent    numeric -- running USD spend for this import (cost cap, §6/§9e)
  target_space_id uuid  -- null until Apply; the materialized Space
  applied_at      timestamptz
  error           text
  created_at / updated_at  timestamptz
```

- **Access model: service-role only, fail-closed.** RLS ENABLED with **no client policies** (the exact
  posture of `space_drip_enrollments` / `space_automation_rules`). The only path is gated server code
  through the admin client. An intake row can hold un-verified third-party facts, so it must never be
  world- or member-readable. Recorded in `scripts/rls-deny-all.txt`.
- **jsonb-carried, ADR-246 friendly.** All structured content lives in jsonb, so no per-field schema
  churn while the shape settles. `lib/database.types.ts` reaches the table with untyped casts until the
  types are regenerated, exactly like the space_* tables.

### 3.2 `IntakeInputs`

```ts
interface IntakeInputs {
  websiteUrl?: string           // primary crawl seed
  socialHandles?: {             // handle only; we never store credentials
    instagram?: string; facebook?: string; linkedin?: string;
    tiktok?: string; youtube?: string; x?: string; other?: string[]
  }
  pastedContent?: string        // the operator/owner paste (bio, menu, about, reviews)
  hints?: {                     // optional operator nudges
    name?: string; category?: string; city?: string; type?: 'business'|'nonprofit'
  }
  consent?: {                   // §7 consent
    isDemo: boolean             // true = seeded demo (default unlisted); false = owner's real business
    ownerConfirmed?: boolean    // owner wizard: the owner asserts these are their own details
  }
}
```

### 3.3 `HarvestedSource` (raw sources, one entry per fetch)

```ts
interface HarvestedSource {
  id: string
  kind: 'page' | 'search_result' | 'oembed' | 'paste' | 'og' | 'image'
  url?: string                  // the fetched url (null for paste)
  fetchedAt: string
  title?: string
  text?: string                 // extracted readable text (crawled subpage, search snippet)
  html?: string                 // trimmed, for og/logo extraction only
  mediaPath?: string            // site-media path when kind==='image' (uploaded logo/hero/og)
  meta?: Record<string, unknown> // og tags, oembed json, http status, content length
}
```

### 3.4 `BusinessProfile` (the extracted draft)

The concrete shape the Extract step fills and the materializer (§5) consumes. Every scalar field maps to a
real Space storage location (noted in `->`), so composition is a mechanical map, not a guess.

```ts
interface BusinessProfile {
  // Identity -> spaces row
  name: string                              // -> spaces.name
  brandName?: string                        // -> spaces.brand_name
  slug?: string                             // -> spaces.slug (validated isSafeSlug; else derived)
  type: 'business' | 'nonprofit'            // -> spaces.type (the only two designators, NAMING)
  tagline?: string                          // -> spaces.tagline / brand bar
  category?: string                         // operator hint / discovery
  accent?: string                           // -> spaces.brand_accent (token name or #hex, lib/spaces/accent.ts)

  // Story + about -> spaces.preferences.profileData / block content bags
  story?: string                            // reframed narrative -> 'story' block body
  about?: string                            // -> profileData.about / 'about' block

  // Contact + hours -> spaces.preferences.profileData (SpaceProfileData)
  contact?: {
    address?: string; phone?: string; email?: string; website?: string
    hours?: string                          // free text, one line per day
    socials?: { platform: string; url: string }[]
  }

  // Reputation (verify-gated) -> profileData.rating / ratingCount, reviews
  rating?: { value?: string; count?: string }
  reviews?: { author?: string; text: string; rating?: number }[]

  // Offerings (display-only in v1) -> profileData.offerings[] (SpaceOffering)
  offerings?: {
    title: string; blurb?: string; price?: number; currency?: string
    priceModel?: 'fixed'|'from'|'free'|'contact'; durationMinutes?: number
  }[]

  // Team -> space_members (invite/seed rows)
  team?: { name: string; role?: string; avatarPath?: string }[]

  // Events -> events table (space_id-stamped)
  events?: { title: string; startsAt?: string; endsAt?: string; location?: string; blurb?: string }[]

  // FAQ -> space_faqs
  faq?: { q: string; a: string }[]

  // Media -> site-media bucket paths (already uploaded during Harvest)
  media?: { logoPath?: string; heroPath?: string; gallery?: string[] }

  // Layout intent -> EntityLayout the materializer writes to spaces.preferences.profileLayout
  layoutHint?: string[]                     // ordered block ids the composer prefers, e.g.
                                            // ['photoHero','about','offerings','contact']
}
```

### 3.5 Status machine

```
 intake ──▶ researching ──▶ review ──▶ applied
    │            │             │
    └────────────┴─────────────┴──▶ failed  (recoverable; re-run from last good stage)
```

| Status | Meaning | Entered by |
|---|---|---|
| `intake` | inputs captured, nothing harvested | front door (Seeder input step / Owner wizard) |
| `researching` | Harvest -> Extract -> Verify -> Reframe -> Compose running (background job) | pipeline job (§6) |
| `review` | a composed draft + ledger await human approval | pipeline job on success |
| `applied` | materialized into `target_space_id` | Apply (§5) |
| `failed` | a stage errored; `error` set; safe to re-run | any stage |

### 3.6 Provenance ledger (the heart of verification)

```ts
type LedgerKind = 'fact' | 'inferred' | 'generated'
interface LedgerEntry {
  sourceUrl?: string            // where the claim came from (null for 'generated')
  snippet?: string              // the exact harvested text that supports it
  confidence: number            // 0..1
  kind: LedgerKind              // fact = cited from a source; inferred = deduced; generated = written by AI
  verifiedBy?: 'auto' | 'human' // set once the adversarial verifier or an operator confirms it
}
type ProvenanceLedger = Record<string /* field path, e.g. 'contact.phone' */, LedgerEntry[]>
```

Every field in `draft` has a ledger entry keyed by its path. The review UI reads the ledger to paint each
field green/amber/red and to put the source one click away (§4).

---

## 4. Verification subsystem (the emphasized requirement)

> **Rule of the tool: reframe may rephrase a verified fact; it may never invent one. Commercial facts
> never auto-publish without a citation or a human confirm.**

### 4.1 Provenance-grounded extraction
Extract (§3.4) is told, per field, to attach the `sourceUrl` + `snippet` it used. A field with no
supporting snippet is emitted as `kind: 'generated'` or `kind: 'inferred'`, never `fact`. This is the
first grounding gate: the model cannot silently promote a guess to a fact.

### 4.2 Adversarial second pass (the refuter)
A separate verifier call runs **after** extraction, per commercial field, with a deliberately hostile
prompt: *given ONLY these harvested snippets, can this specific claim be refuted or is it unsupported?*
It returns, per field, one of `supported | unsupported | contradicted`, plus the snippet it relied on. It
uses a **different model tier** from extraction (Extract on `sonnet`, Verify on `opus`; §6) so a single
model's blind spot is less likely to pass both.

- `supported` -> ledger entry gets `verifiedBy: 'auto'`, confidence kept/raised.
- `unsupported` -> stays `generated`/`inferred`, confidence capped low, flagged amber.
- `contradicted` -> flagged red, held out of Apply until a human resolves it.

### 4.3 The hard commercial-fact gate (TWO independent gates, both fail-closed)
These fields are **commercial facts** and may **never** auto-publish:
`contact.address`, `contact.phone`, `contact.email`, `contact.hours`, every `offerings[].price`
(**and that offering's `priceModel` + `currency`**, since "Free" / "From $95" are claims too), `rating`,
and any claim or certification embedded in **generated prose** (`about` / `story` / `tagline` /
offering `blurb`).

The invariant "no unverified commercial claim reaches a live surface as trusted" is enforced by **two
independent gates**, so it never rests on one:

- **Gate A (the verifier).** `splitVerified` strips every commercial field whose ledger entry is not
  (`kind:'fact'` AND `verifiedBy`) from the verified draft and flags contradicted fields red (blocking
  Apply). Reframe (§4.4) then sees only the verified subset.
- **Gate B (the materializer).** At Apply, the materializer RE-DERIVES the decision **per field** from the
  provenance ledger (via `isCommercialFieldCleared`), independently of Gate A: `mapProfileData` /
  `mapIdentity` / the layout composer publish a commercial field iff its ledger entry is a verified fact,
  and **withhold** it (left blank on the live surface) otherwise. A verified fact **does** publish (the
  verified path is live); an uncleared one does not. Generated prose is **review-required**: under the
  ledger gate, prose with a `generated`/`inferred` entry is withheld (a commercial claim can hide inside a
  sentence), publishing only when the entry is a verified fact or absent (hand-supplied).

`materializeBusiness` **defaults to withhold** when given neither a policy nor a ledger, so a direct call
that forgets the flag cannot leak. A UI bypass cannot leak an unverified price: Gate B runs regardless of
the UI.

### 4.4 Reframe reads only verified facts
The Reframe step (§3, stage 5) is handed the verified subset of the draft, never the raw harvest. It may
restate a verified fact in the Frequency voice; it has no access to unverified claims, so it cannot launder
a guess into published copy.

### 4.5 Confidence surfaced, sources one click away
The review board paints every field:

| Colour | Meaning |
|---|---|
| 🟢 green | `fact` + `verifiedBy` set, confidence high |
| 🟡 amber | `inferred`/`generated`, or `fact` with low confidence; editable, not auto-applied for commercial fields |
| 🔴 red | `contradicted`; blocks Apply for that field until resolved |

Each field links to its `LedgerEntry.sourceUrl` + `snippet`, so an operator verifies in one click.

### 4.6 Auto-run the CONTENT-VOICE skeptic test
After Reframe, generated copy is run through an automated CONTENT-VOICE §10 check (no em dashes, no
vibe-verbs, passes the skeptic test, naming canon respected). The primer already lives in `lib/ai/voice.ts`
and is injected via `withVoice()`. Copy that fails the check is regenerated once, then flagged amber for
human edit rather than shipped.

---

## 5. One approved draft to the surfaces (the materializer, P0)

The materializer is a **pure, idempotent** function `applyIntake(intakeId)`. It is the P0 deliverable and
is testable with a hand-authored `BusinessProfile` and **zero AI**.

**Grounding: the exact seams it calls (all confirmed in code).**

| Step | What it writes | Seam (file : function) |
|---|---|---|
| 1. Provision Space | `spaces` row (draft/unlisted), owner seat, CRM stages | `lib/spaces/provision.ts : createSpace` |
| 2. Contact/hours/socials/about/offerings | `spaces.preferences.profileData` (jsonb) | `lib/spaces/profile-data.ts` shape; write via admin client |
| 3. Availability (if booking) | `space_availability` rows | `lib/spaces/booking.ts : setSpaceAvailability` |
| 4. Membership/ticket tiers | `space_membership_tiers` / `space_ticket_tiers` | `lib/spaces/memberships.ts`, `lib/spaces/tickets.ts` |
| 5. Team | `space_members` rows | `lib/spaces/membership.ts : addSpaceMember` |
| 6. Events | `events` rows (space_id-stamped) | `lib/events/store.ts` |
| 7. FAQ / reviews | `space_faqs` / `space_reviews` | `lib/spaces/content-data.ts` read side; admin insert |
| 8. Media | logo/hero/gallery already in `site-media` | `lib/page-editor/upload-action.ts : uploadSiteMedia(Batch)` |
| 9. Layout | `spaces.preferences.profileLayout` = an `EntityLayout` | shape in `lib/entity-blocks/layout.ts`; validate `sanitizeEntityLayout(raw,'space')` |
| 10. Accent | `spaces.brand_accent` (token or hex) | `lib/spaces/accent.ts : isValidAccent` |

The surfaces then render from that one write:

| Surface | What it is | Renders from | Regenerable independently? |
|---|---|---|---|
| **Space profile** | in-app business page at `/spaces/[slug]` | `spaces.preferences.profileLayout` + live `profileData` + function records | ✅ re-run Compose -> re-write profileLayout |
| **Site** | public micro-site at `/sites/[slug]` (single Home page, `website` surface filter) | the SAME Space Home doc, `filterDocForSurface(doc,'website',...)`; gated by `visibility==='network'` AND `preferences.websitePublished===true` | ✅ toggle publish + tune `surfaceVisibility.website.hiddenTypes` |
| **Spotlight demo card** | a member-style mini-site for the demo owner profile (linktree feel), at `/spotlight/[handle]` | `profiles.meta.spotlight` + `meta.entityGrid` + `spotlight_top_friends` | ✅ re-run the Spotlight composer |

> **Note on "Spotlight".** Per NAMING, Spotlight is a **member** surface, not a business one. For a seeded
> **demo**, the importer can also dress the demo owner's Spotlight so the demo looks lived-in. For a real
> owner, the business surfaces are the Space profile + Site; the Spotlight stays the member's own. This is
> the resolution to "the three surfaces" for a business: **Space profile + Site are the business; the
> Spotlight card is an optional demo-dressing surface.**

**Idempotency + edit-wins.** `applyIntake` is keyed by `target_space_id`. A re-run **diffs** the draft
against the live Space and only writes fields the operator has not since edited (an `edited_fields` marker
on the Space preferences records operator overrides). Re-harvest never clobbers a human edit. Each surface
carries a `regenerate(surface)` entrypoint so one can be rebuilt without touching the others.

---

## 6. AI and agent design

**Reuse, do not rebuild.** All model calls go through `lib/ai/complete.ts` (`completeRaw`, `runToolLoop`)
with `withVoice()` from `lib/ai/voice.ts`. Structured output = tool-use with a forced `tool_choice` (the
exact pattern in `lib/ai/events-ai.ts`). Env + kill switches (`ANTHROPIC_API_KEY`, `AI_GATEWAY_URL`,
`AI_DISABLED`, `platform_flags.ai_enabled`) and the per-feature budget caps (`lib/ai/budget.ts`) all apply
unchanged. New feature budget keys: `business-import-extract`, `business-import-verify`, `business-import-reframe`.
Model tiers available: `haiku` (`claude-haiku-4-5`), `sonnet` (`claude-sonnet-4-6`), `opus` (`claude-opus-4-8`).

### 6.1 The 8-stage pipeline

| # | Stage | In | Out | Model / tool |
|---|---|---|---|---|
| 1 | **Intake** | `IntakeInputs` | `business_intake` row, status `intake` | none |
| 2 | **Harvest** | inputs | `raw_sources[]` + `site-media` uploads | web fetch/search tool; oEmbed; og/logo parse |
| 3 | **Extract** | `raw_sources` | `BusinessProfile` draft + per-field ledger (`kind`+snippet) | `sonnet`, forced tool `save_business_profile` |
| 4 | **Verify** | draft + snippets | ledger updated (`supported`/`unsupported`/`contradicted`) | `opus`, adversarial refuter, forced tool `verify_field` |
| 5 | **Reframe** | verified subset | voiced `story`/`about`/`offerings.blurb`/tagline | `sonnet` + `withVoice`, then CONTENT-VOICE check |
| 6 | **Compose** | verified+voiced draft | `EntityLayout` + function-record plan + spotlight plan + accent | deterministic mapper + a small `sonnet` layout call |
| 7 | **Review/Approve** | composed draft + ledger | operator edits + approve | none (UI) |
| 8 | **Apply** | approved draft | materialized Space (§5) | none (deterministic) |

### 6.2 Harvest fan-out as a background job (durable)
Harvest and Verify are the slow, parallel stages. They run on the **existing durable queue**, not inline:

- `lib/queue/outbox.ts : enqueue(kind, payload, opts)` enqueues one job per harvester
  (crawl-website, fetch-oembed, web-search-reviews, web-search-hours) and one adversarial `verify-field`
  job per commercial field. Handlers register in `lib/queue/handlers.ts`.
- The drain cron `app/api/cron/process-queue/route.ts` (every 5 min, `claim_outbox_jobs`
  `UPDATE ... FOR UPDATE SKIP LOCKED`, exponential-backoff retry, dead-letter) runs them with the
  double-send safety already proven for email/push/sms.
- A `business-import` cron (or the same drain) advances the intake status when its child jobs complete.
  For faster operator turnaround, an operator-triggered server action can also run the fan-out inline with
  `Promise.all` behind an `after()`-style deferral, capped by the budget (§9e).

**Caching + safe re-run.** `raw_sources` is the harvest cache: a re-run reuses fetched pages unless the
operator forces a refetch, so re-running Extract/Verify/Reframe costs no new crawl. Every stage is
resumable from the last good status.

### 6.3 Web fetch / web search
The codebase has **no web tool today** (confirmed). This tool introduces the first one, isolated in a new
`lib/ai/web/` module behind a single interface (fetch(url) -> readable text; search(query) -> results),
so the provider (Anthropic server-side tools, or a fetch + search API) is swappable and the rest of the
pipeline depends only on the interface. All fetches are logged as `HarvestedSource` for provenance.

---

## 7. Guardrails and honest limits

| Area | Limit | Mitigation |
|---|---|---|
| **Social scraping** | Instagram/Facebook/LinkedIn/TikTok are ToS- and auth-walled | Rely on **paste + oEmbed + web search**, never credentialed scraping. Store handles, never credentials. |
| **Demo vs real consent** | A seeded demo uses third-party facts about a business that has not opted in | Seeded demos default **unlisted/draft** (`visibility='private'` or `websitePublished=false`), tagged `is_demo` (precedent: `20260605090000_hubs_is_demo.sql`), and decay via the existing `demo-decay` cron. Operator must consciously flip live. |
| **Owner consent** | The Owner Wizard must use the owner's own data | `inputs.consent.ownerConfirmed` is required before the wizard applies; the wizard seeds the owner's own Space. |
| **Cost / latency** | Uncapped fan-out could run away | Per-import `budget_spent` cap (§9e); per-feature daily caps in `lib/ai/budget.ts`; harvest cache prevents re-crawl. |
| **Image / logo rights** | A harvested logo/hero may be third-party IP | For **demos**: use as placeholder, flagged, clearable in one click; never assert ownership. For **owners**: they supply/confirm their own assets. Record source URL on every `site-media` upload. |
| **Un-verified facts** | Third-party facts can be wrong or stale | The §4 verification gate: commercial facts never auto-publish without a citation or human confirm. |

---

## 8. Phased build order (with concrete touchpoints)

Each phase ends green on the existing gates (`tsc`, `eslint`, `vitest`, `check:authz`, `check:menu`,
`check:rls`, `build`). Files listed are what the phase **extends**; the importer never edits the
block-editor files owned by the concurrent effort (`components/entity-blocks/*`, `lib/entity-blocks/*` are
**read-only** to this tool; the composer writes the jsonb they consume, it does not change their code).

| Phase | Deliverable | Extends / adds | AI? |
|---|---|---|---|
| **P0** | **Materializer core.** `applyIntake(draft)` -> seeded Space + function records + spotlight + accent, from a hand-authored `BusinessProfile`. Apply the real `business_intake` migration. | new `lib/business-import/materialize.ts`; calls `lib/spaces/provision.ts`, `lib/spaces/booking.ts`, `lib/spaces/memberships.ts`, `lib/spaces/membership.ts`, `lib/events/store.ts`, `lib/page-editor/upload-action.ts`; writes `spaces.preferences.profileLayout` (shape from `lib/entity-blocks/layout.ts`); new migration | ❌ zero AI |
| **P1** ✅ | **Harvest + Extract + Verify + ledger.** Shipped as `lib/importer/{harvest,extract,verify}/` (the P0 code landed under `lib/importer/`, not `lib/business-import/`) + `pipeline.ts`/`store.ts`/`queue.ts`, `lib/ai/web/`; uses `lib/ai/complete.ts`, `lib/queue/outbox.ts`, `lib/queue/handlers.ts` (`business-import-research` kind), `app/api/cron/process-queue`. Migration `20261022000000_business_intake.sql` (awaiting apply). | ✅ sonnet + opus |
| **P2** | **Reframe + Compose across the surfaces.** | new `lib/business-import/reframe.ts`, `compose.ts`, `spotlight-compose.ts`; uses `lib/ai/voice.ts`, `lib/spaces/accent.ts`, the Spotlight write actions in `app/(main)/settings/profile/spotlight-actions.ts` | ✅ sonnet |
| **P3** ✅ | **Operator Seeder console** (ADR-575). Landing (start form + status roll-up + intake list) + a per-import review board with field-by-field confidence (✅/⚠️/🔴), one-click provenance, marked AI copy, flagged WITHHELD commercial facts, inline edit/confirm/drop, and Approve -> Apply (unlisted demo default). | `app/(main)/admin/business-seeder/*` (page + `[id]` review board + `review-model.ts`, extends `actions.ts`); ONE row in `STUDIO_LEAVES` (`lib/nav/studio.ts`) — the operator-page nav, NOT `ADMIN_MODULES` (the scope RAIL); janitor + structure:write gated. | uses P1/P2 |
| **P4** | **Owner Wizard.** Vera-led conversational intake writing the same `business_intake` draft. | `components/templates/wizard-shell.tsx` + `wizard-progress.tsx`; Vera via `app/onboarding/vera-actions.ts : conciergeTurn`; new owner tools in `lib/ai/vera/tools.ts` (proposal-gated) | ✅ Vera |
| **P5** | **Polish.** Re-run diffing, confidence tuning, source manager, decay. | `demo-decay` cron; the `edited_fields` edit-wins marker; ledger tuning | tuning |

**P0 definition of done.** Given a hand-authored `BusinessProfile` JSON (no AI), `applyIntake` provisions
a **draft/unlisted** Space, writes its `profileData` + `profileLayout` + accent, seeds offerings /
availability / tiers / team / events / FAQ as present, uploads any provided image bytes to `site-media`,
and dresses the demo owner's Spotlight. Re-running is idempotent and preserves any operator edits. The Space
renders correctly at `/spaces/[slug]` (in-app) and, once the operator flips publish, at `/sites/[slug]`.
Covered by a vitest suite (materialize-from-draft, idempotent-re-run, edit-wins). All gates green.

---

## 9. Open decisions (resolved, revisable)

| # | Decision | Resolution (default) | Rationale | Revisable |
|---|---|---|---|---|
| a | Always-review gate for commercial facts | **YES.** Price/hours/address/phone/claims never auto-publish without citation or human confirm. | The whole point is trustworthy seeding; a wrong published price is worse than a blank one. Enforced in the materializer (§4.3), not just UI. | ✅ per-field confidence thresholds tunable |
| b | Seeded demos visibility | **Unlisted / draft** (`visibility='private'` or `websitePublished=false`, `is_demo=true`) until the operator flips live. | Consent + safety (§7): a business that has not opted in must not appear public. Decay via `demo-decay`. | ✅ operator can flip live per demo |
| c | The "website" surface | **`/sites/[slug]`**: a single-page public micro-site rendered from the Space Home doc, filtered for the `website` surface, gated by `visibility==='network'` AND `preferences.websitePublished===true`. Confirmed at `app/sites/[slug]/page.tsx`. NOT a separate site model, NOT multi-page (that is the paid `space_full_website`). | It is what actually renders a business to the world today. | ✅ if a multi-page publisher ships, the composer can target more `pageDocs` |
| d | Build order | **Operator-first (P0-P3), then Owner Wizard (P4).** | The operator seeder is the stated priority and the fastest path to demo businesses; the wizard reuses the same engine once it is proven. | ✅ P4 can move earlier if owner intake is prioritized |
| e | Per-import research budget cap | **A hard USD cap per import** (`budget_spent` vs a configurable `BUSINESS_IMPORT_CAP_USD`, default ~$1.50), plus the existing per-feature daily caps. | Fan-out over many subpages + adversarial verify can run away; the cap fails the import to `review` with partial results rather than spending unbounded. | ✅ cap value is config |

---

## Appendix A: draft staging migration

The unapplied draft migration lives at `supabase/migrations/DRAFT_business_intake.sql.txt` (the `.txt`
suffix and the DESIGN DRAFT header keep it out of any apply run). It is the concrete form of §3.1. **Do not
apply it** until P0 is approved; at P0 it is renamed to a timestamped `.sql` and applied via the house
process (Supabase SQL Editor, additive + idempotent, `lib/database.types.ts` regenerated separately).

## Appendix B: grounding map (files this spec reuses)

| Concern | File(s) |
|---|---|
| Space creation | `lib/spaces/provision.ts : createSpace` |
| Profile data + offerings + contact/hours | `lib/spaces/profile-data.ts`, `lib/spaces/content-data.ts` |
| Function records | `lib/spaces/booking.ts`, `memberships.ts`, `tickets.ts`, `membership.ts`, `lib/events/store.ts` |
| Layout jsonb | `lib/entity-blocks/layout.ts` (read-only), `spaces.preferences.profileLayout` |
| Accent | `lib/spaces/accent.ts` |
| Image upload | `lib/page-editor/upload-action.ts : uploadSiteMedia / uploadSiteMediaBatch` (bucket `site-media`) |
| Site surface | `app/sites/[slug]/page.tsx`, `lib/spaces/website.ts`, `lib/spaces/surface-visibility.ts` |
| Spotlight | `app/spotlight/[handle]/page.tsx`, `app/(main)/settings/profile/spotlight-actions.ts`, `profiles.meta.spotlight` + `meta.entityGrid` + `spotlight_top_friends` |
| AI core | `lib/ai/complete.ts`, `lib/ai/voice.ts`, `lib/ai/models.ts`, `lib/ai/budget.ts`, `lib/ai/events-ai.ts` (tool-use pattern) |
| Vera | `app/onboarding/vera-actions.ts : conciergeTurn`, `lib/ai/vera/*` |
| Wizard | `components/templates/wizard-shell.tsx`, `wizard-progress.tsx`, `app/onboarding/*` |
| Durable jobs | `lib/queue/outbox.ts : enqueue`, `lib/queue/handlers.ts`, `app/api/cron/process-queue/route.ts`, `lib/cron-auth.ts` |
| Menu registration | `lib/admin/modules/registry.ts` (ADMIN_MODULES), `docs/MENU-CONTRACT.md` |
| Demo precedent | `supabase/migrations/20260605090000_hubs_is_demo.sql`, `app/api/cron/demo-decay` |
