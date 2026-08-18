#!/usr/bin/env node
// check:cosmetic-renders — a cosmetic a member can BUY must be something the product can SHOW.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// The Vault Store has sold profile borders, flairs and titles since the gem-store migration.
// Redeeming one wrote `profiles.profile_border` / `profile_flair` / `custom_title`, and NOTHING in
// the product read those three columns except a chip in the buyer's own Vault that printed the raw
// stored string. "A glowing indigo border around your avatar" (250 Gems) rendered as the words
// "Border: indigo", on the page the member bought it from, visible to no one else.
//
// Alongside that, five shelf rows carried `metadata = {}`, so `classifyRedemption` routed them to
// `pending` — the path that means "an operator will honor this by hand". No operator queue existed,
// and no operator can hand-deliver a profile border anyway.
//
// Measured against production on 2026-08-17: 3 paid redemptions, 950 Gems, ONE real member, 51 days
// earlier. Small, and real. This guard is what stops the next one.
//
// ── WHAT IT ENFORCES ──────────────────────────────────────────────────────────────────────────
//
// For every PURCHASABLE row on the shelf census (`is_active` AND `gem_cost > 0`) in a category
// that promises a visible profile change (`cosmetic`, `title`):
//
//   · it resolves in the render registry (lib/store/cosmetics.ts)          -> fine
//   · it does NOT resolve, and is DECLARED in the census quarantine        -> pass, LOUDLY
//   · it does NOT resolve, and is undeclared                               -> FAIL
//
// A `feature` or `membership` SKU is an operator-honored perk (its queue is on /admin/store) and a
// `collectible` renders as a chip in the member's collection, so neither owes a painted cosmetic.
// Those two exemptions are the whole reason the check is category-scoped rather than shelf-wide;
// widening it would make the gate noisy and a noisy gate gets an allowlist.
//
// ── WHY QUARANTINE IS A PASS, AND WHY IT IS STILL SAFE ────────────────────────────────────────
//
// The fix for the four declared rows is `update store_items set is_active = false` in production —
// an action no PR can take (docs/proposals/LIVE-013-cosmetic-fulfillment.sql, the owner's to
// apply). Failing CI on them holds every unrelated change hostage to that, which is exactly the
// state ADR-970 says gets routed around and then reads as coverage. So they PASS and are printed
// on every run. What keeps that honest is the anti-rot arm: a quarantine entry whose slug is no
// longer purchasable, or that the registry now resolves, is a claim that has rotted and FAILS —
// so an entry cannot quietly outlive its fix. Meanwhile the CODE path is already closed
// regardless: `redeemItem` refuses an undeliverable SKU before charging, so a quarantined row on
// the live shelf takes no Gems while it waits.
//
// ⚠️ `--probe` DOES NOT TAKE THIS SPLIT, deliberately — same shape as check-stored-blocks.mjs. It
// answers "is LIVE-013 done?", and while a purchasable SKU still cannot be delivered the answer is
// NO. check:backlog reads it; an `open` row whose probe says NOT DONE is consistent.
//
// ── THE SPLIT BETWEEN THE TWO FILES ───────────────────────────────────────────────────────────
//
// The registry is TypeScript, so bare node cannot import it. This file therefore EXTRACTS the
// registry's vocabulary by parsing the source, and refuses to guess: if the expected shape is not
// found it exits 79 ("I could not look") rather than 0. `scripts/check-cosmetic-renders.test.ts`
// is the enforcing half — it imports the LIVE registry under vitest, asserts the extractor agrees
// with it exactly (so the parser can never drift into a false pass), and drives this module's
// classifier against broken fixtures so the detector is PROVEN to fire.
//
// ⚠️ WHAT THIS CANNOT SEE, stated rather than glossed. The shelf is a SNAPSHOT taken by hand
// (`recaptureQuery` is in the JSON). It catches the direction that keeps biting — a SKU on sale
// with nothing to show for it — because the registry half is read live on every run. It does NOT
// catch a SKU an operator activates at /admin/store after the capture date; only a credentialled
// re-capture can, and this repo has no credentialled CI job (the same limitation check:migrations
// rule 4 and check:stored-blocks record, stated the same way rather than hidden).
//
// Usage:
//   node scripts/check-cosmetic-renders.mjs          # 0 = no undeclared gap and no rotted entry
//                                                    # 1 = an undeclared gap, or a rotted entry
//                                                    # 79 = census/registry unreadable, or below floors
//   node scripts/check-cosmetic-renders.mjs --probe  # 0 = quarantine EMPTY · 1 = gaps remain · 79 = cannot tell
// Model: scripts/check-stored-blocks.mjs (floors, loud degradation, never a vacuous pass).

import { readFileSync, existsSync } from 'node:fs'

