# Theme cohesion: role blocks, a theme manifest and a switch that cannot leave a hole

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** (rows `LIVE-1790` to `LIVE-1807`; `pnpm backlog`).
> This document is the spec and the rationale. It records no status. Decision: [ADR-1923](DECISIONS.md).
> Evidence (audit, research, contact sheets) is in the project folder `theme-cohesion/`.

**Owner picks, 2026-10-29:** build role blocks and the manifest, phased; existing theme-named blocks on live sites are never changed automatically (owners press "Update to new layouts"); on a switch, layouts the owner never customised take the new theme's defaults; theme CSS becomes static files after a measurement; kit threads keep building and add a role note per block; the first thing to ship is the safety net.

No code until Daniel picks (owner picks are at the end). Evidence is in [01-audit.md](01-audit.md), precedent in [02-research.md](02-research.md). Status of any row lives in `docs/BUILD-BACKLOG.json` once the rows below are filed as ledger fragments; this file is the plan.

## The answer first

Stop treating "Nocturne Proof", "Network kit Proof" and "Designer Testimonials" as three blocks. They are one **role** (Proof) with three presentations. Make the role the block, give every role a fixed slot contract and 3 to 5 named layout variants, and let each theme supply a **presentation**: tokens plus the few decorations that make it drastically different (frame shapes, ornaments, type, section chrome, default variants). Then:

- A theme switch changes tokens, presentation and default variants. It cannot orphan a block, because there is no theme-named block to orphan.
- Themes stay drastically different, because presentation is theirs and structure is chosen per role by variant, not forced to match.
- The editor, the picker, "Try it on" and the design-system intake all read one **theme manifest** per theme, so there is one place that says what a theme is and which roles it covers.
- A CI **conformance check** fails when a theme leaves a role unstyled or breaks the token contract, with a baseline that can only shrink (the shape `ds-intake` and `check:tokens` already use).
- The switch is fast because theme CSS becomes a static versioned file and the markup is theme-independent: preview is a stylesheet swap, publish is one cache revalidation.

Live sites never change on their own. Every legacy block type keeps rendering exactly as today on its own theme. Migration to role blocks is opt-in per page, by the owner.

## Why this and not something smaller

Two cheaper options exist and the proposal contains both as phase 1:

- **Generalise the Network island** so any family block gets a neutral, token-driven fallback skin on a foreign theme. This removes the unstyled holes (the 0.04 to 0.25 coverage rows) in one change. It does not make themes cohesive or varied, and it keeps seven vocabularies alive.
- **Lock family blocks to their home theme** (palette hides them on other themes). Prevents new holes, does nothing for existing pages.

Role blocks are the structural fix. Phase 1 is the safety net while they are built.

## 1. The token contract

One set of names every role block may read. Eight groups, about 45 names. These are semantic, in the three-tier sense of `docs/THEME-PROTOCOL.md` §3 (primitives, semantic, component). Raw values stay only in token files; `check:tokens` still applies.

