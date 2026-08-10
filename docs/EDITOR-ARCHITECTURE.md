# The editor architecture — one block model, many surfaces

> **The answer, first.** Frequency should author a block **once** and render it on a member's
> Spotlight, a Space's profile, a Space's external Site, and an email — with the content shared and
> the *display* varying by where it lands. That is not a new idea here: **email already does it**, and
> its docstring says so (`lib/entity-blocks/registry.ts:14-17`). What email needed was four concrete
> things, not an abstraction. Site needs the same four.
>
> Decision record: [ADR-972](DECISIONS.md) (the program) · [ADR-973](DECISIONS.md) (Loom authority,
> superseding [ADR-501](DECISIONS.md)). Authority order: **running code + `supabase/migrations/` >
> this doc > Notion.**
>
> Legend: ✅ built · ⏳ partial · 📋 specced, not built · 🔴 blocked / missing.
> Lift: **XS** under an hour · **S** one PR · **M** 1–3 PRs · **L** a wave · **XL** multiple waves.

---

## 1. The correction this document exists to make

The obvious framing — *"three fidelities: Spotlight minimal, Space standard, Site full"* — is wrong,
and wrong in a way that would have cost a rewrite. It collapses **three independent axes** the
codebase already separates.

| Axis | Decides | Today |
|---|---|---|
| **Kind** — `member \| space \| email` | Which blocks are **legal**, and the column ceiling | ✅ `kinds[]` per block (`lib/entity-blocks/registry.ts`), `MAX_COLUMNS_BY_KIND` (`layout.ts:133`) |
| **Surface** — where a kind is mounted | Which **renderer** runs, and how **densely** it paints | ⏳ ad-hoc `className` props |
| **Render target** — React tree vs HTML string | The output format | ✅ `ContentBlockView` (web) and `lib/email-studio/render.ts` (720 LOC, email) |

Two facts settle it:

1. **Density already varies within one kind.** `MemberProfileModules` defaults to `space-y-14` for the
   standalone Spotlight; `ProfileSpotlightBlocks` passes `space-y-6` for the in-app profile. Same
   `kind: 'member'`, two densities, shipped. A single `fidelity` enum has no slot for that.
2. **"Spotlight = minimal" inverts the live meaning.** `/spotlight/[handle]` is the *standalone,
   airier* mini-site; `/(main)/people/[handle]` is the dense one. Naming the standalone surface
   "minimal" would make the word mean the opposite of the route.

**So the real work is not a new enum.** It is:

- **Widen `kinds[]`** so commerce blocks (`offerings`, `booking`, `reviews`, `contact`, and a new
  `donations`) become legal on `member` — which requires member-side data adapters in
  `lib/entity-blocks/member-adapter.ts`, not new blocks.
- **Make density a declared, per-surface property** instead of a `className` passed by whoever
  happened to mount the component.
- **Give Site the four things email got**: legality (`kinds`), a column ceiling, a palette allowlist,
  and a renderer. Site's renderer is the web one, so it is the cheapest of the four surfaces to add
  — but it needs a published flag and a surface filter, both of which currently live only in git
  history.

---

## 2. Where we actually stand

### 2.1 Three parallel block systems, and the fragmentation is not where it looks

| System | Root type | Blocks | Storage | Renderer |
|---|---|---:|---|---|
| **Entity blocks** | `EntityBlockDef` (`lib/entity-blocks/registry.ts`, 252 LOC) | 36 | `spaces.preferences.profileLayout`, `profiles.meta.entityGrid` | `ContentBlockView` / `DesignBlockView` (web), `lib/email-studio/render.ts` (email) |
| **Puck-shaped** | `ComponentConfig` (`lib/page-editor/types.ts`, 195 LOC) | ~89 across 11,405 LOC | `pages.data` / `pages.published_data` | `lib/page-editor/block-render.tsx` (302 LOC) |
| **Layout modules** | `LAYOUT_MODULES` (`lib/widgets/modules.ts`, 730 LOC) | 157 | `page_settings.layout` | `lib/widgets/registry.tsx` |

⚠️ **`ENTITY_BLOCKS` is already one clean catalog.** The duplication is *between* it and the other
two. Any plan called "one block registry" that does not name the Puck set and `LAYOUT_MODULES` is
unifying the part that is already unified.

