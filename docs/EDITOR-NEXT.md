# Editor next: the role-driven builder

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** (rows BLD-001 to BLD-902, `pnpm backlog`). This document is the spec and the rationale; it does not track what is done.

Design source: the Frequency design project, "Builder Audit and Proposal" and "Builder Build Plan" (2026-11-02). Architecture: [`EDITOR-ARCHITECTURE.md`](EDITOR-ARCHITECTURE.md), [`THEME-COHESION.md`](THEME-COHESION.md). Decision: the ADR filed with this document.

## Rules
- One pass is one PR, under the repo's 40-file gate.
- Every pass runs the loop: build, validate, repair, record. A pass is done only when every gate it names is green.
- No raw CSS, no raw colour or size literals. Everything resolves to contract token names (ADR-976 D-1).
- No hand-written per-block UI. Panels, chips, labels and icons are read from role.json and defineBlock.
- Every pass ships dark behind the render_path flag and is reversible by flipping it.
- Baselines only shrink. A rise needs --allow-raise and a written reason, and stays flagged.
- Zero editor bytes on the public render. The builder runtime never reaches a visitor.
- Every pass also runs G-LEDGER and closes its own row in the same PR, as a fragment (pnpm ledger:close). Never edit docs/BUILD-BACKLOG.json or docs/DECISIONS.md directly.
- No new planning-named markdown. The spec lives in docs/EDITOR-NEXT.md; status lives only in docs/BUILD-BACKLOG.json.

## The loop every pass runs
1. **Build.** Read the pass's inputs, write only the files in its scope, add or update the probes it lists.
2. **Validate.** Run every gate the pass names, in order: static, unit, contract, render, visual, budget. Stop at the first red gate.
3. **Repair.** Classify the failure, fix inside the pass scope, re-run from the failed gate. Up to 3 cycles.
4. **Record.** Write the pass receipt: gates run, results, baseline changes, files touched, open items. Tick the backlog row.

## Repair
Up to 3 cycles per pass.

| Class | Symptom | Fix |
|---|---|---|
| contract | check:blocks, role schema or fields projection fails | Fix the role.json or defineBlock entry, never the gate. Fields must equal content keys. |
| token | check:tokens or theme conformance names a raw value or an unknown token | Replace with a contract name. If no token can express it, file a token request and stop. |
| render | Golden markup or equivalence diff | If the diff is the intended change, re-baseline with a dated changelog line. Otherwise revert the render change. |
| behavior | Interaction probe fails (selection, undo, rails, ⌘K) | Fix in the editor state module, not in components. One document drives every panel. |
| a11y | a11y ratchet rises, focus lost, missing label | Fix the control. Never recapture a ratchet to clear it. |
| budget | Build budget, shell weight or public-render bytes rise | Lazy-load the editor code path or move it behind the editor route. |
| data | Doc-safety round trip loses a field or an unknown block | Stop. Revert the pass. Data loss is never repaired forward. |

**Escalate.** After 3 failed cycles, revert the pass branch, record the failing gate and the last diff, and raise it as a blocker on the backlog row. Do not start dependent passes.

## Gates
| Id | Command | Status | Note |
|---|---|---|---|
| G-STATIC | tsc --noEmit and lint | live |  |
| G-UNIT | vitest suite (required test job) | live |  |
| G-DOC | check:node-document-safety | live | Frozen corpus of real documents round-trips with zero loss |
| G-EMAIL | check:email-blocks | live | Email palette and renderer locked 1:1 |
| G-STORED | check:stored-blocks | live | Stored page data names only known types |
| G-TOKENS | check:tokens | live |  |
| G-BUDGET | check:build-budget and check:shell-weight | live |  |
| G-BLOCKS | check:blocks | live | Script is in package.json (check:blocks). Every adopted block resolves a renderer per declared surface, toText present, migrations contiguous |
| G-ROLES | check:roles (new) | new in BLD-201 | Every role.json validates, including intent, icon, thumb and slot labels |
| G-THEME | check:theme-conformance | live | Script is in package.json (check:theme-conformance) |
| G-AUDIT | audit:themes render matrix | live | Script is in package.json (audit:themes) |
| G-PUBLIC | editor-bytes-on-public-render ratchet | new in BLD-101 | Must read 0 for builder code |
| G-RAWCSS | raw-css-paths ratchet | planned | Must stay 0 |
| G-VIS | pr-compare visual suite | advisory | Becomes required in the PR that recaptures its baselines |
| G-A11Y | a11y ratchet | live |  |
| G-FLAG | check:render-path and render_path flag-off test | live | check:render-path exact-match ratchet, plus a flag-off render test written in the pass |
| G-DS | Design system adherence check | live in the design project |  |
| G-PROBE | Pass probes | per pass | The pass's own Done-when tests, written in the pass |
| G-SURFACE | check:surface-binding | live | Every surface an App declares resolves to a component |
| G-CONTRAST | check:contrast | live |  |
| G-LEDGER | check:backlog, check:one-list, check:adr, check:id-collisions | live | Runs on every pass: the row fragment and its probe must agree with the tree |

