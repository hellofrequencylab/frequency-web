#!/usr/bin/env node
// Admin-menu contract check (ADR-553 · ADR-927 · docs/MENU-CONTRACT.md).
//
// WHAT THIS GUARDS. The admin menu + admin rail + every /manage console are supposed to derive from
// ONE place: the module catalogs. The invariant is not "nobody declares a variable called
// `*_MODULES`" — it is **every menu item traces back to a catalog row**. Until 2026-08-04 this script
// enforced the naming convention instead of the invariant, so it was satisfiable by renaming a
// variable, and it was blind to the two real violations ADR-927 found (a hand-declared per-scope rail
// item list in `settings-panel.tsx`, and a hand-declared per-scope quick-link menu in `rail-bank.ts`).
// The four rules below enforce the invariant by SHAPE and by STRUCTURE, not by name.
//
//   RULE 1 — module-catalog shape (repo-wide, name-blind). An array literal whose elements carry the
//     ADMIN MODULE shape (a string-literal `id`/`key` plus two or more of
//     requiredCapability/deepLink/slot/render/surface/tier/placement/scopes/gate) may only be declared
//     in a REGISTERED_CATALOG file. Renaming the variable changes nothing: the shape is the tell.
//
//   RULE 2 — the legacy name floor (repo-wide). A `const *_MODULES` outside the registered catalogs, or
//     a reintroduced retired registry (SPACE_SURFACES / ENTITY_SURFACES), still fails. Cheap, and it
//     catches a catalog declared with a shape the AST rule has not learned yet.
//
//   RULE 3 — no hand-declared menu inside the MENU-RESOLUTION SURFACE (shape-based, name-blind). In the
//     files that RESOLVE the admin menu (the rail model, the rail chrome, the module renderers, the App
//     catalog, the console resolvers — plus every `lib/` file they import directly, so the list cannot
//     be dodged by moving it one file sideways), an array literal element that carries a STRING-LITERAL
//     `label`/`title` plus a menu-ish key (href/icon/Icon/render/slot/surface/id/node/deepLink) is a
//     hand-typed menu row. Those are counted per file and RATCHETED against FROZEN_MENU_DEBT below: a
//     count that rises fails; a count that falls asks to be re-frozen; a file with no entry is at zero.
//
//   RULE 4 — the `APPS` lane manifest (structural). `lib/apps/catalog.ts` composes the one App contract.
//     Its `export const APPS` must spread EXACTLY the lanes in APP_LANES, and each lane must be
//     `<SOURCE>.map(...)` over the source that manifest names, imported from a registered catalog file.
//     A sixth lane, or a lane repointed at a hand-rolled array, fails until it is registered here — which
//     is the review checkpoint the doc used to claim existed and did not.
//
// WHAT THIS DOES **NOT** GUARD (stated so nobody mistakes green for proof — see docs/MENU-CONTRACT.md
// §"What is enforced"): a hand-rolled list declared OUTSIDE the menu-resolution surface AND rendered
// directly by a page, bypassing `APPS` and `appsForScope` entirely, is invisible to a static check with
// a tolerable false-positive rate. The runtime drift-guards (lib/admin/modules/space-menu.test.ts,
// lib/admin/entity-console.test.ts) cover the "the derivations diverged" half of that.
//
// Escape hatches, both deliberate and both auditable: an inline `// menu-ok: <reason>` comment on the
// declaration line, or an entry in FROZEN_MENU_DEBT (which must name the site and the reason, and can
// only shrink — a stale entry fails the build).
//
// Usage: `node scripts/check-menu.mjs` (or `pnpm check:menu`). Exits 1 on violation.
// Model: scripts/check-authz-guards.mjs (static guard) + scripts/adoption-baselines.json (the ratchet).