⚠️ **`page_settings.layout` has something the others lack**: a per-module `CommunityRole` gate
(`SlotConfig.roles[id]`) plus a scope cascade (exact route → `/seg/*` → `*`), per ADR-270/271/272.
Folding it in naively **loses per-module role visibility** — a regression, not a refactor.

### 2.2 Email is the working proof, and the constraint

`EntityKind` includes `email`. 14 of the 36 entity blocks declare it; `EMAIL_PALETTE_BLOCK_IDS` is
also exactly 14, so the offer and the renderer are locked to each other.

- 6 blocks are member + space + email: `heading`, `text`, `image`, `quote`, `divider`, `button`
- 7 are space + email: `callout`, `features`, `photoHero`, `editorial`, `cardGrid`, `displayHeading`, `prose`
- 1 is email-only: `productCard`
- **Zero `data`-category blocks support email**

That last line is the real invariant separating email from web, and it is not a density level. It is
*"can this block reach a live DB read at render time."*

🔴 **`productCard` breaks the `data`/`content` category split.** It is filed `content` but resolves
image, title, price and link from the live commerce catalog at send time
(`lib/email-studio/product-block.ts`). Before the registry is reshaped, decide whether **category**
or a new **`reads: 'live' | 'authored'`** field owns that property. This doc recommends the latter,
because category is already doing palette-grouping work.

🔴 **Email is on the send path of three crons** — `/api/cron/nurture`, `/api/cron/space-campaigns`,
`/api/cron/space-drips` — via `lib/nurture/runner.ts` and `lib/spaces/email-drafts.ts`. A change to
`KNOWN_BLOCK_IDS` or any block id ships straight into outbound mail, and **there is no visual gate on
email at all.** §7 adds one.

### 2.3 Site does not exist

`app/sites/[slug]/page.tsx` is a 70-line "Coming soon" card, `robots: { index: false }`. Its header
records that the real render — the `BlockRender` of the Home doc, filtered for the `website` surface
and fail-closed on `preferences.websitePublished` — **lives in git history**. `lib/spaces/surface-visibility.ts`
was deleted with it.

⚠️ [`WHITE-LABEL-SITES.md`](WHITE-LABEL-SITES.md) §2 claims *"Public site render — ✅ Exists"*. That
row is false today and is corrected in this pass.

### 2.4 Loom is an index that cannot resolve its own rows

`lib/apps/**` (2,572 LOC) projects five code registries into 349 uniform `App` rows and drives the
admin rail and both entity consoles. It is a real index. It is not a source of truth, not editable,
and not per-surface.

| Claim | Reality |
|---|---|
| `lib/apps/bindings.tsx` is the App→component resolver | **Deleted** as "orphaned, zero importers" — still imported by `catalog.ts:8`, `types.ts:8`, `app-registry.tsx:14` |
| `surfaces.page` names a page surface | Literal `{}` on all 157 rows; `defaultTemplate`/`defaultSlot` declared, read nowhere |
| Apps declare surfaces | All 349 declare exactly one. The multi-surface badge at `app-registry.tsx:243` has never fired |
| `App.config` is the editable Layer-2 schema | Populated on **zero** of 349 rows |
| `app_instances` is Layer 3 | Correct schema, 3 indexes, full RLS quad — **zero writers, zero readers** |
| `library_usages` is the live xref | 🔴 **Dropped by migration `20260925000000`**, five days after creation. The read discarded its error and silently returned `[]` |

[ADR-927](DECISIONS.md) already states the rule: *"a registry that cannot resolve its rows to a
component is a list, not a system — and a table with a perfect schema and no writer is a plan, not a
feature."*

### 2.5 Two Looms

[`LOOM-EVERYWHERE-PLAN.md`](LOOM-EVERYWHERE-PLAN.md) scopes Loom to **image uploads**;
`components/loom/` holds one file. This document uses "Loom" in the
[`LOOM-PLATFORM.md`](LOOM-PLATFORM.md) sense — the App catalogue and control plane. **Both meanings
are now live in the doc set.** When either is ambiguous, say "the Loom picker" or "the App
catalogue".

---

## 3. The block contract

One definition per block, in code, CI-gated. Everything else derives from it.