## B0 · Align (S)

Settle the nine design-system conflicts so every later pass reads one vocabulary.

### BLD-001
**Token map to the 45 contract names.** Scope: `design system + lib/theme`. Delivers: conflict 3. After: nothing.

Build:
- Generate one map from Frequency tokens (Commons, Commons night, Stage) to the contract groups: ground, ink, accent, line, status, band, shape, depth, type, rhythm, motion.
- Retire --th-* in element-library.md and theme-pack.json; point them at contract names.

Validate: G-TOKENS, G-THEME, G-DS, G-PROBE, G-LEDGER.

Done when:
- Pin test: every contract name resolves on Commons, Commons night and Stage
- Computed values equal today's on the 31 design pages

### BLD-002
**Radius, breakpoints and editor tokens.** Scope: `design system tokens`. Delivers: conflicts 2, 6, 8. After: nothing.

Build:
- Five radius steps (10, 14, 18, 24, 32) plus pill, mapped to --r-control, --r-card, --r-panel, --r-media.
- Breakpoints 600, 840, 1200, 1600 as tokens.
- --editor-canvas, --editor-thumb, --editor-ring, --editor-select in Commons and night.

Validate: G-TOKENS, G-DS, G-VIS, G-PROBE, G-CONTRAST, G-LEDGER.

Done when:
- No radius literal outside tokens in templates/admin
- Thermal renders from night tokens, no invert filter

### BLD-003
**Build icon group in the sprite.** Scope: `assets/icons`. Delivers: conflict 9. After: nothing.

Build:
- Add about 14 icons on the 24px grid, 1.75 stroke: undo, redo, eye, eye-off, device desktop/tablet/phone, outline, pin, unpin, fold, history, surface, variant, sample.

Validate: G-DS, G-PROBE, G-LEDGER.

Done when:
- Every icon id referenced by role.json resolves in the sprite

### BLD-004
**Copy canon.** Scope: `guidelines + repo strings`. Delivers: conflicts 1, 4, 5, 7. After: nothing.

Build:
- Primary action on Commons: --pa for the one primary, ink for secondary, no violet. Update site-themes.md.
- Calendar name: apply the owner's pick everywhere, including the Circle tab.
- Scope banned words to Frequency's own copy; exempt owner and theme names.
- Record the Vera authority decision (drafts as diffs, or coaching only).

Validate: G-UNIT, G-DS, G-PROBE, G-LEDGER.

Done when:
- Text pin: the chosen calendar name appears, the other does not
- Voice lint passes with owner names exempt

## B1 · Shell (M)

The new frame on today's document model, single writer, dark behind render_path.

### BLD-101
**Frame, top bar and public-bytes ratchet.** Scope: `components/builder/shell, lib/builder/state`. Delivers: frame. After: BLD-002.

Build:
- Full-window canvas, top bar (Space and page, surface switcher placeholder, ⌘K trigger, Publish).
- One editor state module; components hold no section state.
- Add the editor-bytes-on-public-render ratchet at 0.

Validate: G-STATIC, G-UNIT, G-PUBLIC, G-BUDGET, G-FLAG, G-PROBE, G-LEDGER.

Done when:
- Flag off renders the current editor
- Visitor bundle contains no builder module