import ts from 'typescript'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOTS = ['lib', 'app', 'components']
const ANNOTATION = '// menu-ok:'

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The registered sources. A module catalog may be declared ONLY here.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** file → { symbol, why }. These are THE catalogs: the only places a menu row may be typed by hand. */
const REGISTERED_CATALOGS = new Map([
  ['lib/admin/modules/space-modules.ts', { symbol: 'SPACE_MODULES', why: 'THE Space module catalog (source of truth)' }],
  ['lib/admin/modules/registry.ts', { symbol: 'ADMIN_MODULES', why: 'THE AdminModule catalog for the non-Space scopes' }],
  ['lib/widgets/modules.ts', { symbol: 'LAYOUT_MODULES', why: 'THE layout/page module catalog (LAYOUT_MODULES -> PAGE_APPS)' }],
  // ADR-848 made the operator destinations a fourth lane of `APPS`. The doc said "three catalogs" and
  // was wrong (ADR-927): this IS a catalog — one declaration per operator destination, from which both
  // legacy admin catalogs (ADMIN_NAV, ADMIN_GROUPS) already derive. Registered, not grandfathered.
  ['lib/nav/studio.ts', { symbol: 'STUDIO_LEAVES', why: 'THE operator destination catalog (ADR-848; ADMIN_NAV + ADMIN_GROUPS derive from it)' }],
])

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RULE 4 — the `APPS` lane manifest. Every lane `lib/apps/catalog.ts` composes, and the source it is
// allowed to compose it FROM. `frozen: true` marks a lane whose source is not a registered catalog;
// each carries its reason and its exit.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const CATALOG_FILE = 'lib/apps/catalog.ts'
const APP_LANES = new Map([
  ['EDITOR_APPS', { source: 'ADMIN_MODULES' }],
  ['PAGE_APPS', { source: 'LAYOUT_MODULES' }],
  ['SPACE_EDITOR_APPS', { source: 'SPACE_MODULES' }],
  ['ADMIN_NAV_APPS', { source: 'STUDIO_LEAVES' }],
  // GRANDFATHERED SOURCE. `ELEMENT_SEEDS` is a file-LOCAL re-declaration of the element catalog
  // (lib/library/element-catalog.ts), because that file's per-registry arrays are private and LP1 was
  // not allowed to modify it. It is drift-guarded — lib/apps/catalog.test.ts asserts these
  // {registry, name} pairs equal the exported REGISTRY_NAMES — so it cannot silently diverge, but it is
  // still a second place the same data is typed. EXIT: LP2 exports the source list and this lane points
  // at it, at which point `frozen` comes off and `lib/library/element-catalog.ts` is registered above.
  ['ELEMENT_APPS', { source: 'ELEMENT_SEEDS', frozen: 'file-local re-declaration of lib/library/element-catalog.ts; drift-guarded by catalog.test.ts; LP2 collapses it' }],
])

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RULE 3 — the menu-resolution surface.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The files that RESOLVE the admin menu. Seeds are exact files or directories; the surface is then
 *  extended with every `lib/` file a seed imports directly (see menuSurface), so a hand-rolled list
 *  cannot escape by moving into a new lib file that the rail imports. */
const MENU_SURFACE_SEEDS = [
  'components/layout/settings-panel.tsx', // the rail MODEL (useSettingsPanel)
  'components/layout/admin-bar', // the rail CHROME
  'components/admin/modules', // the module renderers + the module map + the consoles' shared shell
  'lib/apps', // THE App contract (catalog, for-scope, access, overrides)
  'lib/admin', // the catalogs, the console resolvers, the spine, the rail bank
  'lib/widgets/modules.ts', // the layout catalog
]

/** Files the surface pulls in that are NOT the admin menu. Each is a deliberate classification, and
 *  each names the system it belongs to instead — never a silent exemption. */
