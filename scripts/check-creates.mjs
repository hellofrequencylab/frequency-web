#!/usr/bin/env node
// Governed-create adoption check (ADR-988 in docs/DECISIONS.md).
//
// WHAT THIS GUARDS. ADR-988 built a governed create layer — `proposeCreate` / `confirmCreate` in
// lib/ai/vera/create-entity.ts — and then shipped it with nothing requiring anyone to use it. Its
// own author named the gap: "adoption is per-surface and follows". Until a create path routes
// through that layer, the write reaches no audit row, the capability is re-checked once instead of
// twice, and the autonomy ladder has no evidence to be earned against.
//
// This gate makes that state VISIBLE and BOUNDED. It does not (and cannot) prove adoption on its
// own, so it does two separate, honest jobs:
//
//   RULE 1 — THE CENSUS (repo-wide, shape-based). Every write that inserts a row into a table
//     backing a Studio entity (ENTITY_TABLES) must be CLASSIFIED in ENTITY_WRITES: a member
//     create, an operator create, a copy of an existing row, a system materialization, or a
//     fixture. An unclassified entity-row write FAILS. This is the forward-looking half: a tenth
//     create path cannot land unnoticed, which is exactly how the first nine got here.
//
//   RULE 2 — ADOPTION. Every entry point in CREATE_ENTRIES (the exported server action a creation
//     surface actually calls) must CALL `confirmCreate` inside its own body, unless it is named in
//     UNROUTED with a dated reason. UNROUTED may only SHRINK: an entry that has since adopted, but
//     is still listed, FAILS as a stale allowance, so the list is a progress bar rather than an
//     amnesty.
//
//   RULE 3 — THE AUTONOMY WALL. The structural promises ADR-988 makes about `auto` are re-asserted
//     here, in the build, so they cannot be edited away quietly: `CreateAutonomyTier` is still
//     `Exclude<AutonomyTier, 'auto'>`, the declared tier is still `suggest`, `create_entity` is
//     still absent from `PlaybookActionTool` (the one union that CAN auto-execute), and
//     `confirmCreate` still re-derives the caller and re-checks the gate at the moment of the write.
//
//   RULE 4 — INTEGRITY. The governed layer still exists and still exports both phases; every file
//     named in a list below still exists and still exports the symbol it is registered under; and
//     the census found at least MIN_WRITE_SITES writes, so a broken regex reports red, not green.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS CANNOT DETECT. Stated plainly, because a coarse guard that overclaims is worse than a
// narrow one that says so. Green here does NOT mean "every create is governed". It means "no
// UNCLASSIFIED entity write exists, and every classified entry point either routes or is named".
//
//   * IT CANNOT JUDGE INTENT. Whether a given insert is a member creating a thing or the system
//     materializing one is a human call. That call lives in ENTITY_WRITES, written by a person.
//     The guard only enforces that SOME call was made and that the row still corresponds to a
//     real write.
//   * IT CANNOT SEE A WRITE IT CANNOT READ. Detection is textual: `.from('<table>').insert(` /
//     `.upsert(`, plus the registered untyped handles in TABLE_HANDLES (lib/spaces/provision.ts
//     wraps `spaces` in `spacesTable()` because the table is not in the generated types). A write
//     through an RPC, a Postgres function, a trigger, a raw SQL migration, a dynamically computed
//     table name, or a NEW untyped handle that nobody registers here is INVISIBLE.
//   * IT CANNOT PROVE THE ROUTING IS CORRECT. Rule 2 asks whether `confirmCreate` is CALLED in the
//     entry point's body. It does not check that the proposal being confirmed is the right one,
//     that the commit callback writes the entity the proposal named, or that a second ungoverned
//     write does not sit beside the governed one. A determined bypass passes.
//   * IT CANNOT FOLLOW THE CALL GRAPH. Adoption is checked at the ENTRY POINT, not at the writer,
//     because the governed layer takes the entity's own create path as a commit callback — so the
//     `confirmCreate` call and the `.insert(` legitimately live in different files. A brand-new
//     surface that calls an ALREADY-REGISTERED writer is therefore invisible to rule 2 until
//     somebody adds it to CREATE_ENTRIES. Rule 1 does not catch it either: the write is already
//     classified. This is the guard's largest hole and there is no static fix for it.
//   * IT DOES NOT GUARD THE DETERMINISTIC PATH. Nothing here asserts that creating a thing still
//     works with the AI kill switch off. That is what the runtime tests are for.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Escape hatch: an inline `// create-ok: <reason>` on the write line, for a write that is
// genuinely none of the five classifications. Prefer classifying it in ENTITY_WRITES — the whole
// value of this gate is the census being readable in one place.
//
// ⚠️ WHERE THIS RUNS (changed 2026-08-12). No longer a `check:*` entry in the CI guards array: it is
// enforced by scripts/check-creates.test.ts, whose "the live repo" block already called runCheck()
// against the real tree. Vitest AUTO-DISCOVERS `*.test.ts`, so unlike an array entry it cannot be
// forgotten — which is how THIS guard, shipped in PR #2098, ran nowhere for that PR's whole life.
//
// It stays BLOCKING, deliberately, and that is a judgement worth stating: its 18 unrouted creates
// are a NAMED SET (UNROUTED), not a count, so this gate is green today and only fires when a NEW
// ungoverned create appears. An unrelated PR cannot trip it, and the two ways out — route it, or
// add a dated line to UNROUTED — are both one edit. That is a ratchet, not a tracker.
//
// Still runnable by hand for the friendly report: `node scripts/check-creates.mjs`. Exits 1 on
// violation.
// Model: scripts/check-menu.mjs (the ratchet + integrity shape) and scripts/check-headers.mjs
// (KNOWN_DELEGATED — a named, dated, shrink-only allowlist).