export const CENSUS_PATH = 'scripts/store-shelf.json'
export const REGISTRY_PATH = 'lib/store/cosmetics.ts'

/** The exit code that means "I could not look", per check-backlog.mjs. A probe that cannot read
 *  its own corpus must never answer 0 or 1: "I found nothing" and "I could not look" are
 *  different facts and this repo has already shipped them spelled the same way once. */
export const INDETERMINATE = 79

/** Categories whose SKUs promise a visible profile change. Mirrors RENDER_REQUIRED_CATEGORIES in
 *  the registry; the test asserts the two agree, so this copy cannot drift. */
export const RENDER_REQUIRED_CATEGORIES = ['cosmetic', 'title']

/** Floors. A census that shrank to nothing would make every assertion below vacuously true, and a
 *  ✓ printed over nothing is the one thing a gate must never do (ADR-962).
 *
 *  Measured 2026-08-17: 31 purchasable SKUs, 14 of them in a render-required category, 5 categories.
 *  The floors sit deliberately below those so ordinary churn does not trip them. Lower one ONLY
 *  alongside a real deletion, and name the deletion. Never to make a run green. */
export const MIN_SHELF = 20
export const MIN_RENDER_REQUIRED = 10

/** Read the shelf census. Throws rather than defaulting: an empty census is the one input that
 *  would sail through classify() looking like a clean run. */
export function loadCensus(path = CENSUS_PATH, io = {}) {
  const read = io.readFile ?? ((p) => readFileSync(p, 'utf8'))
  const exists = io.exists ?? existsSync
  if (!exists(path)) throw new Error(`${path} is missing — the shelf census is the corpus this guard measures.`)
  const doc = JSON.parse(read(path))
  if (!Array.isArray(doc.shelf)) throw new Error(`${path} has no "shelf" array.`)
  if (!Array.isArray(doc.quarantine)) throw new Error(`${path} has no "quarantine" array.`)
  return doc
}

/**
 * The registry vocabulary, extracted from TypeScript source.
 *
 * Returns `{ borders, flairs, bridged, maxTitleLength }` (three Sets and a number), or NULL when
 * the expected shape is absent — which the CLI turns into 79. It never falls back to a default
 * vocabulary: a guard that invents its own idea of what renders would pass a shelf nothing paints.
 */
export function extractRegistry(source) {
  const borders = recordKeys(source, 'BORDER_RENDERS')
  const flairs = recordKeys(source, 'FLAIR_RENDERS')
  const bridged = recordKeys(source, 'SLUG_COSMETICS')
  const max = source.match(/export const MAX_TITLE_LENGTH\s*=\s*(\d+)/)
  if (!borders || !flairs || !bridged || !max) return null
  if (borders.size === 0 || flairs.size === 0) return null
  return { borders, flairs, bridged, maxTitleLength: Number(max[1]) }
}

/** Top-level keys of an exported `const NAME … = { … }` object literal. Brace-counted rather than
 *  regex-matched to the closing brace, so a nested object in a value cannot end the scan early. */
function recordKeys(source, name) {
  // ⚠️ Anchor on the ASSIGNMENT, not on the declaration. `Record<string, { icon: string }>` is a
  // type annotation containing a brace, so "the first `{` after `export const NAME`" lands inside
  // the TYPE and parses its members as if they were the record's keys. That is not hypothetical:
  // the first run of this guard reported all five flair SKUs as unrenderable because FLAIR_RENDERS
  // came back as the set { icon }. `[^=]*` cannot cross the `=`, so this anchor is the real one —
  // and the test cross-checks every extracted set against the live import, which is what turns
  // "the parser looks right" into "the parser agrees with the module".
  const m = new RegExp(`export const ${name}\\b[^=]*=`).exec(source)
  if (!m) return null
  const open = source.indexOf('{', m.index + m[0].length)
  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return null
  const body = source.slice(open + 1, end)

  const keys = new Set()
  let depth2 = 0
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    // Only lines at the literal's own level declare its keys.
    if (depth2 === 0) {
      const m = line.match(/^(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$]*))\s*:/)
      if (m) keys.add(m[1] ?? m[2] ?? m[3])
    }
    for (const ch of rawLine) {
      if (ch === '{') depth2++
      else if (ch === '}') depth2--
    }
  }
  return keys
}

/** `ring-indigo-500` / `ring-gradient` → `indigo` / `gradient`. Mirrors normalizeBorderValue in the
 *  registry; the test asserts the two agree on every shelf value. */
export function normalizeBorderValue(value) {
  return String(value).trim().replace(/^ring-/, '').replace(/-\d{2,3}$/, '')
}

/** Does this shelf row resolve to something the registry paints? Pure; takes the extracted
 *  vocabulary so the test can drive it with the LIVE registry instead of the parsed one. */