const NOT_A_MENU = new Map([
  // ADR-868 is explicit: "The member menu (menu_items / NAV_AREAS) is a different system from the
  // locked admin module catalogs (ADR-553); nothing under lib/admin/modules/* moved." It has its own
  // operator surface and its own storage; the admin menu contract does not govern it.
  ['lib/nav-areas.ts', 'the MEMBER navigation registry (menu_items / NAV_AREAS) — a different system (ADR-868)'],
  // Font stacks and one-tap theme presets are STYLE VALUES that happen to carry a label. Nothing here
  // is a destination or a module; the Spotlight editor renders them as swatches.
  ['lib/spotlight/theme.ts', 'Spotlight font stacks + theme presets — style values with labels, not menu rows'],
])

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FROZEN MENU DEBT — the ratchet (same contract as scripts/adoption-baselines.json).
//
// These are the hand-declared menus that EXIST TODAY and that the contract says should not. They are
// frozen, not forgiven: the count per file may HOLD or FALL, never RISE, and an entry that falls to
// zero must be deleted from this list (a stale entry fails the build, so the list cannot rot).
//
// 🔴 THE CONTRACT IS THEREFORE PARTLY UNENFORCED. Migrating these into the catalogs is a product
// decision with a real blast radius, not a refactor — see docs/MENU-CONTRACT.md §"Frozen debt".
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const FROZEN_MENU_DEBT = new Map([
  [
    'components/layout/settings-panel.tsx',
    {
      items: 6,
      site: '`allExtraItems` in useSettingsPanel',
      why:
        'Six rail rows mounted by hand instead of by catalog row: Circle Quest, Page content, the Layout ' +
        'tuner (circle / event / practice) and the event Danger zone. ADR-886 already named this the wrong ' +
        'pattern ("Events mount EventDangerZone directly in settings-panel.tsx as an inline extra … hub.danger, ' +
        'nexus.danger and journey.danger all render from ADMIN_MODULES instead, and that is the pattern this ' +
        'follows"). MIGRATION: one ADMIN_MODULES row each, with the component moved into MODULE_COMPONENTS. ' +
        'Needs an owner call on the three Layout rows, which are one component parameterised by page noun and ' +
        'gated on three different capabilities.',
    },
  ],
  [
    'lib/admin/rail-bank.ts',
    {
      items: 11,
      site: '`baseBank` — a switch over scope.kind returning literal link arrays',
      why:
        'The bottom-bank quick links for space / global+profile / circle / event / hub+nexus+practice / ' +
        'journey / channel are typed here, per scope, and reach the rail without touching a catalog. This is ' +
        'the second per-scope menu ADR-927 found. It is deliberately NOT migrated in this pass: bank links are ' +
        'navigation hrefs, several are DB-id-keyed rather than slug-keyed, and ADR-515 already designed the ' +
        'catalog path for them (`placement: "bank"`), which today no module opts into. MIGRATION: mint the rows ' +
        'with `placement: "bank"` and delete baseBank. OWNER DECISION: doing so changes which quick links each ' +
        'scope shows, so it is a product change, not a mechanical one.',
    },
  ],
  [
    'components/admin/modules/channel-settings-module.tsx',
    {
      items: 4,
      site: 'the "The rest of this Channel" link list in the module body',
      why:
        'Four hand-typed links out to the Channel Manage hub sections, duplicating CHANNEL_HUB_SECTIONS ' +
        '(app/(main)/channels/[id]/manage/hub.ts). Inside a catalog module body, so the ROW traces to a catalog ' +
        'row — but the list itself is a second copy of the hub section registry and can drift from it. ' +
        'MIGRATION: render them from CHANNEL_HUB_SECTIONS.',
    },
  ],
])

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Shape vocabularies.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Keys only an ADMIN MODULE row carries (AdminModule / SpaceModule / the App editor surface). Two or
 *  more of these beside a literal id is a module catalog, whatever the variable is called. */