import ts from 'typescript'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOTS = ['lib', 'app', 'components']
const ANNOTATION = '// create-ok:'

/** The governed layer itself. Both phases must survive for any of this to mean anything. */
const GOVERNED_MODULE = 'lib/ai/vera/create-entity.ts'
const GOVERNED_TOOLS = 'lib/ai/vera/create-tools.ts'
const PLAYBOOK_REGISTRY = 'lib/playbooks/registry.ts'
/** The import specifier an adopter uses. Both spellings resolve to GOVERNED_MODULE. */
const GOVERNED_SPECIFIERS = ['@/lib/ai/vera/create-entity', './create-entity']
/**
 * The exported names that ARE the confirm phase. `confirmCreate` is the primitive;
 * `confirmProposalWithRegisteredCommit` is the drafts surface's thin wrapper around it, in the same
 * module, which looks the commit up in the registry and then hands the whole decision straight to
 * `confirmCreate`. Both count, and nothing else does — a locally-defined function that happens to
 * share the name is not an adoption (see `routesThroughGovernedLayer`, which requires the import).
 */
const GOVERNED_CALLS = ['confirmCreate', 'confirmProposalWithRegisteredCommit']

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The tables a Studio entity lives in. Derived by hand from the nine manifests in
// lib/studio/entities/*; two of them share a table (`business` is a researched Space; a `service`
// is a `commerce_products` row whose product_kind says service), which is why this maps to a
// LABEL rather than to an entity id.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const ENTITY_TABLES = new Map([
  ['circles', 'circle'],
  ['events', 'event'],
  ['journey_plans', 'journey'],
  ['practices', 'practice'],
  ['spaces', 'space / business'],
  ['market_listings', 'listing (Classifieds)'],
  ['listings', 'listing (Housing + General)'],
  ['commerce_products', 'product / service'],
])

/**
 * Untyped table handles: a local helper that returns a query builder for a table the generated DB
 * types do not know yet, so `.from('<table>')` never appears in the source. Each one registered
 * here is a table this guard would otherwise be blind to. A NEW handle nobody registers is a hole
 * (see "WHAT THIS CANNOT DETECT" above).
 */
const TABLE_HANDLES = new Map([
  ['spacesTable', { table: 'spaces', file: 'lib/spaces/provision.ts' }],
])