```ts
defineBlock({
  type: 'frq/offerings',
  v: 3,

  // ── AXIS 1: legality ──────────────────────────────────────────────
  kinds: ['member', 'space'],          // which entity kinds may hold it
  reads: 'live',                       // 'live' = hits the DB at render; 'authored' = self-contained
  binding: { source: 'offerings', gate: 'commerce' },

  // ── the content model, shared by every surface, forever ───────────
  content: z.object({ heading: z.string().max(80), limit: z.number().int().max(24), ... }),
  migrations: [{ id: 'offerings/2', up, down }, { id: 'offerings/3', up, down }],

  // ── AXIS 2: per-surface display ───────────────────────────────────
  surfaces: {
    'profile-inapp':       { density: 'compact',  fields: ['heading', 'limit'] },
    'spotlight-public':    { density: 'roomy',    fields: ['heading', 'limit', 'variant'] },
    'space-profile':       { density: 'standard', fields: ['heading', 'limit', 'variant', 'showPrice'] },
    'space-site':          { density: 'roomy',    fields: '*' },
  },

  // ── AXIS 3: render targets ────────────────────────────────────────
  render: {
    web:   () => import('./offerings.web'),     // one React component, density as a prop
    email: null,                                 // a `reads: 'live'` block is illegal in email
  },

  // ── MANDATORY. CI fails a block without it ────────────────────────
  toText: (c) => `${c.heading}: ${c.items.map((i) => i.title).join(', ')}`,
})
```

### The rules

1. **`content` is one schema, surface-independent, and never contains presentation words.** A
   surface's `fields` list is a *projection* of it — a subset — never a second schema.
2. **`kinds` gates legality; `surfaces` gates display.** A block absent from a surface is not offered
   there. This replaces the four overlapping allowlists that make "what can I add here" currently
   unanswerable (`CORE_PROFILE_BLOCK_IDS`, `KIND_PALETTE_EXCLUSIONS`, `EMAIL_PALETTE_BLOCK_IDS`,
   `MEMBER_CHROME_BLOCK_IDS`).
3. **`reads: 'live'` is the email boundary.** A live-reading block cannot render to an email string;
   the gate is mechanical, not editorial. This is the field that resolves the `productCard` anomaly.
4. **One React component per block, density as a prop.** Not one component per surface. Density is
   `compact | standard | roomy` and maps to a spacing/type scale, exactly as `space-y-6` vs
   `space-y-14` does today.
5. **Renderers are lazy imports.** A Spotlight visitor downloads the blocks that surface offers and
   nothing else. This is also what keeps the editor runtime off visitor pages.
6. **Every block ships `toText`.** Non-negotiable, CI-enforced (§7). It backs search indexing,
   notifications, screen readers, RSS, and the surface nobody has built yet. Slack Block Kit's
   mandatory `text`, oEmbed's `link` type and AMP-for-Email's required non-AMP part are three
   unrelated systems that converged on this; Notion is the counter-example, where an unspecified
   export tier produced emergent, user-visible breakage.
7. **Migrations are forward *and* backward.** `up` for reading old documents, `down` because a tenant
   on a pinned renderer will need a newer document migrated down. Retrofitting `down` later is
   impossible.

---

## 4. The document model

**Persist a tree. Derive a flat index at load.**

```ts
type BlockNode = {
  id: string                  // nanoid. STABLE FOREVER. The addressing scheme for AI ops,
                              // undo, presence, comments, analytics and app_instances.
  type: string
  v: number                   // this block's schema version
  content: Record<string, unknown>
  display?: Partial<Record<SurfaceId, Record<string, unknown>>>
  slots?: Record<string, BlockNode[]>
}
```

Three hard requirements this fixes:

- 🔴 **`rows-ops.ts:61` dedupes block ids globally**, and `content`/`style` are keyed by *block id*.
  **You cannot put two text blocks on one page today.** Acceptable for a profile, fatal for a Site.
  Key by node id instead. This is a storage-shape migration, not a UI change.
- 🔴 **`isRenderable()` discards the whole document if any block type is unknown**, falling back to a
  code template. Rename a block and every page using it silently reverts, destroying the author's
  work. Unknown blocks must round-trip byte-for-byte, render as a selectable placeholder in the
  editor and nothing on the live page.
- 🔴 **Publish overwrites `published_data` irrecoverably.** Immutable `page_versions` plus an op log;
  publish becomes a pointer swap.

### Placement identity