const MODULE_SHAPE_KEYS = new Set([
  'requiredCapability', 'deepLink', 'slot', 'render', 'surface', 'tier', 'placement', 'scopes', 'gate',
])
/** A menu ROW is labelled … */
const LABEL_KEYS = new Set(['label', 'title'])
/** … and either points somewhere or renders something. A `{ key, label, blurb }` grouping (the Space /
 *  event / channel manage-hub section registries) carries none of these and is correctly NOT a menu. */
const ROW_KEYS = new Set(['href', 'icon', 'Icon', 'render', 'slot', 'surface', 'id', 'node', 'deepLink'])

// (Rule 2) A hand-rolled parallel module catalog: `const XXX_MODULES = [` / `: ... = [`.
const MODULE_CATALOG = /\bconst\s+[A-Z][A-Z0-9_]*_MODULES\b\s*[:=]/
// (Rule 2) Reintroducing a retired parallel registry that the standardization deleted.
const RETIRED_REGISTRY = /\bconst\s+(SPACE_SURFACES|ENTITY_SURFACES)\b\s*[:=]/
// Cheap pre-filter so the repo-wide AST pass only parses files that could possibly hold a catalog.
const MODULE_SHAPE_HINT = /requiredCapability|deepLink|\bslot\s*:|\brender\s*:|\bplacement\s*:|\bscopes\s*:/

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Filesystem helpers.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