// ─────────────────────────────────────────────────────────────────────────────────────────────
// RULE 1 — THE CENSUS. Every entity-row write in the repo, classified.
//
//   'create'      a genuine new-entity write a member drives. Must have at least one entry point
//                 in CREATE_ENTRIES, and that entry point is what rule 2 holds to account.
//   'operator'    an operator-only create behind the admin console.
//   'copy'        a duplicate / fork / remix / clone of a row that already exists.
//   'materialize' a row the SYSTEM mints as a consequence of a create that was already governed
//                 upstream (a Journey run's kickoff event, a remixed Circle's occurrences).
//   'fixture'     demo or seed data. Never a member's thing.
//
// Only 'create' rows carry an adoption obligation. The other four are the ANSWER to "how far
// should adoption go", written down per site instead of left implicit.
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const ENTITY_WRITES = new Map([
  // ── Genuine member creates. These are the nine roads. ──────────────────────────────────────
  ['lib/circles/draft.ts::createBlankCircleDraft', { role: 'create', entity: 'circle', why: 'THE member Circle road: a private draft the caller owns, from a spark or blank.' }],
  ['app/(main)/events/actions.ts::createEvent', { role: 'create', entity: 'event', why: 'THE member Event road. Entry point and writer are the same function.' }],
  ['lib/events/event-drafts.ts::createEventDraft', { role: 'create', entity: 'event', why: 'The Event draft shell behind the flyer scan and the Event Seeder.' }],
  ['lib/journey-plans.ts::createPlan', { role: 'create', entity: 'journey', why: 'THE member Journey road, behind all four /journeys create actions.' }],
  ['lib/practices.ts::createPractice', { role: 'create', entity: 'practice', why: 'THE member Practice road, behind the spark, the blank draft, and the Space road.' }],
  ['lib/spaces/provision.ts::createSpace', { role: 'create', entity: 'space', why: 'THE member Space road. Writes through the untyped spacesTable() handle.' }],
  ['lib/spaces/provision.ts::createBusinessSpace', { role: 'create', entity: 'business', why: 'The researched Space road (Business Seeder). Same table, different provenance.' }],
  ['lib/marketplace.ts::createListing', { role: 'create', entity: 'listing', why: 'THE Classifieds listing road (market_listings, ADR-148).' }],
  ['lib/listings/index.ts::createListing', { role: 'create', entity: 'listing', why: 'The connect-only listings base (Housing + General).' }],
  ['lib/commerce/products.ts::createProduct', { role: 'create', entity: 'product / service', why: 'THE Market road for both a product and a service; product_kind discriminates.' }],

  // ── Operator creates. Behind the admin console, with their own gate and their own audit. ────
  ['app/(main)/admin/actions.ts::createCircle', { role: 'operator', entity: 'circle', why: 'The operator console Circle create, behind the admin gate.' }],
  ['app/(main)/admin/events/actions.ts::createEvent', { role: 'operator', entity: 'event', why: 'The operator console Event create, behind the admin gate and the admin client.' }],

  // ── Copies. The source row is the consent; there is no draft to review. ─────────────────────
  ['lib/circles/remix.ts::remixTemplate', { role: 'copy', entity: 'circle', why: 'Remixes an existing template Circle into a private draft the member owns.' }],
  ['lib/journey-plans.ts::forkPlan', { role: 'copy', entity: 'journey', why: 'Forks an existing Journey the member can already see.' }],
  ['lib/journey-plans.ts::duplicatePlan', { role: 'copy', entity: 'journey', why: 'Duplicates a Journey the member already owns.' }],
  ['lib/commerce/products.ts::duplicateProduct', { role: 'copy', entity: 'product', why: 'The Catalog Duplicate action: a private copy of a row the seller already owns.' }],
  ['app/(main)/admin/content/actions.ts::cloneSeasonAction', { role: 'copy', entity: 'journey', why: 'Operator clone of a whole season of Journeys.' }],

  // ── System materializations. Consequences, not proposals. ──────────────────────────────────
  ['lib/circles/events.ts::generateCircleEvents', { role: 'materialize', entity: 'event', why: 'Mints the occurrence Events for a Circle whose own create was already governed.' }],
  ['lib/journeys/runs.ts::scheduleKickoff', { role: 'materialize', entity: 'event', why: 'The kickoff Event a Journey run schedules for itself.' }],
  ['lib/journeys/runs.ts::setPhaseEvent', { role: 'materialize', entity: 'event', why: 'The phase touchpoint Event a Journey run schedules for itself.' }],

  // ── Fixtures. Demo data behind the janitor console. ────────────────────────────────────────
  ['lib/demo/generate.ts::addDemoCircle', { role: 'fixture', entity: 'circle + event', why: 'Demo generator behind /admin/demo.' }],
  ['lib/demo/engine.ts::commitPlan', { role: 'fixture', entity: 'circle + event + journey', why: 'Demo Studio seeder behind /admin/demo/studio.' }],
])