`app_instances.id` is by contract the placement id. Resolving [ADR-927](DECISIONS.md) §3 means
**writing to it** — the table already has the schema, the indexes and a complete RLS quad. This is
also `BUILD-LIST` **A2**, already specced under the App Platform block; E0 absorbs it rather than
duplicating it.

---

## 5. Loom — the four layers

[`LOOM-PLATFORM.md`](LOOM-PLATFORM.md) §3 already commits to this split. It needs finishing, not
designing.

| Layer | Lives in | Who edits | Example |
|---|---|---|---|
| **1 · Function** | Code, CI-gated | Engineers, via PR | Zod schema, migrations, renderers, `kinds`, `reads` |
| **2 · Config** | A table, edited in Loom | Operators | Which surfaces are on, entitlement gates, defaults, per-feature role floors |
| **3 · Instances** | `app_instances` | The editor, at placement | This block, on this surface, with this display config |
| **4 · Style** | Instance `style_override` | Operators | Token keys only, never colours |

**[ADR-973](DECISIONS.md) supersedes [ADR-501](DECISIONS.md) on authority, and caps execution.**
Operators may *declare* functions from Loom; a Loom-declared function is a **composition of typed
primitives and existing schemas, never arbitrary JavaScript**. That pairing is what makes it
affordable: the "we need a block that does X" loop without a plugin platform, a supply-chain surface
or a sandbox.

Consequence to design for: `check:menu`'s guarantee narrows from *"every menu row traces to a catalog
row"* to *"every **code** row traces."* Loom-declared functions need a **write-time integrity
validator** proving every composed function resolves to real primitives and real schemas.

🔴 **The usage index has to be rebuilt, not reused.** `library_usages` was dropped. Derive
`block_usage` from a trigger on `app_instances` plus a periodic scan of the JSONB documents, and
treat it as disposable and rebuildable. **It is a safety mechanism, not a reporting feature** —
consolidating blocks without being able to answer "which tenants use this" is how tenant pages break
silently.

### The pattern to copy

`element_settings` + `lib/elements/{registry,config,store}.ts` + `/admin/elements` + `check:elements`
is 342 LOC that already proves the whole loop: fail-safe to code defaults at every layer, per-feature
role gates on one context-switching ladder, an operator console, a CI guard, and
`resolveHeaderElement` demonstrating "edit the master, every occurrence updates."

**The change needed is one axis on its key**: `(element_key, space_id)` → `(app_id, surface, space_id)`.

⚠️ `check:elements` **fails a PR that declares a second `ElementDef[]` catalog** outside
`lib/elements/registry.ts`. Confirm the block registry does not trip it before E1 lands.

---

## 6. Vera as composer

The prototype ships. `lib/importer/compose.ts` ([ADR-577](DECISIONS.md)) is a Claude page designer: a
`compose_page` tool returns 3–5 named sections from a **fixed 15-block allowlist**, references photos
**by index rather than URL**, runs through `planToLayout()` (pure, unit-tested), and has
`sanitizeEntityLayout` applied again at materialize. Its header states the doctrine: *"SAFE BY
CONSTRUCTION: the model chooses from a FIXED block allowlist and references photos by INDEX (never a
raw URL), so it can neither invent a block nor inject an image."*

`reseedBlockCopy` already mints a tool schema per block from `fieldsForBlock(blockId)` so *"the model
can only ever write to this block's real field keys."*

**Generalizing it from 15 blocks and one surface to the full registry and four surfaces is the work.**

### The pipeline — and where the model is allowed to touch it

| Stage | Who | What |
|---|---|---|
| Theme resolution | **Code** | Curated personality → token set; brand extraction from a URL. The model receives token *names*, never values. A model that never sees a hex cannot emit one |
| Page plan | **Model** | Strict tool use over a closed enum of archetypes. Rationale field **before** the plan field |
| Slot fill | **Model ×N** | One constrained call per section. Parallel, cacheable, individually re-rollable |
| Compose | **Code** | Pure TypeScript, plan → document. Zero model involvement. This is why layout cannot be wrong |
| Validate | **Code** | Schema, tokens, contrast, em-dash, naming canon, CTA presence, length bounds |
| Critique | **Model** | Against the rendered screenshot **plus** the validator findings. Bounded at 2 rounds, early exit when clean |

Three constraints from the literature that shape this:

1. **There is no temperature knob.** On Opus 5 / Sonnet 5 / Opus 4.7–4.8, `temperature`, `top_p` and
   `top_k` are removed and return a 400. Diversity comes from **prompt-angle variation and parallel
   sampling** (N=3: benefit-led / proof-led / invitation-led), not decoding parameters.
2. **Structured output costs reasoning, mostly in the asking.** The measured "format tax" is ~10–15%,
   dominated by a prompt-level component. Keep each call's schema small, and put rationale fields
   *before* answer fields — an answer field that precedes its reasoning commits the model early.
3. **Self-critique works only with external signal.** Intrinsic self-correction fails and can degrade
   output. Never ask "is this good?" Ask "here is the screenshot, here are six failing validator
   findings, fix these."

### Three enforcement layers

| Layer | Job |
|---|---|
| **1 · Structural** | The model emits token names from a closed enum and slot content in typed fields. Makes most token rules unbreakable rather than checked |
| **2 · Validators** | Deterministic, no model, blocking. Runs in CI *and* in the critic loop so findings are the feedback channel |
| **3 · Judge** | Advisory only, for what 1–2 cannot see. Rubric-decomposed, randomised order averaged both ways, **a different model than the generator** |

Layer 3's constraints are not fussiness: LLM judges carry documented **position bias** (worst when
candidates are similarly good — the common case), **verbosity bias** (prefers the wordier variant,
directly opposed to the voice canon) and **self-preference**.

### Raw CSS, and the hole it opens

Operators **and Vera** may write raw CSS ([ADR-972](DECISIONS.md)). That removes layer 1's coverage,
so layer 2 grows to compensate: a **CSS property allowlist and value validator** runs on every
declaration from either author. Reject anything that escapes its block container
(`position: fixed|absolute`, unbounded `z-index`, negative margins past a bound), anything that
exfiltrates or injects (`url()` off-allowlist, `content:`, `@import`), and `!important`. Any colour
declaration is contrast-checked against the resolved surface token. **The same validator for both
authors** is what keeps it honest.

### Prompt injection

The brief, the imported URL, the tenant's copy and any CMS data are all attacker-controlled relative
to the system prompt. A **quarantined extractor** with no tools and no write access reads tenant
content and emits only a strict typed brief object; the **privileged composer** never sees raw tenant
text. Operator instructions ride `{role: "system"}` appended mid-conversation in `messages[]` — the
one channel that cannot be forged, and cache-preserving unlike editing the top-level system prompt.

### Multi-turn editing

Level-of-detail projection, per tldraw's agent kit. The agent never receives the document:

- **Outline** (always) — `[{ id, type, oneLineSummary }]`
- **Focused** (1–3 nodes) — full typed content
- **Rendered** (critic only) — a screenshot

Four tools, not forty: `read_page(scope)`, `plan_page(intent)`, `apply_edits(edits[])` — one coarse,
batched, atomically-undoable mutation — and `validate()`, which is the external-feedback channel that
makes the critic loop work.

### Autonomy

Propose-and-confirm remains the law ([ADR-028](DECISIONS.md), [ADR-066](DECISIONS.md)). **Every Vera
change is a reviewable diff** — ghosted overlays on the canvas, default not-applied, per-section
accept. The accept/reject events double as the quality telemetry that tunes the archetype library.

### AI-layer gaps to close first

| Gap | Why it blocks |
|---|---|
| 🔴 No streaming anywhere | Zero `.stream(` hits. A chat that blocks for seconds per turn is not the product |
| 🔴 No per-Space retrieval | Vera has only `name / type / brandName / about`. `lib/ai/space-copilot.ts:18-22` names this deferred |
| 🔴 No zod in any AI path | Hand-written JSON Schema + hand-written `coerce*` per tool does not scale past ~30 sites |
| ⚠️ Vera's loop does not cache its system prompt | Re-sends voice primer + persona + tool schemas every round. Contradicts [ADR-041](DECISIONS.md) |
| ⚠️ No rate limit on Vera chat or any composer | Only `/help/ask` is limited |
| 🔴 `lib/ai/models.ts:27` prices Opus at `{15, 75}` | Opus 4.8 is **$5/$25**. Every Opus path is ledgered at **3×**, so caps trip at a third of intent and the $25/day ceiling is really ~$8 |

---

## 7. Guards — what proves each phase worked

**The premise:** a rebuild of the rendering layer is exactly the change class the visual suite exists
to catch, and that suite is red. Guards are therefore not a finishing step; they gate each phase.