### BLD-102
**Rail state machine.** Scope: `lib/builder/rails`. Delivers: rails. After: BLD-101.

Build:
- States per rail: hidden, strip, overlay, pinned. Pinned pushes the canvas; overlay closes on canvas click and Esc.
- Width 300 to 420 for the right rail, persisted per person with pin state.
- Breakpoint table from BLD-002. Focus mode hides both rails.

Validate: G-UNIT, G-A11Y, G-PROBE, G-LEDGER.

Done when:
- Table test of every state at 1600, 1200, 900, 700, 390
- Focus returns to the trigger on close

### BLD-103
**Spine and outline.** Scope: `components/builder/spine`. Delivers: outline. After: BLD-102.

Build:
- Spine reads the node tree: one thumbnail per section, selected state, drag to reorder, + between.
- Outline drawer: section names from role intent and the title slot, hidden-on-device dimming.

Validate: G-UNIT, G-DOC, G-A11Y, G-PROBE, G-LEDGER.

Done when:
- Reorder by drag and by keyboard produces the same document
- Doc-safety corpus round-trips after reorder

### BLD-104
**Selection and parts overlay.** Scope: `components/builder/canvas`. Delivers: move 04. After: BLD-101.

Build:
- Hover outlines a data-part; click selects section or part.
- Inline text editing on text parts; image part opens the media picker with focal point.
- Section toolbar: move, duplicate, hide on this device, delete with undo toast.

Validate: G-UNIT, G-A11Y, G-VIS, G-PROBE, G-LEDGER.

Done when:
- Canvas edit updates Tune rail and back
- Every action is one undo step

### BLD-105
**Generated Tune rail, two layers.** Scope: `components/builder/tune`. Delivers: move 03. After: BLD-104.

Build:
- Layer 1 renders slots.required then slots.optional, from role.json, with counts from slot limits.
- Layer 2 (More): tone, width, spacing, columns, devices, anchor, reveal, density per surface, from defineBlock.fields.
- 'Always show more' per person.

Validate: G-UNIT, G-BLOCKS, G-A11Y, G-PROBE, G-LEDGER.

Done when:
- For every adopted role, rendered fields equal the projection, no more and no fewer
- No component file names a block type

### BLD-106
**Command bar.** Scope: `components/builder/command`. Delivers: move 09. After: BLD-101.

Build:
- ⌘K and Ctrl+K, plus a visible button on touch.
- Three groups: Go to (sections, pages), Do (every action in the action registry), Ask Vera.
- Each row shows its shortcut; recent commands first.

Validate: G-UNIT, G-A11Y, G-PROBE, G-LEDGER.

Done when:
- Every toolbar and rail action is reachable from ⌘K
- Focus trapped while open, returned on close

### BLD-107
**Mobile sheets.** Scope: `components/builder/mobile`. Delivers: rails under 600. After: BLD-105, BLD-106.

Build:
- Bottom bar: Outline, Add, Tune, Vera.
- Bottom sheet with the same two layers; 44px targets.

Validate: G-UNIT, G-A11Y, G-VIS, G-PROBE, G-LEDGER.

Done when:
- Every Layer 1 and Layer 2 control is reachable at 390 wide

### BLD-108
**Shadow render and cutover.** Scope: `flag config`. Delivers: cutover. After: BLD-103, BLD-105, BLD-107.

Build:
- Render old and new editors on the same documents; log deltas.
- Turn on for internal Spaces, then a cohort.

Validate: G-DOC, G-STORED, G-FLAG, G-VIS, G-PROBE, G-LEDGER.

Done when:
- Zero or explained delta on the frozen corpus

## B2 · Roles (M)

Add by intent, layout chips and readiness, read straight from the role registry.

### BLD-201
**Role contract additions and check:roles.** Scope: `lib/blocks/roles`. Delivers: contract additions. After: BLD-003.

Build:
- Add intent, icon, variants[x].thumb and slots[x].label / hint to all role.json files (21 roles once BLD-210 lands; 17 today).
- Extend RoleDefinition; add check:roles validating every file.
- Replace the regex tables in block-meta.ts with role fields; keep a fallback for legacy types.

Validate: G-STATIC, G-UNIT, G-ROLES, G-BLOCKS, G-PROBE, G-LEDGER.