// ─────────────────────────────────────────────────────────────────────────────────────────────
// RULE 2 — THE ENTRY POINTS. The exported server action a creation surface actually calls for
// each 'create' write above. This is where `confirmCreate` belongs, NOT at the writer: the
// governed layer takes the entity's own create path as a commit callback (ADR-988 §5), so the
// gate wraps the action and the writer stays untouched.
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const CREATE_ENTRIES = new Map([
  // THE DRAFTS SURFACE (ADR-998). The one adopter today, and the reason this rule can fire
  // POSITIVELY rather than only ever naming debt: a member confirming a pending proposal creates
  // a Circle through the governed layer, using the entity's own writer as the commit.
  ['app/(main)/drafts/actions.ts::confirmDraftAction', { entity: 'circle (registered commits)', writer: 'lib/circles/draft.ts::createBlankCircleDraft' }],
  // Circle
  ['app/(main)/circles/builder-actions.ts::createDraftFromSparkAction', { entity: 'circle', writer: 'lib/circles/draft.ts::createBlankCircleDraft' }],
  ['app/(main)/circles/builder-actions.ts::createBlankDraftAction', { entity: 'circle', writer: 'lib/circles/draft.ts::createBlankCircleDraft' }],
  ['app/(main)/spaces/[slug]/manage/circles/actions.ts::createSpaceCircleAction', { entity: 'circle', writer: 'lib/circles/draft.ts::createBlankCircleDraft' }],
  // Event
  ['app/(main)/events/actions.ts::createEvent', { entity: 'event', writer: 'app/(main)/events/actions.ts::createEvent' }],
  ['app/(main)/events/scan/actions.ts::saveDraft', { entity: 'event', writer: 'lib/events/event-drafts.ts::createEventDraft' }],
  // Journey
  ['app/(main)/journeys/create-actions.ts::createJourneyDraftAction', { entity: 'journey', writer: 'lib/journey-plans.ts::createPlan' }],
  ['app/(main)/journeys/create-actions.ts::createJourneyFromSparkAction', { entity: 'journey', writer: 'lib/journey-plans.ts::createPlan' }],
  ['app/(main)/journeys/create-actions.ts::createJourneyFromTemplateAction', { entity: 'journey', writer: 'lib/journey-plans.ts::createPlan' }],
  // Practice
  ['app/(main)/practices/create-actions.ts::createPracticeFromSparkAction', { entity: 'practice', writer: 'lib/practices.ts::createPractice' }],
  ['app/(main)/practices/actions.ts::createPracticeAction', { entity: 'practice', writer: 'lib/practices.ts::createPractice' }],
  ['app/(main)/practices/actions.ts::createPracticeDraftAction', { entity: 'practice', writer: 'lib/practices.ts::createPractice' }],
  ['app/(main)/spaces/[slug]/practices/actions.ts::createSpacePracticeAction', { entity: 'practice', writer: 'lib/practices.ts::createPractice' }],
  // Space + business
  ['lib/spaces/provision.ts::createSpace', { entity: 'space', writer: 'lib/spaces/provision.ts::createSpace' }],
  ['lib/spaces/provision.ts::createBusinessSpace', { entity: 'business', writer: 'lib/spaces/provision.ts::createBusinessSpace' }],
  // Listing
  ['app/(main)/classifieds/actions.ts::createListingAction', { entity: 'listing', writer: 'lib/marketplace.ts::createListing' }],
  ['app/(main)/marketplace/actions.ts::createHousingListingAction', { entity: 'listing', writer: 'lib/listings/index.ts::createListing' }],
  // Product + service
  ['app/(main)/marketplace/commerce-actions.ts::createMakerProductAction', { entity: 'product', writer: 'lib/commerce/products.ts::createProduct' }],
  ['app/(main)/spaces/[slug]/settings/shop/shop-actions.ts::createSpaceProductAction', { entity: 'product / service', writer: 'lib/commerce/products.ts::createProduct' }],
])

// ─────────────────────────────────────────────────────────────────────────────────────────────
// HOW FAR ADOPTION SHOULD GO — the entry points DELIBERATELY left out of CREATE_ENTRIES, each
// with the reason it is not a propose-and-confirm case. Silence would be the wrong answer here,
// so these are written down beside the ones that do carry an obligation.
//
// This map is documentation the guard reads: every file listed must still exist and still export
// the symbol, so a route that moves cannot leave a stale justification behind.
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const NOT_PROPOSE_AND_CONFIRM = new Map([
  [
    'app/(main)/admin/actions.ts::createCircle',
    'OPERATOR. Behind the admin gate, on the admin client, in the operator console. A staff member typing a Circle into /admin IS the human confirm, and the console has its own audit surface.',
  ],
  [
    'app/(main)/admin/events/actions.ts::createEvent',
    'OPERATOR. The same reasoning for Events: an operator typing one into /admin/events is behind the admin gate, on the admin client, and is the human confirm.',
  ],
  [
    'app/(main)/admin/marketplace/actions.ts::createShopProductAction',
    'OPERATOR. The platform Shop catalog, owner_kind=platform. Not a member create at all.',
  ],
  [
    'app/(main)/admin/listing-seeder/actions.ts::publishListingIntakeAction',
    'ALREADY PROPOSE-AND-CONFIRM. The Listing Seeder stages every row in its own intake table and an operator approves each one on a review board. That approve tap IS the confirm; a second proposal row would audit the same decision twice.',
  ],
  [
    'app/(main)/admin/event-seeder/actions.ts::approveStagedEvent',
    'ALREADY PROPOSE-AND-CONFIRM. The Event Seeder (ADR-989) stages into event_intake and an operator approves each row. Same reasoning as the Listing Seeder.',
  ],
  [
    'app/(main)/journeys/[slug]/edit/actions.ts::mintPracticeForBlockAction',
    'MATERIALIZATION. A Journey block mints its own Practice as a consequence of an edit the author already made in the editor. There is no separate draft for them to approve.',
  ],
  [
    'app/(main)/journeys/create-actions.ts::createMasterFrameworkAction',
    'CURRICULUM TOOLING. Mints the platform master framework rather than a member Journey; it is operator-shaped and does not belong on a member review board.',
  ],
  [
    'app/(main)/circles/remix-actions.ts::remixTemplateAction',
    'COPY. Remixing an existing template is not a drafted proposal: the template the member picked IS the thing they reviewed.',
  ],
  [
    'app/(main)/admin/demo/actions.ts::addCircle',
    'FIXTURE. Demo data behind the janitor console. Auditing it would pollute the very log the autonomy ladder is read from.',
  ],
])