### 7.1 The prerequisite

🔴 **[`FINALIZE-PLAN.md`](FINALIZE-PLAN.md) Phase 1 must complete before E1.** All 72 visual
baselines were written on 2026-08-05 in one commit and are now many rendering commits stale;
`pr-compare` has been red on every run; `app-room` has no baselines; the a11y ratchet holds 40
contexts and **zero member-shell**. Until 1.2 (recapture from a settled `main`) runs, a total
regression and a perfect refactor produce the same red X.

🔴 **Branch protection is a five-minute owner action worth more than any gate below.** `ci.yml:37-46`
records it: required contexts are `checks` and `analyze` only, so `lint`, `test` (704 files, 8,874
tests) and `pr-compare` **cannot block a merge**. A PR with failing tests is mergeable today.

### 7.2 New gates

| Gate | Asserts | Kind |
|---|---|---|
| `check:blocks` | AST manifest over the registry: every block resolves to a renderer for **each declared surface**; `toText` present; migration chain complete and contiguous; `content` is a Zod schema; `reads: 'live'` implies no email renderer | Hard |
| `check:doc-safety` | A frozen corpus of real stored documents round-trips through the registry with **zero loss** — unknown types preserved byte-for-byte | Hard |
| `check:surface-binding` | Extends `check:menu` (rule 6): every App carrying a surface resolves to a component. The guard whose absence let `surfaces.page = {}` ship 157 times | Hard |
| `check:loom-integrity` | Every Loom-declared function resolves to real primitives and real schemas | Write-time |
| `check:email-blocks` | No `reads: 'live'` block reachable from `EMAIL_PALETTE_BLOCK_IDS`; `KNOWN_BLOCK_IDS` ⇄ renderer switch bijection | Hard |

### 7.3 Ratchets

Added to `scripts/adoption-baselines.json`, which already enforces provenance integrity, a basis
fingerprint and asymmetric merge — falls auto-write, **a rise is refused** without `--allow-raise`
and a reason, and stays flagged forever.

| Key | Baseline | Direction |
|---|---:|---|
| `block-systems` | 3 | → 1 |
| `unbound-app-surfaces` | 157 | → 0 |
| `block-types-total` | ~138 | → ~60 |
| `blocks-without-totext` | all | → 0 |
| `raw-css-overrides` | 0 | visibility only, may rise |

### 7.4 Equivalence harnesses

The model already exists: `lib/page-editor/block-render.test.tsx` — 18 inline snapshots of
`renderToStaticMarkup`, blocks chosen so they need no providers, and **a dated re-baselining
changelog in the file header** stating that any diff showing something other than the logged change
is a real regression. That converts a snapshot from a rubber stamp into a gate. The cross-layer
precedent is `components/templates/event-detail-template.equivalence.test.tsx`.

Build, in this order:

1. **Old ⇄ new renderer**, per block, per surface. `renderToStaticMarkup(current)` vs
   `renderToStaticMarkup(new)`. Needs no browser and no preview, so it **works while the visual suite
   is red**.
2. **Golden markup per (block × surface × density)**, generated from the registry rather than
   hand-written, so the combinatorics stay enumerable.
3. **Email golden strings** — the only gate email will ever have, and it sits on three cron send
   paths.
4. **RSC ⇄ canvas parity** — the same document rendered server-side and in the editor canvas must
   match, or hydration mismatches ship.

### 7.5 Runtime safety

🔴 **There is no kill switch for the render path.** `platform_flags` carries dozens of switches — AI,
demo mode, SMS, referrals, feed, billing, every plan and tier gate — and not one reverts a surface
from templates to the coded body. No seeded flag key matches `render`, `template`, `block`, `page` or
`editor` except `circle_templates_enabled`, which is about circle seeding. **E0 adds `render_path`**,
per surface. There are no down-migrations and no rollback convention anywhere
in the repo, so a runtime flag is the only reversal mechanism a phase will have.

### 7.6 Process guards

- **Every phase ships behind its flag**, dark, before cutover.
- **Shadow render** before each cutover: render both paths, diff, log the delta, cut over when the
  delta is zero or explained.
- **Batch rendering changes, capture once** — [`FINALIZE-PLAN.md`](FINALIZE-PLAN.md) states this as
  non-negotiable while `pr-compare` is not required.