export function resolvesToRender(item, registry) {
  const meta = item.metadata ?? null
  const type = meta && typeof meta === 'object' ? meta.type : undefined
  const value = meta && typeof meta === 'object' ? meta.value : undefined
  if (type === 'border') return typeof value === 'string' && registry.borders.has(normalizeBorderValue(value))
  if (type === 'flair') return typeof value === 'string' && registry.flairs.has(value.trim().toLowerCase())
  if (type === 'title') {
    if (typeof value !== 'string') return false
    const t = value.trim()
    return t.length > 0 && t.length <= registry.maxTitleLength
  }
  // No cosmetic type in the metadata: the slug bridge is the only other answer.
  return registry.bridged.has(item.slug)
}

/** Purchasable rows in a category that owes a render. The population every assertion below is
 *  about, and the thing the MIN_RENDER_REQUIRED floor protects from silently emptying. */
export function renderRequired(census) {
  return (census.shelf ?? []).filter(
    (i) => i.is_active === true && Number(i.gem_cost) > 0 && RENDER_REQUIRED_CATEGORIES.includes(i.category),
  )
}

/** The integrity floors, as a list of problems (empty = fine). Separated from classify() so the
 *  test can assert that an emptied census FAILS rather than reading as clean. */
export function integrityProblems(census, opts = {}) {
  const { minShelf = MIN_SHELF, minRenderRequired = MIN_RENDER_REQUIRED } = opts
  const problems = []
  const shelf = census.shelf ?? []
  if (shelf.length < minShelf) problems.push(`only ${shelf.length} shelf row(s) (floor ${minShelf}) — the census looks truncated`)
  const scoped = renderRequired(census)
  if (scoped.length < minRenderRequired) {
    problems.push(`only ${scoped.length} purchasable cosmetic/title SKU(s) (floor ${minRenderRequired}) — the census looks truncated`)
  }
  if (!census.capturedAt) problems.push('no "capturedAt" — a corpus with no capture date cannot be reasoned about')
  for (const row of shelf) {
    if (!row.slug) problems.push('a shelf row has no "slug"')
    else if (!row.category) problems.push(`shelf row "${row.slug}" has no "category"`)
    else if (typeof row.gem_cost !== 'number') problems.push(`shelf row "${row.slug}" has no numeric "gem_cost"`)
  }
  return problems
}

/**
 * The whole verdict, pure.
 *
 * @param {object} census   the parsed shelf census
 * @param {{ borders: Set<string>, flairs: Set<string>, bridged: Set<string>, maxTitleLength: number }} registry
 * @returns {{
 *   integrity: string[],
 *   undeclared: string[],        // purchasable, unrenderable, NOT quarantined -> FAIL
 *   quarantined: string[],       // declared, and genuinely unrenderable -> tolerated, printed
 *   staleQuarantine: string[],   // declared, but now renderable or no longer purchasable -> FAIL
 *   incompleteQuarantine: string[], // declared with no reason / no resolution -> FAIL
 * }}
 */
export function classify(census, registry) {
  const scoped = renderRequired(census)
  const quarantine = census.quarantine ?? []
  const declared = new Map(quarantine.map((q) => [q.slug, q]))

  const undeclared = []
  const quarantined = []
  for (const item of scoped) {
    if (resolvesToRender(item, registry)) continue
    if (declared.has(item.slug)) quarantined.push(item.slug)
    else undeclared.push(item.slug)
  }

  // A quarantine entry the registry now paints, or whose SKU is no longer purchasable, is a claim
  // that has rotted. Delete it — an entry nobody removes is how a waiver becomes permanent cover.
  const stillBroken = new Set([...undeclared, ...quarantined])
  const staleQuarantine = quarantine.filter((q) => !stillBroken.has(q.slug)).map((q) => q.slug)

  // An entry with no reason or no resolution is an excuse, not a declaration.
  const incompleteQuarantine = quarantine
    .filter((q) => !q.reason || !q.resolution)
    .map((q) => q.slug)

  return {
    integrity: integrityProblems(census),
    undeclared: undeclared.sort(),
    quarantined: quarantined.sort(),
    staleQuarantine: staleQuarantine.sort(),
    incompleteQuarantine: incompleteQuarantine.sort(),
  }
}

/**
 * The human report. Returns lines + an exit code, so the tests can drive every branch.
 *
 * `probe: false` (the guard): 79 on a broken census · 1 on an UNDECLARED gap or a ROTTED entry ·
 * 0 otherwise, printing any declared quarantine loudly so it can never read as ordinary coverage.
 * `probe: true` (the backlog probe): 79 on a broken census · 1 while ANY purchasable SKU is
 * unrenderable · 0 when none is. See the header for why these two answers differ on purpose.
 */