// ─────────────────────────────────────────────────────────────────────────────────────────────
// UNROUTED — the entry points that SHOULD route and do not yet (ADR-988 shipped the layer with no
// adopters, and the wizards were being reshaped by five other agents at the time).
//
// They are NOT excused. They are NAMED, so the gate is green over a dated, reviewable list rather
// than green over a hole it never looked into. The list may only SHRINK: route an entry, delete
// its line. An entry that HAS adopted but is still listed FAILS as a stale allowance, so this
// cannot rot into a permanent amnesty. Anything not on this list fails on sight.
//
// 🔴 THE CONTRACT IS THEREFORE UNENFORCED TODAY. Every line below is real, unaudited create
// volume. See ADR-988 in docs/DECISIONS.md for the order to route them in.
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const UNROUTED = new Map([
  ['app/(main)/circles/builder-actions.ts::createDraftFromSparkAction', '2026-08-11 — the Circle builder. Vera already drafts this spark, so it is the highest-value first adopter.'],
  ['app/(main)/circles/builder-actions.ts::createBlankDraftAction', '2026-08-11 — the "I will write it myself" Circle road. Adopts alongside the spark road.'],
  ['app/(main)/spaces/[slug]/manage/circles/actions.ts::createSpaceCircleAction', '2026-08-11 — the Space manager Circle road; same writer, a scoped Space gate on top.'],
  ['app/(main)/events/actions.ts::createEvent', '2026-08-11 — the member Event road. Takes FormData, so adopting it means lifting the parse above the propose call first.'],
  ['app/(main)/events/scan/actions.ts::saveDraft', '2026-08-11 — the flyer-scan Event draft. Owned by the Event Seeder agent this cycle.'],
  ['app/(main)/journeys/create-actions.ts::createJourneyDraftAction', '2026-08-11 — the deferred-title Journey create. Redirects on completion, so adopting it means returning the slug instead.'],
  ['app/(main)/journeys/create-actions.ts::createJourneyFromSparkAction', '2026-08-11 — the guided Journey builder commit. Vera drafts the identity, so this is the second-highest-value adopter.'],
  ['app/(main)/journeys/create-actions.ts::createJourneyFromTemplateAction', '2026-08-11 — the template Journey road.'],
  ['app/(main)/practices/create-actions.ts::createPracticeFromSparkAction', '2026-08-11 — the guided Practice builder commit. Vera drafts it.'],
  ['app/(main)/practices/actions.ts::createPracticeAction', '2026-08-11 — the title+description Practice create. Owned by another agent this cycle.'],
  ['app/(main)/practices/actions.ts::createPracticeDraftAction', '2026-08-11 — the blank Practice draft. Owned by another agent this cycle.'],
  ['app/(main)/spaces/[slug]/practices/actions.ts::createSpacePracticeAction', '2026-08-11 — the Space Practice road.'],
  ['lib/spaces/provision.ts::createSpace', '2026-08-11 — the member Space road. Scoped gate (the plan limit) lives in the commit, so the governed layer records it rather than re-checking it.'],
  ['lib/spaces/provision.ts::createBusinessSpace', '2026-08-11 — the researched Space road. Same scoped gate, plus a provenance ledger the governed layer can already validate.'],
  ['app/(main)/classifieds/actions.ts::createListingAction', '2026-08-11 — the Classifieds listing spark.'],
  ['app/(main)/marketplace/actions.ts::createHousingListingAction', '2026-08-11 — the Housing listing road.'],
  ['app/(main)/marketplace/commerce-actions.ts::createMakerProductAction', '2026-08-11 — the maker product road.'],
  ['app/(main)/spaces/[slug]/settings/shop/shop-actions.ts::createSpaceProductAction', '2026-08-11 — the Shop catalog road, which is ALSO the only road that creates a service.'],
])