- **`check:render-path` has an exact-match ratchet** (`scripts/render-path-bodies.txt`). Any PR
  touching the 8 gated route files must edit the baseline **in the same PR**.

---

## 8. Phases

| # | Phase | Lift | Gate |
|---|---|:---:|---|
| **E0** | Foundations. Node-id keying, unknown-block preservation, `page_versions`, `app_instances` writers (absorbs **A2**), undo + `base_revision`, the `render_path` flag, surface-vocabulary reconciliation | **L** | `check:doc-safety` green on a real-document corpus; every phase reversible by flag |
| **E1** | Block contract. One registry, Zod schemas, up/down migrations, the binding layer, `check:blocks` + `check:surface-binding` | **L** | Every registry row resolves to a renderer for every declared surface |
| **E2** | Loom projection + usage index. **Then** consolidate toward ~60 blocks | **XL** | "Which tenants use this block" is answerable *before* the first retirement |
| **E3** | Axis work. Widen `kinds[]` to `member` + member data adapters; density as a declared property; Site's four things | **L** | Spotlight, in-app profile, Space and Site render off one registry with zero visual diff |
| **E4** | Canvas. Same-origin iframe, portalled tree, `bubbleEvent` + coordinate translation, parent-document overlays, inline Tiptap | **L** | Click-to-edit on every surface; RSC ⇄ canvas parity green |
| **E5** | Inspector + responsive. Fields from schemas, sparse breakpoint overrides with provenance, device switcher, container queries | **M–L** | Real viewports, not simulated widths |
| **E6** | Direct manipulation. Drag/drop, layer tree, keyboard model, spacing handles, presets-first inserter | **L** | Keyboard path complete |
| **E7** | Functional blocks. The five transactional widgets made placeable, the form block, the donations Stripe path | **L** | Placeable at every legal surface |
| **E8** | Vera. Streaming, per-Space retrieval, composer generalized, three validator layers, bounded critic, diff review | **L** | One prompt → a valid, reviewable, single-undo page |
| **E9** | Loom authoring. Layer-2 config editing, per-surface settings console, declarative composer, `check:loom-integrity` | **M–L** | An operator composes a function without a deploy |
| **E10** | Sites. Domains, host routing, per-tenant theming, per-tenant SEO. Absorbs **W1–W5** | **L** | — |

**Honest total: eight L, one XL, two M–L.** A multi-quarter program. E0–E3 carry roughly half the
risk and produce almost nothing visible; E4 is the first point where the thing is demonstrable.

---

## 9. Sequencing collisions

| Collision | Detail |
|---|---|
| **`EDITABLE_PAGES`, two directions** | [UX-MATURITY Lift 5c](UX-MATURITY-PLAN.md) *grows* the constant for root marketing routes and is the current "Next" wave; 5d adds 8 seeker articles. `BUILD-LIST` **W3** *replaces* it with per-Space resolution. E3 must land after 5c/5d or one silently undoes the other |
| **`check:render-path`** | Live, exact-match. Its baseline must fall in the same PR that retires a body |
| **`BUILD-LIST` A2** | Already specs the `app_instances` instance contract. E0 absorbs it; do not build it twice |
| **Visual suite** | FINALIZE-PLAN 1.2/1.3 are hard prerequisites for E1 |
| **`cacheComponents`** | 🔴 **Not adoptable.** Zero `revalidateTag` calls, 1,094 `revalidatePath`, 51 `export const revalidate` (which `cacheComponents` rejects), 242 `force-dynamic`. Adopting it means rewriting the invalidation strategy, not flipping a flag. Out of scope for this program |

---

## 10. Open questions

1. **Does Site become a fourth `EntityKind`, or a surface of `space`?** This doc assumes a surface,
   because Site renders the same entity's data with the same web renderer. If Sites are ever to hold
   blocks a Space profile may not, it becomes a kind.
2. **`reads: 'live'` vs category.** Recommended above; confirm before E1 freezes the contract.
3. **Member commerce.** Widening `kinds[]` to `member` requires adapters that do not exist. Which
   capabilities does a Spotlight actually get — and does a member need a Stripe account for them?
4. **Loom's usage index shape.** Trigger-maintained table, periodic scan, or both.
5. **Density scale.** Three steps (`compact | standard | roomy`) is proposed. Confirm before E3.