Done when:
- block-meta.ts has no type-name regex for role blocks
- Every role icon resolves in the sprite

### BLD-202
**Add by intent.** Scope: `components/builder/add`. Delivers: move 01. After: BLD-201, BLD-103.

Build:
- + opens 'What should this part do?' with the intents, grouped (21 roles in builder v3).
- Previews render each role's default variant with the Space's own data where role.data is set, else the flagged sample.
- Insert at the chosen index; select it; one undo step.

Validate: G-UNIT, G-THEME, G-A11Y, G-PROBE, G-LEDGER.

Done when:
- Only roles legal for the current kind and surface are offered
- Preview uses Space data when present

### BLD-203
**Layout chips with needs and pins.** Scope: `components/builder/canvas/variants`. Delivers: move 02. After: BLD-201, BLD-104.

Build:
- Chips from variants with thumb; a chip whose needs are unmet shows why and a shortcut to fill the slot.
- Picking a chip sets variant and variantSet: true and shows a pin. Unpin restores the theme default via roleVariant().

Validate: G-UNIT, G-AUDIT, G-VIS, G-PROBE, G-LEDGER.

Done when:
- roleVariant priority holds: owner, then theme, then role default
- Every variant renders non-empty with sample content on every theme

### BLD-204
**Readiness.** Scope: `components/builder/readiness, lib/sites/editor/publish-checks.ts`. Delivers: move 07. After: BLD-104.

Build:
- Publish ring with a count: sample words, null numbers, missing alt text, missing SEO.
- Canvas tags: 'not yours yet' on sample slots, 'needs a number' on null figures.
- Click the count to step through each item.

Validate: G-UNIT, G-A11Y, G-PROBE, G-LEDGER.

Done when:
- A page with sample: true content cannot publish without an explicit keep
- Null number blocks publish

### BLD-205
**Update to new layouts.** Scope: `components/builder/legacy`. Delivers: legacy. After: BLD-203.

Build:
- Surface LIVE-1860's per-page action: preview the role version of each legacy block with a diff, apply as one undo step.

Validate: G-DOC, G-STORED, G-UNIT, G-PROBE, G-LEDGER.

Done when:
- Legacy page renders identically before the action and after undo

## B3 · Lenses (M)

One edit across surfaces, themes tried on over real content.

### BLD-301
**Surface switcher.** Scope: `components/builder/surfaces`. Delivers: move 05. After: BLD-108.

Build:
- Site, Profile, Spotlight, Email in the top bar; selection persists across switches.
- Canvas renders at the surface's declared density; sections the surface cannot show are listed with the reason.

Validate: G-UNIT, G-BLOCKS, G-VIS, G-PROBE, G-SURFACE, G-LEDGER.

Done when:
- Per block and surface, golden markup matches
- Hidden-on-surface list equals blocks without that surface

### BLD-302
**Email lens.** Scope: `components/builder/surfaces/email`. Delivers: move 05. After: BLD-301.

Build:
- Email preview through compileEmailDoc; live blocks show their resolveAt: 'send' snapshot.

Validate: G-EMAIL, G-UNIT, G-PROBE, G-LEDGER.

Done when:
- The 7 draft campaigns and 7 templates render byte-identical to before

### BLD-303
**Theme lens.** Scope: `components/builder/theme`. Delivers: move 06. After: BLD-108.

Build:
- Hover a theme: swap the static theme stylesheet and data-theme on the canvas; prefetch on hover.
- Unpinned sections show the theme's default variant; commit is one undo step.

Validate: G-THEME, G-AUDIT, G-BUDGET, G-PROBE, G-CONTRAST, G-LEDGER.

Done when:
- Switching makes no document request once cached
- Pinned variants never change on switch

### BLD-304
**View as.** Scope: `components/builder/view-as`. Delivers: move 10. After: BLD-108.

Build:
- Visitor, member and host previews using the existing viewer gates.

Validate: G-UNIT, G-PROBE, G-LEDGER.

Done when:
- Host-only blocks are absent in the visitor preview

## B4 · Together (L)

Presence, Vera as a collaborator, and history. Starts after E0 lands.