/** A census that finds almost nothing must fail rather than report a clean contract. Measured 24
 *  write sites on 2026-08-11; the floor sits under that and far above zero. Same pattern as
 *  MIN_SURFACE_FILES in check-menu.mjs and MIN_ROWS in check-gate-parity.mjs. */
export const MIN_WRITE_SITES = 18

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Filesystem + AST helpers.
// ─────────────────────────────────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const posix = (p) => p.split('\\').join('/')

function parse(file, src) {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

/** The write-site matcher: `.from('<entity table>')` or a registered untyped handle, then
 *  `.insert(` / `.upsert(`, tolerating the newline the formatter puts between them. */
function writeRegex() {
  const tables = [...ENTITY_TABLES.keys()].join('|')
  const handles = [...TABLE_HANDLES.keys()].join('|')
  return new RegExp(
    `(?:\\.from\\(\\s*['"](${tables})['"]\\s*\\)|\\b(${handles})\\(\\s*\\))\\s*\\.\\s*(insert|upsert)\\s*\\(`,
    'g',
  )
}

/**
 * The name of the TOP-LEVEL declaration containing an offset: a function declaration, or the
 * variable a function expression is assigned to. Returns null when the write sits at module
 * scope. Outermost, deliberately — a helper closure inside `createEvent` is still `createEvent`
 * as far as the census is concerned.
 */
export function enclosingDeclaration(sf, pos) {
  for (const st of sf.statements) {
    if (pos < st.getStart(sf) || pos > st.getEnd()) continue
    if (ts.isFunctionDeclaration(st) && st.name) return st.name.text
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && pos >= d.getStart(sf) && pos <= d.getEnd()) {
          return d.name.text
        }
      }
    }
    if (ts.isClassDeclaration(st) && st.name) return st.name.text
  }
  return null
}

/** Every entity-row write in one file: `{ key, line, table, fn }`. PURE over the source string,
 *  so the companion test can drive it with fixtures. */
export function entityWriteSites(file, src) {
  const re = writeRegex()
  if (!re.test(src)) return []
  re.lastIndex = 0
  const sf = parse(file, src)
  const lines = src.split('\n')
  const out = []
  let m
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length
    // A handle only counts inside the file that declares it, so an unrelated `spacesTable()`
    // elsewhere cannot be mistaken for a write to `spaces`.
    const handle = m[2]
    if (handle) {
      const owner = TABLE_HANDLES.get(handle)
      if (!owner || posix(file) !== owner.file) continue
    }
    if ((lines[line - 1] ?? '').includes(ANNOTATION)) continue
    const table = m[1] ?? TABLE_HANDLES.get(handle)?.table
    const fn = enclosingDeclaration(sf, m.index)
    out.push({ key: `${posix(file)}::${fn ?? '(module scope)'}`, line, table, fn, op: m[3] })
  }
  return out
}

/**
 * Whether an exported function ROUTES through the governed layer: the file imports from
 * lib/ai/vera/create-entity, and the named function's own body calls `confirmCreate`.
 *
 * Deliberately NOT "the file mentions confirmCreate": a file with ten actions, one of which
 * adopted, must not launder the other nine. PURE over the source string.
 */
export function routesThroughGovernedLayer(file, src, fnName) {
  const sf = parse(file, src)
  let imported = false
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    if (!GOVERNED_SPECIFIERS.includes(st.moduleSpecifier.text)) continue
    const named = st.importClause?.namedBindings
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) {
        if (GOVERNED_CALLS.includes((el.propertyName ?? el.name).text)) imported = true
      }
    }
  }
  if (!imported) return false

  let body = null
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === fnName) body = st.body ?? null
    else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === fnName && d.initializer) body = d.initializer
      }
    }
  }
  if (!body) return false

  let calls = false
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && GOVERNED_CALLS.includes(n.expression.text)) calls = true
    ts.forEachChild(n, visit)
  }
  visit(body)
  return calls
}