function parse(file, src) {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

/** Every array literal in a source file, with its 1-based line. */
function arrayLiterals(sf) {
  const out = []
  const visit = (n) => {
    if (ts.isArrayLiteralExpression(n)) {
      out.push({ node: n, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

/** The identifier-named properties of an object literal, plus which of them are string literals. */
function propsOf(obj) {
  const names = new Set()
  const literal = new Set()
  for (const p of obj.properties) {
    if (!p.name || !ts.isIdentifier(p.name)) continue
    names.add(p.name.text)
    if (
      ts.isPropertyAssignment(p) &&
      (ts.isStringLiteral(p.initializer) || ts.isNoSubstitutionTemplateLiteral(p.initializer))
    ) {
      literal.add(p.name.text)
    }
  }
  return { names, literal }
}

/** Whether the line the node starts on carries the `// menu-ok:` escape hatch. */
function annotated(sf, node) {
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  return (sf.text.split('\n')[line] ?? '').includes(ANNOTATION)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RULE 2 — the legacy name floor. Kept as the cheap always-on line-based check, and exported so the
// companion test can drive it with fixture strings (scripts/check-menu.test.ts).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The name-rule + retired-registry violations in one file's source. */
export function menuViolations(file, src) {
  const lines = src.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(ANNOTATION)) continue
    if (RETIRED_REGISTRY.test(line)) {
      out.push({ line: i + 1, kind: 'retired-registry', text: line.trim() })
    } else if (MODULE_CATALOG.test(line) && !REGISTERED_CATALOGS.has(file)) {
      out.push({ line: i + 1, kind: 'parallel-catalog', text: line.trim() })
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RULE 1 — module-catalog SHAPE, repo-wide and name-blind.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Array literals holding admin-module-shaped rows, in a file that is not a registered catalog. */
export function moduleShapeViolations(file, src) {
  if (REGISTERED_CATALOGS.has(file)) return []
  if (!MODULE_SHAPE_HINT.test(src)) return []
  const sf = parse(file, src)
  const out = []
  for (const { node, line } of arrayLiterals(sf)) {
    if (annotated(sf, node)) continue
    const rows = node.elements.filter((el) => {
      if (!ts.isObjectLiteralExpression(el)) return false
      const { names, literal } = propsOf(el)
      const hasLiteralId = literal.has('id') || literal.has('key')
      const shapeKeys = [...names].filter((n) => MODULE_SHAPE_KEYS.has(n)).length
      return hasLiteralId && shapeKeys >= 2
    })
    if (rows.length > 0) {
      out.push({ line, kind: 'module-shape', text: `${rows.length} admin-module-shaped row(s) in an array literal` })
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RULE 3 — hand-declared menu rows inside the menu-resolution surface.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Resolve an import specifier to a repo-relative file, or null for a package / unresolvable path. */
function resolveImport(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = spec.slice(2)
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec).replace(`${process.cwd()}/`, '')
  else return null
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c
  }
  return null
}

/** The menu-resolution surface: the seeds, plus every `lib/` file a seed imports directly. Components
 *  are bounded by the seeds (a module's own render body is CONTENT, not a menu); `lib/` is walked one
 *  hop because that is where a hand-rolled list would realistically be moved to escape a glob. */
export function menuSurface() {
  const seeds = MENU_SURFACE_SEEDS.flatMap((s) => (/\.tsx?$/.test(s) ? (existsSync(s) ? [s] : []) : walk(s)))
  const surface = new Set(seeds)
  for (const f of seeds) {
    const sf = parse(f, readFileSync(f, 'utf8'))
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || st.importClause?.isTypeOnly) continue
      if (!ts.isStringLiteral(st.moduleSpecifier)) continue
      const r = resolveImport(st.moduleSpecifier.text, f)
      if (r && r.startsWith('lib/')) surface.add(r)
    }
  }
  for (const f of NOT_A_MENU.keys()) surface.delete(f)
  return [...surface].sort()
}

/** Hand-typed menu rows in one file: array-literal elements with a STRING-LITERAL label plus a key that
 *  makes them a row (a destination or a rendered thing). Returns { count, sites }. */
export function handDeclaredMenuRows(file, src) {
  const sf = parse(file, src)
  let count = 0
  const sites = []
  for (const { node, line } of arrayLiterals(sf)) {
    if (annotated(sf, node)) continue
    const rows = node.elements.filter((el) => {
      if (!ts.isObjectLiteralExpression(el)) return false
      const { names, literal } = propsOf(el)
      const labelled = [...literal].some((n) => LABEL_KEYS.has(n))
      return labelled && [...names].some((n) => ROW_KEYS.has(n))
    })
    if (rows.length > 0) {
      count += rows.length
      sites.push({ line, rows: rows.length })
    }
  }
  return { count, sites }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RULE 4 — the `APPS` lane manifest.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Structural check of lib/apps/catalog.ts: which lanes `APPS` composes, and what each derives from. */
export function laneViolations(src, file = CATALOG_FILE) {
  const sf = parse(file, src)
  const out = []

  // What catalog.ts imports, and from where — so a lane's source can be tied back to a registered file.
  const importedFrom = new Map()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const from = st.moduleSpecifier.text
    const named = st.importClause?.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) importedFrom.set(el.name.text, from)
    }
  }

  // Every top-level `const X = <expr>` in the file, so lanes can be looked up by name.
  const decls = new Map()
  for (const st of sf.statements) {
    const list = ts.isVariableStatement(st)
      ? st.declarationList
      : null
    if (!list) continue
    for (const d of list.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer) decls.set(d.name.text, d.initializer)
    }
  }

  const appsInit = decls.get('APPS')
  if (!appsInit) {
    out.push({ kind: 'lane', text: `${file}: no top-level \`APPS\` declaration found — the one App contract moved or was renamed` })
    return out
  }
  if (!ts.isArrayLiteralExpression(appsInit)) {
    out.push({ kind: 'lane', text: `${file}: \`APPS\` is no longer a plain array of lane spreads; the lane manifest cannot be verified` })
    return out
  }

  const lanes = []
  for (const el of appsInit.elements) {
    if (ts.isSpreadElement(el) && ts.isIdentifier(el.expression)) lanes.push(el.expression.text)
    else {
      const line = sf.getLineAndCharacterOfPosition(el.getStart(sf)).line + 1
      out.push({ kind: 'lane', line, text: `${file}: \`APPS\` element is not a lane spread — every lane must be a named, verifiable array` })
    }
  }

  for (const lane of lanes) {
    if (!APP_LANES.has(lane)) {
      out.push({ kind: 'lane', text: `${file}: \`APPS\` composes an UNREGISTERED lane \`${lane}\` — register it in APP_LANES with the catalog it derives from` })
      continue
    }
    const want = APP_LANES.get(lane)
    const init = decls.get(lane)
    if (!init) {
      out.push({ kind: 'lane', text: `${file}: lane \`${lane}\` is not declared in this file, so its source cannot be verified` })
      continue
    }
    // A lane must be `<SOURCE>.map(...)` — the one derivation shape the contract allows.
    const isMap =
      ts.isCallExpression(init) &&
      ts.isPropertyAccessExpression(init.expression) &&
      init.expression.name.text === 'map' &&
      ts.isIdentifier(init.expression.expression)
    if (!isMap) {
      out.push({ kind: 'lane', text: `${file}: lane \`${lane}\` is not a \`<CATALOG>.map(...)\` derivation — a lane must DERIVE from a catalog, never restate one` })
      continue
    }
    const source = init.expression.expression.text
    if (source !== want.source) {
      out.push({ kind: 'lane', text: `${file}: lane \`${lane}\` now derives from \`${source}\`, but APP_LANES registers \`${want.source}\`` })
      continue
    }
    if (want.frozen) continue // a grandfathered, file-local source (see APP_LANES)
    const from = importedFrom.get(source)
    const fromFile = from ? resolveImport(from, file) : null
    if (!fromFile || !REGISTERED_CATALOGS.has(fromFile)) {
      out.push({
        kind: 'lane',
        text: `${file}: lane \`${lane}\` derives from \`${source}\`, which is not imported from a REGISTERED catalog (${from ?? 'declared locally'})`,
      })
    }
  }

  for (const lane of APP_LANES.keys()) {
    if (!lanes.includes(lane)) {
      out.push({ kind: 'lane', text: `${file}: registered lane \`${lane}\` is no longer composed into \`APPS\` — remove it from APP_LANES if that is intended` })
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RULE 5 — integrity. The gate must not be dodgeable by deleting or moving the things it inspects.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

function integrityViolations() {
  const out = []
  for (const [file, meta] of REGISTERED_CATALOGS) {
    if (!existsSync(file)) {
      out.push({ kind: 'integrity', text: `registered catalog ${file} is missing — a catalog cannot be moved without updating REGISTERED_CATALOGS` })
      continue
    }
    const src = readFileSync(file, 'utf8')
    if (!new RegExp(`\\bexport\\s+const\\s+${meta.symbol}\\b`).test(src)) {
      out.push({ kind: 'integrity', text: `registered catalog ${file} no longer exports \`${meta.symbol}\`` })
    }
  }
  if (!existsSync(CATALOG_FILE)) {
    out.push({ kind: 'integrity', text: `${CATALOG_FILE} is missing — the App catalog cannot be verified` })
  }
  for (const seed of MENU_SURFACE_SEEDS) {
    if (!existsSync(seed)) {
      out.push({ kind: 'integrity', text: `menu-surface seed ${seed} is missing — update MENU_SURFACE_SEEDS rather than letting the surface silently shrink` })
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The run.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export function runCheck() {
  const violations = []
  const ratchet = { held: [], fell: [], stale: [] }

  // Rules 1 + 2, repo-wide.
  for (const f of ROOTS.flatMap(walk)) {
    const src = readFileSync(f, 'utf8')
    for (const v of menuViolations(f, src)) violations.push({ file: f, ...v })
    for (const v of moduleShapeViolations(f, src)) violations.push({ file: f, ...v })
  }

  // Rule 3, over the menu-resolution surface, ratcheted against FROZEN_MENU_DEBT.
  const seen = new Set()
  for (const f of menuSurface()) {
    if (REGISTERED_CATALOGS.has(f)) continue // a catalog IS where rows are typed by hand
    const { count, sites } = handDeclaredMenuRows(f, readFileSync(f, 'utf8'))
    const frozen = FROZEN_MENU_DEBT.get(f)
    if (frozen) seen.add(f)
    const budget = frozen?.items ?? 0
    if (count > budget) {
      violations.push({
        file: f,
        line: sites[0]?.line,
        kind: 'hand-declared-menu',
        text:
          `${count} hand-declared menu row(s) in the menu-resolution surface` +
          (frozen ? ` — frozen at ${budget}, so this ADDS ${count - budget}` : ''),
      })
    } else if (frozen && count < budget) {
      ratchet.fell.push({ file: f, from: budget, to: count })
    } else if (frozen) {
      ratchet.held.push({ file: f, at: count })
    }
  }
  for (const f of FROZEN_MENU_DEBT.keys()) {
    if (!seen.has(f)) ratchet.stale.push(f)
  }
  for (const f of ratchet.stale) {
    violations.push({
      file: f,
      kind: 'stale-allowance',
      text: 'is in FROZEN_MENU_DEBT but is no longer in the menu-resolution surface (moved, renamed, or fixed) — delete its entry so the allowance list cannot rot',
    })
  }

  // Rule 4, the lane manifest.
  if (existsSync(CATALOG_FILE)) {
    for (const v of laneViolations(readFileSync(CATALOG_FILE, 'utf8'))) violations.push({ file: CATALOG_FILE, ...v })
  }

  // Rule 5, integrity.
  for (const v of integrityViolations()) violations.push({ file: '(integrity)', ...v })

  return { violations, ratchet }
}

const WHY = {
  'retired-registry': 'reintroduces a RETIRED parallel registry (SPACE_SURFACES/ENTITY_SURFACES)',
  'parallel-catalog': 'declares a NEW parallel module catalog (by name)',
  'module-shape': 'declares admin-module-shaped rows outside a registered catalog',
  'hand-declared-menu': 'hand-declares menu rows inside the menu-resolution surface',
  'stale-allowance': 'has a stale FROZEN_MENU_DEBT entry',
  lane: 'breaks the APPS lane manifest',
  integrity: 'breaks the guard’s own integrity',
}

function main() {
  const { violations, ratchet } = runCheck()

  for (const r of ratchet.fell) {
    console.log(`↓ menu debt fell: ${r.file} ${r.from} → ${r.to}. Re-freeze it in FROZEN_MENU_DEBT (scripts/check-menu.mjs).`)
  }

  if (violations.length === 0) {
    const frozen = ratchet.held.reduce((n, r) => n + r.at, 0) + ratchet.fell.reduce((n, r) => n + r.to, 0)
    console.log(
      '✓ Menu contract: every module catalog is registered, the APPS lane manifest holds, and no new ' +
        `hand-declared menu entered the resolution surface (${frozen} row(s) of frozen debt in ` +
        `${ratchet.held.length + ratchet.fell.length} file(s) — see FROZEN_MENU_DEBT).`,
    )
    return
  }

  console.error('\n✗ Menu contract check failed — every menu row must trace to a catalog row:\n')
  for (const v of violations) {
    const where = v.line ? `${v.file}:${v.line}` : v.file
    console.error(`  • ${where} — ${WHY[v.kind] ?? v.kind}\n      ${v.text}`)
  }
  console.error(
    '\nAdd entries to SPACE_MODULES (lib/admin/modules/space-modules.ts) or ADMIN_MODULES\n' +
      '(lib/admin/modules/registry.ts); the rail + every /manage console resolve from those\n' +
      '(appsForScope / resolveSpaceMenu / resolveEntityConsole). Do NOT hand-roll a list, and do NOT\n' +
      'grow FROZEN_MENU_DEBT — it may only shrink. If this is genuinely not a menu, add\n' +
      '`// menu-ok: <reason>` on the line or classify the file in NOT_A_MENU with its real system.\n' +
      'See docs/MENU-CONTRACT.md + ADR-553 + ADR-927.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