| Group | Names | Notes |
|---|---|---|
| Ground | `--c-canvas`, `--c-surface`, `--c-raised`, `--c-sunken` | page, card, lifted card, inset |
| Ink | `--c-text`, `--c-text-muted`, `--c-text-subtle`, `--c-on-accent` | `on-accent` is measured per accent (the Accent buttons rule, #4261) |
| Accent | `--c-accent`, `--c-accent-hover`, `--c-accent-soft`, `--c-accent-bg`, `--c-accent-deep`, `--c-accent-text` | the owner's brand accent re-binds this group only |
| Line | `--c-line`, `--c-line-strong` | hairlines |
| Shape | `--r-control`, `--r-card`, `--r-panel`, `--r-media`, `--frame` | `--frame` is a clip or radius for media: `rect`, `arch`, `round`, `angled` values |
| Depth | `--shadow-card`, `--shadow-lift` | may be `none` (Nocturne) |
| Type | `--f-display`, `--f-body`, `--f-label`, `--f-voice`, `--w-display`, `--track-display`, `--case-heading`, `--lead-display` | voice is the serif-italic accent face (Instrument Serif, Cormorant) |
| Rhythm | `--sp-section`, `--sp-gap`, `--sp-gutter`, `--measure` | feeds the existing look axes (Spacing: airy, balanced, compact) |
| Motion | `--dur-fast`, `--dur`, `--ease` | `prefers-reduced-motion` honoured once, in the token block |

Rules:

1. A role block's structural CSS reads **only** contract names. No `--mn-`, `--nk-`, `--dz-` inside a role block.
2. A theme's **presentation layer** may use its private tokens, scoped to `[data-theme="<id>"] [data-role]`. This is where Temple's arch, Nocturne's grain and Wildheart's petal corners live.
3. Each theme maps its existing vocabulary onto the contract in one generated file. A pin test proves the computed values equal today's (nothing moves on a live site). Today's `--th-*` contract (`lib/sites/editor/theme-contract.json`) is the seed.
4. The owner's Look axes (corners, spacing, header, footer, fonts, accent) already override per site. They become overrides of contract names, which is what they effectively are today.
5. Violet #5B3FD0 stays banned; #B094FF is allowed for Nocturne and the Business kit. Design source stays `design_handoff/frequency/`, never edited.

## 2. The block contract

A role is the unit. About 16 roles recur across the families (table below); the shared blocks already cover many.

| Role | Shared block today | Nocturne | Network kit | Network | Designer | Temple / Kit | Variants to ship |
|---|---|---|---|---|---|---|---|
| Hero | Hero, PhotoHero, Cover | MidnightHero | NetworkKitHero | NetworkHero | DesignerHero | TempleHero, TempleKitHero | split, full-bleed, center, minimal (Network kit has 4) |
| Statement / Band | Statement, ValueBand | MidnightBand | – | NetworkBand | DesignerStatement, DesignerBand | – | band, pull, ticker |
| Steps | DawnHowToSteps, BuildTimeline | MidnightJourneys | NetworkKitSteps | NetworkSteps | DesignerSteps | TempleKitSteps | grid, timeline, strip |
| Offerings | FeatureGrid, SpaceOfferings | MidnightOfferings | NetworkKitOfferings | NetworkOfferings | DesignerServices | TempleKitOfferings | list, cards, split |
| Gatherings | LiveEvents, SpaceEvents | MidnightGatherings | NetworkKitGatherings | NetworkEvents | – | TempleEvents, TempleWeek, TempleKitGatherings | split, calendar, cards, rows |
| Membership | Tiers | MidnightMembership | NetworkKitMembership | NetworkTiers | – | TempleTiers | tiers, table, spotlight |
| Proof | Quote, CardGrid(testimonial) | MidnightProof | NetworkKitProof | – | DesignerTestimonials, DesignerQuote | – | quote, wall, stats |
| FAQ | Accordion, SpaceFAQ | MidnightFAQ | NetworkKitFAQ | – | DesignerFAQ | TempleFAQ | split, stack |
| CTA | CallToAction | MidnightCTA | NetworkKitCTA | – | DesignerClosing | – | center, split, band |
| Letter / Follow | SpaceJoinList | MidnightLetter | NetworkKitLetter | – | – | TempleFollow | band, card |
| Contact / Inquiry | SpaceContact | MidnightContact | NetworkKitContact | NetworkContact | DesignerInquiry | – | form, project, consult |
| Stats | StatRow, LiveStats | – | NetworkKitStats | NetworkStats | – | – | row, cards |
| Shop | – | MidnightShop | NetworkKitShop | NetworkMerch | – | – | grid, rail |
| Library | – | MidnightLibrary | NetworkKitLibrary | – | – | – | grid, list |
| People | SpaceTeam | – | – | NetworkFounder, NetworkTeam | DesignerFounder | – | founder, team grid |
| Gallery | Gallery, PhotoTrio, Image | – | NetworkKitSocial | NetworkMedia | DesignerPortfolio, DesignerGallery | TempleKitRooms | grid, mosaic, carousel |
| Chapters / Circles | CirclesGrid | – | NetworkKitChapters, NetworkKitCircles | NetworkChapters, NetworkCircles | – | – | grid, finder |

Variant lists above are what already exists somewhere in the code (Network kit has the richest) so variants are mostly a port, not an invention. Every role also gets one **editorial** default per theme so a new block looks designed on arrival.

**Signature blocks stay outside the contract**: the Wildheart astrology family, Nocturne recordings and archive, the Network countdown. They are palette-scoped to their home theme (so they cannot be added elsewhere) and each declares a **fallback role** (a year journey falls back to Gatherings/calendar) so a switch still shows something sensible.

### What a role declares

```jsonc
// lib/blocks/roles/proof.role.json  (illustrative shape, not final)
{
  "role": "Proof",
  "replaces": ["Quote", "MidnightProof", "NetworkKitProof", "DesignerTestimonials", "DesignerQuote"],
  "slots": {
    "required": { "items": { "type": "list", "min": 1, "max": 12, "item": {
        "quote": "text<=280", "name": "text", "role": "text?", "photo": "image?", "rating": "1-5?" } } },
    "optional": { "eyebrow": "text", "heading": "text", "cta": "link" }
  },
  "variants": { "quote": { "max": 3 }, "wall": { "min": 3, "max": 12 }, "stats": { "needs": ["stats"] } },
  "tokens": ["c-surface","c-text","c-accent","r-card","f-display","f-voice","sp-section"],
  "parts": ["heading", "item", "quote", "person", "photo", "cta"],
  "data": null,                       // "events" | "offerings" | "plans" | "faqs" for live roles
  "sample": { "items": [ /* placeholder words, flagged sample: true */ ] }
}
```

- **Slots** are typed, required or optional, and have limits. A switch never needs content the owner did not already give, because slots belong to the role, not the theme.
- **Variants** are structural and theme-independent. The owner picks one in the block panel; the default comes from the theme (below).
- **Parts** are the stable hooks (`data-part="media"`). Presentation CSS targets parts, never class soup, so a theme can arch the photo or set the quote in its voice face without a new block.
- **Tokens** are the read-list. The conformance check verifies the block reads only these.
- Blocks keep rendering as Server Components with no client JS unless a role needs it (calendar, finder), matching the rule for the shared site sections.

### Per-theme variant defaults, with owner choice winning

The manifest lists each theme's preferred variant per role (Nocturne Proof: `quote`, full-bleed; Network: `wall`). On a switch:

- A block whose variant was **never set by the owner** takes the new theme's default. That is what makes switching feel like a redesign, not a recolour.
- A block whose variant the owner **chose** keeps it (stored as `variant`, and `variantSet: true`).

This is the single biggest lever for "drastically different". Default structure differs per theme; the owner can still pin it.

### Legacy block types

Nothing is rewritten. A resolver maps each legacy type to `{role, variant}` (`MidnightProof` is `Proof/quote` with Nocturne parts). On its own theme a legacy block renders through its existing component, byte for byte. Off its own theme (the hole today) it renders through the role with the active theme's presentation. A per-page **"Update to new layouts"** action converts legacy blocks to role blocks as one undoable editor step, previewed first, with a diff of what changes. No Space is converted without the owner pressing it.

## 3. The theme manifest

One file per theme, `themes/<id>/theme.manifest.json`, validated by a schema, read by four consumers: the **catalog** (/themes pages and the picker), **Try it on**, the **editor** (theme tab, palette, switch dialog) and the **design-system intake** (`scripts/ds-intake.mjs`). `lib/themes/library.ts` and the tables in `lib/theme/mega-theme.ts` become generated from it; they stay as thin readers, so no consumer breaks.

```jsonc
{
  "$schema": "./theme-manifest.schema.json",
  "id": "midnight",
  "legacyIds": ["Midnight"],                 // editor id, site id: never removed
  "name": "Nocturne",
  "status": "ready",                          // ready | hidden | parked (picker visibility, replaces the 'soon' prose)
  "lineage": { "designSystem": "docs/design-systems/nocturne", "kit": "midnight-*", "version": 3 },
  "voice": {                                  // moved from THEME_LIBRARY, same words
    "tagline": "…", "madeFor": "…", "signature": "…"
  },
  "personality": { "ground": "dark", "contrast": "high", "density": "airy", "shape": "square", "ornament": "grain", "type": "high-contrast serif" },
  "tokens": {
    "light": { "c-canvas": "…", "c-accent": "…" },   // generated from the design zip, never hand-edited
    "night": null,                                    // optional second mode
    "fonts": [{ "role": "display", "family": "Bodoni Moda", "weights": [400], "file": "…" }]
  },
  "presentation": { "css": "midnight.presentation.css", "privateTokensPrefix": "mn" },
  "roles": {                                  // the conformance surface
    "Hero":        { "level": "native",   "variants": ["split","full","center"], "default": "full" },
    "Proof":       { "level": "native",   "variants": ["quote","wall"],          "default": "quote" },
    "Shop":        { "level": "contract", "variants": ["grid"],                  "default": "grid" }
    // level: native (presentation hand-built from the design) | contract (token-skinned, no presentation) | missing (fails CI unless baselined)
  },
  "signature": ["MidnightRecordings", "MidnightArchive"],
  "surfaces": { "website": "ready", "spotlight": "ready", "email": "ready", "space": "ready" },
  "kits": [{ "id": "midnight-coaches", "niche": "coaches" }],
  "tools": ["booking", "calendar", "memberships", "shop"],   // checked against roles: Shop tool needs the Shop role
  "assets": "public/themes/midnight/"        // THEME_ASSET_SLOTS stays the slot list
}
```

What it replaces: `THEME_LIBRARY` prose and surface flags, `MEGA_THEMES` id table, `WEBSITE_THEME_FONT_VARS`, parts of `theme-contract.json`, the per-theme `THEME_DRAFT_NAME` table, the "ready/soon" statuses, and the intake's `rules.json` target list (which points at this file). The old theme ids stay as `legacyIds` forever.

**Catalog and picker (the "new way to catalog")**: the library becomes filterable by the manifest's own fields instead of by hand-written cards: ground (light, dark), density, shape, ornament, role coverage ("has a shop", "has a calendar"), surface readiness, and niche kit. A theme's card is rendered from its manifest plus its own pictures. Adding a theme adds a card; nobody edits the index.

**"Try it on" with the Space's own content**: the picker previews a candidate theme over the Space's actual pages (its words, photos, events), not a sample site. This works because markup is theme-independent (section 4). It answers "what would my site look like", which is what an owner is actually choosing.

## 4. The fast switch path

Today a theme change means a server render that inlines a 40 to 100 KB sheet for that theme into every page's HTML. The proposal moves three things.

1. **Static, versioned theme CSS.** At build, each manifest compiles to `/_themes/<id>.<hash>.css` (contract tokens + presentation + role CSS). The site render emits `<link rel="stylesheet">` and `data-theme="<id>"` instead of inlining. Files are immutable and cached by the browser across pages and across sites on the same theme. Cost: one more request on a first visit, fewer bytes on every later page. HTML under ISR gets smaller. **Open check:** measure on a real built site before committing (Lighthouse config exists in `lighthouserc*.json`); keep inline as a fallback if the first-visit cost shows.
2. **Theme-independent markup.** Role blocks emit the same DOM for every theme (`data-role`, `data-variant`, `data-part`). The theme is attributes and a stylesheet. That is the property that makes everything below instant.
3. **Preview is a client swap, publish is one revalidation.**
   - Try it on, in the picker and the editor: swap the `<link>` and `data-theme` on the live canvas. Prefetch the next theme's file on hover (`rel=prefetch`). No server render, no network wait once cached.
   - Publish: write the theme to the snapshot (as now) and revalidate that Space's cache tag, so the next visitor regenerates one page set. No rebuild of the app, no Vercel deploy.
   - Legacy family blocks on their own theme keep their old DOM; in a Try-it-on preview they show the contract-skin fallback (phase 1), flagged as "this block will use a new layout".

**Constraints I am designing to** (from `docs/DEPLOY-SAFETY.md` and AGENTS.md): theme CSS is a static asset, not an import, so it cannot fan out through the root layout or a shared server module; the public render imports only `{themeId} → cssUrl`, not any theme's content; any new gate ships in the same PR as the green build that proves it; site renders stay anonymous and cacheable. **The theme fence holds:** theme CSS is served only to the stand-alone site render and the editor canvas. A walking test extends `app/(main)/no-site-theme-in-member-area.test.ts` to fail if a member route links a theme file.

## 5. The conformance check

`pnpm check:theme-conformance`, a vitest sibling like `scripts/design-system.test.ts` (declared in `VITEST_ENFORCED`), so it runs in the required `test` job and needs no build. It is the productionised version of the harness behind the audit.

For every theme in the manifest, for every role and variant it declares:

1. **Contract tokens.** Every contract name resolves to a non-empty value, and any raw colour or size literal in role or presentation CSS fails (`check:tokens` already scans the sheets).
2. **No orphan classes.** Render the role with its sample and require that every themed class has a rule in the theme's sheet, the same measure used for the coverage table (target: 1.00 on declared roles).
3. **Variants render.** Each declared variant renders non-empty with sample content.
4. **Declared equals real.** A manifest `level: native` role must have presentation rules; `contract` must have none or only contract-token rules; `missing` is allowed only while the id is in the baseline.
5. **Tools need roles.** A tool listed in the manifest (shop, calendar, memberships, donations) requires its role at `native` or `contract` level.
6. **Signature blocks declare a fallback role.**
7. **Pixel checks, nightly not required.** Playwright renders each role at 1280 and 390 per theme and flags horizontal overflow and zero-height blocks (this would have caught the Bold Hero clip). Contact sheets are published as a build artifact, not committed.

A baseline file records today's gaps (every family-to-foreign cell, plus declared `missing` roles). It can only shrink: a healed gap that stays in the baseline fails as "healed", a new gap fails as "fresh". That is the `ds-intake` behaviour, so it is a known shape for this team.

## 6. Phases and ledger rows

Phased so that nothing live changes until an owner presses a button. Sizes: S under a day, M one to three days, L three to seven. The rows are filed as `LIVE-1790` to `LIVE-1807`, one row per PR under the 40-file gate, one fragment per row. "Lift" says what improves and for whom, without invented numbers; the measures to take are named.

### Phase 0: measure (no behaviour change)

| Row | What | Size | Lift | Probe that fails today |
|---|---|---|---|---|
| LIVE-1790 | Productionise the audit as `pnpm audit:themes`: render matrix, coverage JSON, contact sheets, baseline of every hole | M | Makes holes visible and ratchets them. Prerequisite for everything. | `audit:themes` baseline file exists and lists the 95-block foreign gap |
| LIVE-1791 | Reproduce and fix the three audit defects in a built site: Bold Hero at 390, Default sections drawing bare (may be harness only), Showcase ignoring the theme | S | Direct visible fixes | A render test per defect |
| LIVE-1792 | Honest copy: theme-changer says which blocks will look different; fix "Every theme carries all of them" in `THEME_TOOLS` to match what each theme can show | S | Removes a false promise | Text pin in `theme-changer` test |

### Phase 1: safe switching (editor-time; published sites untouched)

| Row | What | Size | Lift | Probe |
|---|---|---|---|---|
| LIVE-1793 | Generalise the Network island into a **contract-skin fallback** for every family block (generated from each family's structural classes, token-driven in the active theme's palette) | M | Removes unstyled blocks on any switch: the 0.04 to 0.25 coverage rows go to the island's 0.99 | Foreign-theme coverage for all families at or above 0.9 in `audit:themes` |
| LIVE-1794 | Palette by theme: the editor offers a family only on its home theme, plus shared and role blocks; existing foreign blocks stay and render via LIVE-1793 | S | Stops new holes | `palette-scope.test.ts` pins family-per-theme |
| LIVE-1795 | Switch dialog and preview: before a theme change, list blocks that will use a fallback layout; one undoable step (theme drafts already hold several themes over one set of pages) | M | Owner sees the consequence first | Editor test: switch with a foreign block shows the list |

### Phase 2: the contract

| Row | What | Size | Lift | Probe |
|---|---|---|---|---|
| LIVE-1796 | Core token contract and one generated mapping file per theme; pin test proves computed values equal today's | M | One vocabulary; zero visual change | Pin test: nine themes, every contract name, values equal current |
| LIVE-1797 | Theme manifest schema and nine manifests, generated from `library.ts`, `theme-contract.json`, `MEGA_THEMES`; readers stay | L | One source for catalog, picker, editor, intake | Schema validates; `library.ts` has no hand-written theme rows |

### Phase 3: role blocks

| Row | What | Size | Lift | Probe |
|---|---|---|---|---|
| LIVE-1798 | Role registry and the eight roles that recur most across families (Hero, Steps, Offerings, Gatherings, Membership, Proof, FAQ, CTA), 3 variants each, parts and data attributes, built on the existing shared blocks where one exists | L | The structural fix for the biggest overlap | Role fixtures render on nine themes at 1.00 coverage |
| LIVE-1799 | The next nine (Statement, Letter, Contact, Stats, Shop, Library, People, Gallery, Chapters) | L | Completes the role set | Same probe |
| LIVE-1800 | Legacy resolver and the per-page "Update to new layouts" action (opt-in, diffed, undoable) | M | Gives live Spaces a way across without us touching them | Test: legacy doc renders identically on its own theme before and after the resolver ships |
| LIVE-1801 | Presentation layers, one PR per three themes: frames, ornaments, variant defaults, section chrome, from each design system | M each | "Drastically different" survives: per-theme default variants and decoration | Per theme: every declared role has a `native` or `contract` entry |

### Phase 4: fast path

| Row | What | Size | Lift | Probe |
|---|---|---|---|---|
| LIVE-1802 | Static versioned theme CSS; site render links it; measure first-visit and repeat-visit cost on a built site and keep inline if first visit regresses | M | Cacheable theme CSS, smaller HTML | Built-artifact check: theme CSS is a hashed file; `check:build-budget` and `check:shell-weight` stay green |
| LIVE-1803 | Instant Try it on in the picker, the editor and /themes pages: stylesheet and attribute swap over the Space's own content, prefetch on hover | M | The "stupid easy" part an owner feels | Playwright: switching shows the new theme with no document request |
| LIVE-1804 | Publish revalidates one Space's tag on a theme change; confirm there is no full rebuild | S | Fast publish | Test: theme change calls `revalidateTag` for the Space |

### Phase 5: guardrails and catalog

| Row | What | Size | Lift | Probe |
|---|---|---|---|---|
| LIVE-1805 | `check:theme-conformance` with baseline, plus the nightly pixel run | M | Holes cannot return | Fails when a role is left unstyled on a theme |
| LIVE-1806 | Catalog and picker v2 from the manifest: filters, role coverage, "your site on this theme" | M | The new way to browse | /themes lists a theme from its manifest alone |
| LIVE-1807 | Intake reads the manifest: a new theme zip scaffolds a manifest and a role-coverage baseline | S | New themes arrive complete | `ds-intake` writes `theme.manifest.json` |

Order of value: Phase 1 first (it stops the bleeding for every Space that can switch today and is small), then Phase 2 and 3 in parallel with the kits, then Phase 4 once markup is theme-independent, Phase 5 wired in the same PR as the first green run it proves (per the deploy-safety rule on gates). Phases 0 and 1 are about 8 rows and do not need the contract to be agreed.

## 7. What the kit threads should do now

The kit threads are mid-build. Nothing needs to stop. The ask, once Daniel picks:

1. Keep building to the design system. Do not pause or redesign.
2. For each new family block, add a one-line sidecar naming its **role** and **variant** (a `role` key beside the block's registration). It costs nothing now and LIVE-1800 reads it.
3. Do not add a new theme-named block for a role that already exists on the shared set (Proof, FAQ, CTA, Letter, Stats). Extend the shared block with a variant and put the look in the theme's sheet under `[data-house-theme]` as now.
4. Read contract names where a token exists (`--color-*`, `--radius-*`); keep private tokens for decoration only. Do not add raw values.
5. Keep theme CSS scoped to the theme attribute (the fence), and keep all kit pages on typed blocks (no one-off CSS).
6. Temple kit (#4301 landed, #4304 makes it pickable) maps to Hero, Gatherings, Offerings, Steps, then Proof, Membership, FAQ, Letter, CTA, which are exactly roles 1 to 8 above.

## 8. Risks and what I am not claiming

- **Role blocks cost real design work per theme.** A role block with only contract tokens will look like "a competent default", not like the hand-built Nocturne hero. The presentation layer (LIVE-1801) is where the design lives; skipping it gets cohesion without personality. The proposal funds it in the plan; the risk is deferring it.
- **Theme-independent markup limits how different two themes can be** within one variant. Variants and per-theme defaults exist to give structural difference back. If a design needs a structure no variant offers, the answer is a new variant for everyone, not a theme-only block.
- **Instant preview is only instant for role blocks.** Until phase 3 lands, legacy family blocks preview through the fallback and must be labelled.
- **Static CSS may cost a request on a first visit.** Measure before committing (LIVE-1802).
- **The audit used default props and no web fonts.** Real-content renders are the first thing LIVE-1790 should add. The Default-column result especially needs a built-site check.
- **I did not test Spotlight or email**, which read the same themes through other renderers.