/** Whether a file exports a symbol by that name (function or const). */
function exportsSymbol(src, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${esc}\\b`).test(src)
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// RULE 3 — the autonomy wall. Four textual promises ADR-988 makes, re-asserted in the build.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export function autonomyWallViolations(read = (f) => readFileSync(f, 'utf8')) {
  const out = []
  const need = (file, re, what) => {
    if (!existsSync(file)) {
      out.push(`${file} is missing — the autonomy wall cannot be verified`)
      return
    }
    if (!re.test(read(file))) out.push(`${file}: ${what}`)
  }
  need(
    GOVERNED_TOOLS,
    /export\s+type\s+CreateAutonomyTier\s*=\s*Exclude<\s*AutonomyTier\s*,\s*'auto'\s*>/,
    "`CreateAutonomyTier` is no longer `Exclude<AutonomyTier, 'auto'>` — grading creation `auto` must stay a COMPILE error, not a test failure",
  )
  need(
    GOVERNED_TOOLS,
    /CREATE_AUTONOMY_TIER\s*:\s*CreateAutonomyTier\s*=\s*'suggest'/,
    'the declared create tier is no longer `suggest`',
  )
  need(
    GOVERNED_MODULE,
    /getCallerProfile\(\)/,
    '`confirmCreate` no longer re-derives the caller from the session — a passed profile id must never be trusted',
  )
  need(
    GOVERNED_MODULE,
    /passesGate\(gate\)/,
    'the gate is no longer re-checked at the moment of the write',
  )
  need(GOVERNED_MODULE, /\.eq\('status',\s*'proposed'\)/, 'the single-use claim (a conditional update on status) is gone, so a proposal could be spent twice')
  if (existsSync(PLAYBOOK_REGISTRY) && /'create_entity'/.test(read(PLAYBOOK_REGISTRY))) {
    out.push(`${PLAYBOOK_REGISTRY}: \`create_entity\` now appears in the playbook registry — the one path that CAN auto-execute a governed tool must never be able to name it`)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The run.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export function runCheck() {
  const violations = []
  const seenWrites = new Set()
  let siteCount = 0

  // RULE 1 — the census.
  for (const f of ROOTS.flatMap((r) => walk(r))) {
    const src = readFileSync(f, 'utf8')
    for (const site of entityWriteSites(f, src)) {
      siteCount += 1
      if (ENTITY_WRITES.has(site.key)) {
        seenWrites.add(site.key)
        continue
      }
      violations.push({
        file: posix(f),
        line: site.line,
        kind: 'unclassified-write',
        text: `${site.op} into \`${site.table}\` from \`${site.fn ?? 'module scope'}\` is not classified in ENTITY_WRITES`,
      })
    }
  }
  for (const key of ENTITY_WRITES.keys()) {
    if (!seenWrites.has(key)) {
      violations.push({
        file: key.split('::')[0],
        kind: 'stale-census',
        text: `\`${key}\` is classified in ENTITY_WRITES but no longer writes an entity row (moved, renamed, or removed) — update the census rather than letting it rot`,
      })
    }
  }

  // RULE 2 — adoption, ratcheted against UNROUTED.
  const ratchet = { routed: [], unrouted: [] }
  for (const [key, meta] of CREATE_ENTRIES) {
    const [file, fn] = key.split('::')
    if (!existsSync(file)) {
      violations.push({ file, kind: 'integrity', text: `create entry \`${key}\` points at a file that does not exist` })
      continue
    }
    const src = readFileSync(file, 'utf8')
    if (!exportsSymbol(src, fn)) {
      violations.push({ file, kind: 'integrity', text: `create entry \`${key}\` is no longer exported from that file — update CREATE_ENTRIES rather than losing the obligation` })
      continue
    }
    const routed = routesThroughGovernedLayer(file, src, fn)
    if (routed) {
      ratchet.routed.push(key)
      if (UNROUTED.has(key)) {
        violations.push({
          file,
          kind: 'stale-allowance',
          text: `\`${key}\` now routes through confirmCreate but is still listed in UNROUTED — delete its line so the allowlist keeps shrinking`,
        })
      }
      continue
    }
    if (UNROUTED.has(key)) {
      ratchet.unrouted.push({ key, entity: meta.entity })
      continue
    }
    violations.push({
      file,
      kind: 'ungoverned-create',
      text: `\`${fn}\` creates a ${meta.entity} without calling confirmCreate — route it through lib/ai/vera/create-entity.ts, or name it in UNROUTED with a dated reason`,
    })
  }
  for (const key of UNROUTED.keys()) {
    if (!CREATE_ENTRIES.has(key)) {
      violations.push({
        file: key.split('::')[0],
        kind: 'stale-allowance',
        text: `\`${key}\` is in UNROUTED but is not a registered create entry — delete its line`,
      })
    }
  }

  // The deliberate exclusions must still name real code.
  for (const key of NOT_PROPOSE_AND_CONFIRM.keys()) {
    const [file, fn] = key.split('::')
    if (!existsSync(file) || !exportsSymbol(readFileSync(file, 'utf8'), fn)) {
      violations.push({
        file,
        kind: 'stale-exclusion',
        text: `\`${key}\` is excused in NOT_PROPOSE_AND_CONFIRM but no longer exists — a justification cannot outlive the code it justifies`,
      })
    }
  }

  // RULE 3 — the autonomy wall.
  for (const text of autonomyWallViolations()) violations.push({ file: '(autonomy wall)', kind: 'autonomy', text })

  // RULE 4 — integrity of the governed layer itself.
  if (!existsSync(GOVERNED_MODULE)) {
    violations.push({ file: GOVERNED_MODULE, kind: 'integrity', text: 'the governed create layer is missing' })
  } else {
    const src = readFileSync(GOVERNED_MODULE, 'utf8')
    for (const sym of ['proposeCreate', 'confirmCreate']) {
      if (!exportsSymbol(src, sym)) {
        violations.push({ file: GOVERNED_MODULE, kind: 'integrity', text: `the governed layer no longer exports \`${sym}\`` })
      }
    }
  }
  for (const [handle, owner] of TABLE_HANDLES) {
    if (!existsSync(owner.file) || !new RegExp(`\\b${handle}\\b`).test(readFileSync(owner.file, 'utf8'))) {
      violations.push({
        file: owner.file,
        kind: 'integrity',
        text: `registered untyped table handle \`${handle}\` is gone — writes to \`${owner.table}\` may now be invisible to this gate`,
      })
    }
  }

  return { violations, ratchet, siteCount }
}