### BLD-401
**Presence.** Scope: `components/builder/presence`. Delivers: move 08. After: E0 CRDT.

Build:
- Faces in the top bar, cursors and selections from Yjs awareness. Awareness never touches the document.

Validate: G-DOC, G-PUBLIC, G-UNIT, G-PROBE, G-LEDGER.

Done when:
- Two clients converge to the same tree
- Undo reverts only the local client's edit

### BLD-402
**Vera collaborator.** Scope: `components/builder/vera, lib/ai`. Delivers: move 08. After: BLD-401, BLD-004.

Build:
- Vera joins as a client. Tools: read_page, plan_page, apply_edits, validate.
- Proposals show as ghosted diffs, accepted per section, one transaction each.
- Speaks first only at page creation; after that, only from ⌘K or her rail.

Validate: G-RAWCSS, G-UNIT, G-ROLES, G-PROBE, G-LEDGER.

Done when:
- Vera output names only tokens and known slot keys
- Accept and undo are one step each

### BLD-403
**History scrubber.** Scope: `components/builder/history`. Delivers: move 10. After: E0 page_versions.

Build:
- Timeline of versions; drag to preview; restore one section or the whole page. Publish is a pointer swap.

Validate: G-DOC, G-UNIT, G-PROBE, G-LEDGER.

Done when:
- Restore produces a document equal to the chosen version

## BZ · Hardening (M)

Repeat the full matrix and fix anything that drifted across passes.

### BLD-901
**Full matrix.** Scope: `all builder paths`. Delivers: all. After: BLD-303, BLD-205.

Build:
- Render every role × variant × theme × surface × device (1600, 1200, 900, 390). Fix overflow, zero-height and contrast findings.

Validate: G-AUDIT, G-THEME, G-VIS, G-A11Y, G-BUDGET, G-PUBLIC, G-RAWCSS, G-CONTRAST, G-LEDGER.

Done when:
- Coverage 1.00 on declared roles
- No horizontal overflow at 390

### BLD-902
**Owner walk-through.** Scope: `staging`. Delivers: all. After: BLD-901.

Build:
- Five owners each build a page from a blank Space while we watch. Log every hesitation and failed find.
- Promote any Layer 2 control used by 3 of 5 into Layer 1.

Validate: G-PROBE, G-LEDGER.

Done when:
- Every owner publishes without help
- No control is searched for in ⌘K by more than 2 owners


## Revision 2 · Builder v3 and the theme gaps (2026-11-03)

Source: the "Frequency Builder and the New World theme" handoff (revision of 2 November 2026). Reference copy: `/mnt/project-files/builder-new-world/`; the audit and the connections, assets and surfaces list: `docs/design/frequency-builder-v3/v3-review-and-needs.md`. Status of every row below lives in `docs/BUILD-BACKLOG.json`.

What changed against the passes above:
- The builder v3 edits **21 roles**, not 17: the 17 role blocks in `lib/blocks/roles/` plus five the repo does not have (Groups, Your first visit, Save a spot, Where we meet, Tools behind it) and Our story, which is a richer cousin of Statement. BLD-210 adds them to the registry so every theme gets them at once; BLD-211 adds the variants the builder names that the roles lack (Hero glow and minimal, Gatherings agenda, Figures bar).
- The builder never names a colour or font. A theme supplies tokens and a default variant per role (`components/sites/presentation/`). BLD-212 gives all ten site themes a default for each new role and variant, so a role added in the builder reads as that theme.
- New World is the example theme and the default every Space starts in. It is its own theme (code id `new-world`, owned by the New World install thread), not a revision of Services. The builder's chrome never wears a theme (theme fence).
- Live roles need real rows. BLD-213 wires the connections listed in the audit; sample words never reach a live page.
- BLD-214 covers the assets (photo set, icons, fonts) and BLD-215 surface parity (site, profile, Spotlight, email) for the 21 roles.

Owner rulings (BLD-000, 2026-11-02) bind this revision: Vera coaches with questions only (the builder's "Suggest changes" mode ships off); the calendar is "What's Happening" everywhere; the shell uses the shared 600, 840 and 1200 breakpoints; the first surface set is site, profile, Spotlight and email together.