export function report(census, registry, { probe = false } = {}) {
  const lines = []
  const problems = integrityProblems(census)
  if (problems.length) {
    lines.push('', `🔴 check:cosmetic-renders — the shelf census failed its integrity floors (${CENSUS_PATH}):`, '')
    for (const p of problems) lines.push(`    ${p}`)
    lines.push(
      '',
      '    A census that measures nothing passes everything. Re-capture it with the SQL in',
      `    ${CENSUS_PATH} ("recaptureQuery") rather than lowering a floor.`,
      '',
    )
    return { code: INDETERMINATE, lines }
  }

  const v = classify(census, registry)
  const scoped = renderRequired(census)

  if (probe) {
    const remaining = [...v.undeclared, ...v.quarantined].sort()
    if (remaining.length) {
      lines.push(
        '',
        `LIVE-013 NOT DONE — ${remaining.length} purchasable cosmetic/title SKU(s) still resolve to nothing the product renders:`,
        ...remaining.map((s) => `    ${s}`),
        '',
      )
      return { code: 1, lines }
    }
    lines.push('', `LIVE-013 done — all ${scoped.length} purchasable cosmetic/title SKUs resolve to a render.`, '')
    return { code: 0, lines }
  }

  let code = 0

  if (v.undeclared.length) {
    code = 1
    lines.push(
      '',
      `🔴 check:cosmetic-renders — ${v.undeclared.length} purchasable SKU(s) charge Gems for something nothing renders:`,
      '',
      ...v.undeclared.map((s) => `    ${s}`),
      '',
      '    Fix it one of two ways, and prefer the first: add the value to the render registry',
      `    (${REGISTRY_PATH}) so the member gets the thing, or take the SKU off the shelf and`,
      `    declare it in the "quarantine" array of ${CENSUS_PATH} with a reason and a resolution.`,
      '',
    )
  }

  if (v.staleQuarantine.length) {
    code = 1
    lines.push(
      '',
      `🔴 check:cosmetic-renders — ${v.staleQuarantine.length} quarantine entr(ies) have rotted:`,
      '',
      ...v.staleQuarantine.map((s) => `    ${s} — now renders, or is no longer purchasable`),
      '',
      `    Delete the entry from ${CENSUS_PATH}. A waiver nobody removes becomes coverage.`,
      '',
    )
  }

  if (v.incompleteQuarantine.length) {
    code = 1
    lines.push(
      '',
      `🔴 check:cosmetic-renders — ${v.incompleteQuarantine.length} quarantine entr(ies) are missing a "reason" or a "resolution":`,
      '',
      ...v.incompleteQuarantine.map((s) => `    ${s}`),
      '',
      '    An entry with neither is an excuse, not a declaration.',
      '',
    )
  }

  if (v.quarantined.length) {
    lines.push(
      '',
      `⚠️  check:cosmetic-renders — ${v.quarantined.length} SKU(s) are QUARANTINED (declared, awaiting the owner's SQL):`,
      '',
      ...v.quarantined.map((s) => {
        const q = (census.quarantine ?? []).find((e) => e.slug === s)
        return `    ${s} — ${q?.resolution}: ${q?.reason}`
      }),
      '',
      `    The store already REFUSES these before charging (lib/store/fulfillment.ts), so no Gems`,
      `    are at risk while they wait. Clear them by applying ${census.quarantineProposal ?? 'the proposal SQL'}`,
      '    and deleting the entries.',
      '',
    )
  }

  if (code === 0 && v.quarantined.length === 0) {
    lines.push('', `✓ check:cosmetic-renders — all ${scoped.length} purchasable cosmetic/title SKUs resolve to a render.`, '')
  }

  return { code, lines }
}

/** CLI. Kept thin: every decision above is pure and testable. */
function main() {
  const probe = process.argv.includes('--probe')
  let census
  let registry
  try {
    census = loadCensus()
  } catch (err) {
    console.error(`\n🔴 check:cosmetic-renders — ${err instanceof Error ? err.message : err}\n`)
    process.exit(INDETERMINATE)
  }
  try {
    if (!existsSync(REGISTRY_PATH)) throw new Error(`${REGISTRY_PATH} is missing — there is no render registry to measure against.`)
    registry = extractRegistry(readFileSync(REGISTRY_PATH, 'utf8'))
    if (!registry) throw new Error(`${REGISTRY_PATH} did not expose the expected BORDER_RENDERS / FLAIR_RENDERS / SLUG_COSMETICS / MAX_TITLE_LENGTH shape.`)
  } catch (err) {
    console.error(`\n🔴 check:cosmetic-renders — ${err instanceof Error ? err.message : err}\n`)
    process.exit(INDETERMINATE)
  }

  const { code, lines } = report(census, registry, { probe })
  console.log(lines.join('\n'))
  process.exit(code)
}

if (process.argv[1] && process.argv[1].endsWith('check-cosmetic-renders.mjs')) main()