const WHY = {
  'unclassified-write': 'writes an entity row that nobody has classified',
  'stale-census': 'has a stale ENTITY_WRITES entry',
  'ungoverned-create': 'creates a Studio entity outside the governed layer',
  'stale-allowance': 'has a stale UNROUTED entry',
  'stale-exclusion': 'has a stale NOT_PROPOSE_AND_CONFIRM entry',
  autonomy: 'weakens the autonomy wall',
  integrity: "breaks the guard's own integrity",
}

function main() {
  const { violations, ratchet, siteCount } = runCheck()

  if (siteCount < MIN_WRITE_SITES) {
    console.error(
      `\n✗ check:creates found only ${siteCount} entity-row write(s), expected at least ${MIN_WRITE_SITES}.\n` +
        '  The tables moved, a handle was renamed, or the matcher broke. A census that sees almost\n' +
        '  nothing must fail rather than report a clean contract.\n',
    )
    process.exit(1)
  }

  if (violations.length === 0) {
    console.log(
      `✓ Create contract: ${siteCount} entity-row write(s) all classified; ` +
        `${ratchet.routed.length} of ${CREATE_ENTRIES.size} create entry point(s) route through the governed layer, ` +
        `${ratchet.unrouted.length} named in UNROUTED (see scripts/check-creates.mjs).`,
    )
    if (ratchet.unrouted.length > 0) {
      console.log(
        '  Still unrouted: ' + ratchet.unrouted.map((r) => r.key).join(', ') + '\n' +
          '  This gate is honest, not satisfied. Route one, delete its line.',
      )
    }
    return
  }

  console.error('\n✗ Create contract check failed:\n')
  for (const v of violations) {
    const where = v.line ? `${v.file}:${v.line}` : v.file
    console.error(`  • ${where} — ${WHY[v.kind] ?? v.kind}\n      ${v.text}`)
  }
  console.error(
    '\nCreating a thing is a governed write (ADR-988). A creation entry point PROPOSES and a human\n' +
      'CONFIRMS, so the write lands in the audit log the autonomy ladder is earned against:\n' +
      '  • propose  lib/ai/vera/create-entity.ts  proposeCreate({ entity, draft, spaceId })\n' +
      '  • confirm  the same file                 confirmCreate({ proposalId, commit })\n' +
      'The commit stays with the entity: pass its existing create path as the callback, never\n' +
      're-implement it inside the governance layer.\n' +
      'If a write is genuinely not a member create, classify it in ENTITY_WRITES with a reason. If an\n' +
      'entry point genuinely should not propose-and-confirm, say so in NOT_PROPOSE_AND_CONFIRM. Do NOT\n' +
      'grow UNROUTED — it may only shrink. See ADR-988 in docs/DECISIONS.md.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
