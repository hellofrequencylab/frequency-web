#!/usr/bin/env node
// check:stored-links — every link in every stored page document still goes somewhere live, and
// the census that says so is fresh enough to be believed.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// ADR-1115 found that every link in every stored page document pointed at an address ADR-1090 had
// retired, and that the site's front door hardcoded production. Nothing noticed because the
// redirect WORKED: ADR-1090 swept the code, and stored documents are not code. So a census was
// taken (scripts/stored-links.json), modelled on scripts/stored-block-types.json, recording WHERE
// each stored document sends a visitor and never what it says.
//
// ADR-1115 copied the census and NOT the instrument around it (HYG-023, ADR-1241). The block
// census has scripts/check-stored-blocks.mjs plus a test that drives its arms against broken
// fixtures. The link census had two backlog probes carrying ~2.7 KB of the same walk in JSON
// string escapes, and nothing read `capturedAt`. The recapture log inside the census records the
// consequence in its own words: a date was moved while the body still held the previous reading,
// and three probes went on agreeing with a snapshot that no longer described production.
//
// This file is the instrument. Four arms, each proven to fire by scripts/check-stored-links.test.ts:
//
//   · INTEGRITY  - floors on stores, documents, set hrefs, home links and parsed redirects, so a
//                  census that shrank to nothing cannot pass everything (ADR-962).
//   · FRESHNESS  - `capturedAt` is a real date, not in the future, not older than
//                  MAX_CENSUS_AGE_DAYS, and it is the date of the NEWEST recapture-log entry. A
//                  re-capture writes both; a date moved on its own is the failure the log records.
//   · RETIRED    - re-derived on every run, never captured: a target is retired because
//                  next.config.ts declares it a redirect SOURCE, and origin-pinned because it
//                  starts with the recorded origin. Retiring another URL turns this red with no
//                  edit to the census.
//   · AGREEMENT  - every count the `home` block records is recomputed from its links and the
//                  redirect table, and every link the `home` block names must be a target its own
//                  store records. A link the census does not know is a census that was half
//                  re-captured, which is exactly the state this file found on 2026-09-07.
//
// ⚠️ WHAT THIS CANNOT SEE, stated rather than glossed. The census is a SNAPSHOT of production
// taken by hand (`recaptureQuery` is in the JSON). Neither census can see a document written
// AFTER its capture date; only a credentialled re-capture can, and this repo has no credentialled
// CI job. The freshness arm cannot fix that. What it does is stop a stale reading from passing
// quietly as a fresh one: past the age ceiling the guard is red and both probes are 79 until
// someone re-runs the SQL, which an agent with the read-only Supabase connector can do in one call.
//
// ── THE TWO PROBES ────────────────────────────────────────────────────────────────────────────
//
// `--probe=home`    answers LIVE-104: does the published home document send a visitor to more than
//                   one place, through no retired address and no absolute self-href, with every
//                   recorded count agreeing with what the links derive?
// `--probe=retired` answers LIVE-108: does any stored target route through a retired address or
//                   hardcode the origin?
//
// Both exit 79 rather than 0 or 1 when the census is unreadable, below its floors, or STALE: a
// probe that cannot look must never spell the same as a probe that found nothing.
//
// Usage:
//   node scripts/check-stored-links.mjs                 # 0 = fresh, agreeing, nothing retired
//                                                       # 1 = stale / disagreeing / retired / unknown
//                                                       # 79 = census or config unreadable / floors
//   node scripts/check-stored-links.mjs --probe=home    # LIVE-104   0 · 1 · 79
//   node scripts/check-stored-links.mjs --probe=retired # LIVE-108   0 · 1 · 79
//   node scripts/check-stored-links.mjs --json          # the census, classified, as one JSON object
// Model: scripts/check-stored-blocks.mjs (floors, loud degradation, never a vacuous pass).

import { readFileSync, existsSync } from 'node:fs'

export const CENSUS_PATH = 'scripts/stored-links.json'
export const CONFIG_PATH = 'next.config.ts'

/** The exit code that means "I could not look", per check-backlog.mjs. */
export const INDETERMINATE = 79

/** The store the `home` block is read from. `pages.published_data` holds exactly one document
 *  (OWN-043: the published `home` IS the home page), so its targets and the block map must agree
 *  hit for hit. */
export const HOME_STORE = 'pages.published_data'

/** Floors. Measured 2026-09-07 on the re-captured census: 3 stores, 24 documents, 35 set hrefs,
 *  8 home links, 60+ redirect sources. The floors sit deliberately below those so ordinary churn
 *  does not trip them. Lower one ONLY alongside a real deletion, and name the deletion. Never to
 *  make a run green. */
export const MIN_STORES = 3
export const MIN_DOCUMENTS = 20
export const MIN_HREFS_SET = 20
export const MIN_HOME_LINKS = 3
export const MIN_REDIRECTS = 20

/** The age past which the census is STALE and the guard fails. Same number check-backlog.mjs uses
 *  for a manual row's evidence (MANUAL_STALE_DAYS), for the same reason: a hand-taken reading is
 *  evidence with an expiry date, not a fact. The difference is that this one FAILS, because the
 *  fix is one read-only query rather than an owner ruling. */
export const MAX_CENSUS_AGE_DAYS = 120

/** How many redirect hops a single href may take before the chain is called a loop. */
export const MAX_HOPS = 5

const DAY_MS = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

// ── census + config I/O ───────────────────────────────────────────────────────────────────────

/** Read the census. Throws rather than returning a default: an empty census is the one input that
 *  would sail through every arm looking like a clean run. */
export function loadCensus(path = CENSUS_PATH, io = {}) {
  const read = io.readFile ?? ((p) => readFileSync(p, 'utf8'))
  const exists = io.exists ?? existsSync
  if (!exists(path)) throw new Error(`${path} is missing: the stored-link census is the corpus this guard measures.`)
  const doc = JSON.parse(read(path))
  if (!Array.isArray(doc.stores)) throw new Error(`${path} has no "stores" array.`)
  if (!doc.home || typeof doc.home !== 'object') throw new Error(`${path} has no "home" block.`)
  if (typeof doc.origin !== 'string' || !doc.origin) throw new Error(`${path} records no "origin".`)
  return doc
}

/** Read next.config.ts and parse its redirect table. Throws below the floor: a config that parsed
 *  to two redirects is a regex that stopped matching, not a site with two redirects. */
export function loadRedirects(path = CONFIG_PATH, io = {}) {
  const read = io.readFile ?? ((p) => readFileSync(p, 'utf8'))
  const exists = io.exists ?? existsSync
  if (!exists(path)) throw new Error(`${path} is missing: the redirect table is what makes a target "retired".`)
  const redirects = parseRedirects(read(path))
  if (redirects.size < MIN_REDIRECTS) {
    throw new Error(`${path} parsed to ${redirects.size} redirect(s) (floor ${MIN_REDIRECTS}): the table's shape changed and this parser no longer reads it.`)
  }
  return redirects
}

/** `{ source: '/a', destination: '/b', ... }` pairs, single-line or wrapped. Map<source, destination>.
 *  Pure so the test can feed it a shape the real file does not have yet. */
export function parseRedirects(text) {
  const out = new Map()
  for (const m of text.matchAll(/source:\s*'([^']+)'\s*,\s*destination:\s*'([^']+)'/g)) out.set(m[1], m[2])
  return out
}

// ── href normalisation + the redirect walk ────────────────────────────────────────────────────

/** Strip the recorded origin off an absolute self-href and say what kind of thing is left. */
export function normaliseHref(href, origin) {
  const raw = String(href ?? '')
  if (!raw) return { path: '', kind: 'empty', absolute: false }
  if (raw.startsWith(origin)) return { path: raw.slice(origin.length) || '/', kind: 'path', absolute: true }
  if (raw.startsWith('#')) return { path: raw, kind: 'anchor', absolute: false }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return { path: raw, kind: 'external', absolute: false }
  return { path: raw, kind: 'path', absolute: false }
}

/** One redirect step for `path`, or null. Exact sources first; then Next's `:param` and
 *  `:param*` patterns, substituted into the destination the way Next would. */
export function resolveRedirect(path, redirects) {
  if (redirects.has(path)) return redirects.get(path)
  for (const [source, destination] of redirects) {
    if (!source.includes(':')) continue
    const names = []
    const re = new RegExp(
      '^' +
        source.replace(/[.*+?^${}()|[\]\\]/g, (ch) => (ch === ':' ? ch : `\\${ch}`)).replace(/:([A-Za-z_]\w*)(\\\*)?/g, (_, name, star) => {
          names.push(name)
          return star ? '(.*)' : '([^/]+)'
        }) +
        '$',
    )
    const m = re.exec(path)
    if (!m) continue
    let dest = destination
    names.forEach((name, i) => {
      dest = dest.replace(new RegExp(`:${name}\\*?`, 'g'), m[i + 1] ?? '')
    })
    return dest
  }
  return null
}

/** Follow the redirect table to where a click actually lands. `hops` > 0 means the href is a
 *  retired address; `looped` means it never settled inside MAX_HOPS. */
export function followRedirects(path, redirects) {
  let current = path
  let hops = 0
  while (hops < MAX_HOPS) {
    const next = resolveRedirect(current, redirects)
    if (next === null) return { path: current, hops, looped: false }
    current = next
    hops++
  }
  return { path: current, hops, looped: resolveRedirect(current, redirects) !== null }
}

/** The verdict for one href. */
export function classifyTarget(href, origin, redirects) {
  const n = normaliseHref(href, origin)
  if (n.kind !== 'path') return { href, kind: n.kind, path: n.path, destination: n.path, hops: 0, absolute: false, bad: false }
  const f = followRedirects(n.path, redirects)
  const kind = n.absolute ? 'absolute-origin' : f.hops > 0 ? 'retired' : 'live'
  return { href, kind, path: n.path, destination: f.path, hops: f.hops, looped: f.looped, absolute: n.absolute, bad: n.absolute || f.hops > 0 }
}

// ── the arms ──────────────────────────────────────────────────────────────────────────────────

/** The integrity floors, as a list of problems (empty = fine). A census that measures nothing
 *  passes everything, so a truncated one must fail rather than read as clean. */
export function integrityProblems(census, redirects, opts = {}) {
  const {
    minStores = MIN_STORES,
    minDocuments = MIN_DOCUMENTS,
    minHrefsSet = MIN_HREFS_SET,
    minHomeLinks = MIN_HOME_LINKS,
    minRedirects = MIN_REDIRECTS,
  } = opts
  const problems = []
  const stores = census.stores ?? []
  const documents = stores.reduce((n, s) => n + (s.documents ?? 0), 0)
  const hrefsSet = stores.reduce((n, s) => n + (s.hrefsSet ?? 0), 0)
  const links = Array.isArray(census.home?.links) ? census.home.links : []

  if (!census.origin) problems.push('no "origin": an absolute self-href cannot be told from an external link')
  if (stores.length < minStores) problems.push(`only ${stores.length} store(s) (floor ${minStores}): the census looks truncated`)
  if (documents < minDocuments) problems.push(`only ${documents} document(s) (floor ${minDocuments}): the census looks truncated`)
  if (hrefsSet < minHrefsSet) problems.push(`only ${hrefsSet} set href(s) (floor ${minHrefsSet}): the census looks truncated`)
  if (links.length < minHomeLinks) problems.push(`the home block records ${links.length} link(s) (floor ${minHomeLinks}): the block map looks truncated`)
  if (!census.capturedAt) problems.push('no "capturedAt": a corpus with no capture date cannot be reasoned about')
  if (!Array.isArray(census.recaptureLog) || census.recaptureLog.length === 0) problems.push('no "recaptureLog": a capture with no record of itself cannot be dated')
  for (const s of stores) {
    if (!s.store) problems.push('a store entry has no "store" name')
    if (!s.targets || typeof s.targets !== 'object') problems.push(`store "${s.store}" records no "targets" map`)
    else if ((s.hrefsSet ?? 0) > 0 && Object.keys(s.targets).length === 0) problems.push(`store "${s.store}" says ${s.hrefsSet} href(s) are set but records no targets`)
  }
  if (!stores.some((s) => s.store === HOME_STORE)) problems.push(`no "${HOME_STORE}" store: the home block has nothing to agree with`)
  if (redirects && redirects.size < minRedirects) problems.push(`only ${redirects.size} redirect(s) parsed from ${CONFIG_PATH} (floor ${minRedirects}): the table's shape changed`)
  return problems
}

/** Parse a `YYYY-MM-DD` as UTC midnight, or NaN. */
export function parseIsoDate(s) {
  const m = ISO_DATE.exec(String(s ?? ''))
  if (!m) return NaN
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(t)
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? t : NaN
}

/** The date each recapture-log entry opens with, newest first. */
export function recaptureDates(census) {
  const log = Array.isArray(census.recaptureLog) ? census.recaptureLog : []
  return log
    .map((entry) => ISO_DATE.exec(String(entry).slice(0, 10))?.[0] ?? null)
    .filter(Boolean)
    .sort()
    .reverse()
}

/**
 * The freshness rule (empty = fresh). Three ways to be stale, and the third is the one the
 * census's own log records happening: the date moved while the body did not. A re-capture writes
 * `capturedAt` AND a log entry dated the same day; a `capturedAt` newer than every log entry is a
 * stamp with no reading behind it.
 */
export function freshnessProblems(census, { now = Date.now(), maxAgeDays = MAX_CENSUS_AGE_DAYS } = {}) {
  const problems = []
  const captured = parseIsoDate(census.capturedAt)
  if (Number.isNaN(captured)) {
    problems.push(`"capturedAt" is ${JSON.stringify(census.capturedAt ?? null)}, not a YYYY-MM-DD date`)
    return problems
  }
  const ageDays = Math.floor((now - captured) / DAY_MS)
  if (ageDays < 0) problems.push(`"capturedAt" ${census.capturedAt} is in the future`)
  if (ageDays > maxAgeDays) problems.push(`captured ${census.capturedAt}, ${ageDays} days ago (ceiling ${maxAgeDays}): the reading is STALE and says nothing about production today`)
  const [newest] = recaptureDates(census)
  if (!newest) problems.push('no dated "recaptureLog" entry: a capture with no record of what it read cannot be trusted')
  else if (newest !== census.capturedAt) {
    problems.push(`"capturedAt" is ${census.capturedAt} but the newest recaptureLog entry is dated ${newest}: a date moved without a reading behind it, or a reading was taken without saying so`)
  }
  return problems
}

/** Every recorded target across every store, classified. */
export function classifyStores(census, redirects) {
  const findings = []
  for (const s of census.stores ?? []) {
    for (const [href, v] of Object.entries(s.targets ?? {})) {
      findings.push({ store: s.store, hits: v?.hits ?? 0, docs: v?.docs ?? 0, ...classifyTarget(href, census.origin, redirects) })
    }
  }
  return findings
}

/**
 * The home block, re-derived. Every count it records is recomputed from `links` plus the redirect
 * table, and the destination set likewise, so a wrong figure in the file goes red instead of
 * passing. This is LIVE-104's probe, lifted whole and unweakened.
 */
export function classifyHome(census, redirects) {
  const home = census.home ?? {}
  const links = Array.isArray(home.links) ? home.links : []
  const classified = links.map((l) => ({ ...l, ...classifyTarget(l.href, census.origin, redirects) }))
  const dest = new Set()
  let retired = 0
  let absolute = 0
  for (const c of classified) {
    if (c.absolute) absolute++
    if (c.kind === 'empty' || c.kind === 'anchor') continue
    if (c.hops > 0) retired++
    dest.add(c.destination)
  }
  const derived = { distinctDestinations: dest.size, retiredHrefs: retired, absoluteSelfHrefs: absolute }
  const recorded = { distinctDestinations: home.distinctDestinations, retiredHrefs: home.retiredHrefs, absoluteSelfHrefs: home.absoluteSelfHrefs }
  const disagreements = Object.entries(derived)
    .filter(([k, v]) => recorded[k] !== v)
    .map(([k, v]) => `${k} recorded ${recorded[k]}, derived ${v}`)
  const derivedDestinations = [...dest].sort()
  const recordedDestinations = [...(home.destinations ?? [])].sort()
  if (derivedDestinations.join('|') !== recordedDestinations.join('|')) {
    disagreements.push(`destinations recorded [${recordedDestinations.join(', ')}] but derived [${derivedDestinations.join(', ')}]`)
  }
  return { links: classified, derived, recorded, disagreements, destinations: derivedDestinations, retired, absolute }
}

/**
 * The home block and its own store must describe the same document. `HOME_STORE` holds one
 * document, so its targets are the block map's hrefs counted; a link the store does not know, or
 * a hit count that differs, is a census that was re-captured on one side only.
 */
export function homeStoreProblems(census) {
  const problems = []
  const store = (census.stores ?? []).find((s) => s.store === HOME_STORE)
  if (!store) return problems // the integrity floor already names this
  const links = Array.isArray(census.home?.links) ? census.home.links : []
  const counted = new Map()
  for (const l of links) {
    const href = String(l.href ?? '')
    if (!href) continue
    counted.set(href, (counted.get(href) ?? 0) + 1)
  }
  const targets = store.targets ?? {}
  for (const [href, n] of counted) {
    if (!(href in targets)) problems.push(`home links ${href} but ${HOME_STORE} records no such target: the block map was re-captured and the store was not`)
    else if ((store.documents ?? 0) === 1 && (targets[href]?.hits ?? 0) !== n) problems.push(`home links ${href} ${n} time(s) but ${HOME_STORE} records ${targets[href]?.hits} hit(s)`)
  }
  if ((store.documents ?? 0) === 1) {
    for (const href of Object.keys(targets)) {
      if (!counted.has(href)) problems.push(`${HOME_STORE} records ${href} but the home block map does not link it: the store was re-captured and the block map was not`)
    }
    const set = [...counted.values()].reduce((a, b) => a + b, 0)
    if ((store.hrefsSet ?? 0) !== set) problems.push(`${HOME_STORE} says ${store.hrefsSet} href(s) are set but the home block map has ${set}`)
  }
  return problems
}

/** The whole verdict, pure. */
export function classify(census, redirects, { now = Date.now() } = {}) {
  const integrity = integrityProblems(census, redirects)
  const freshness = freshnessProblems(census, { now })
  const stores = classifyStores(census, redirects)
  const home = classifyHome(census, redirects)
  const unknownLinks = homeStoreProblems(census)
  return {
    integrity,
    freshness,
    stores,
    bad: stores.filter((f) => f.bad),
    looped: stores.filter((f) => f.looped),
    home,
    unknownLinks,
  }
}

// ── the report ────────────────────────────────────────────────────────────────────────────────

function describeBad(f) {
  if (f.kind === 'absolute-origin') return `${f.store} ${f.href} hardcodes the origin (${f.hits} hit(s), so a preview deploy sends the visitor to production)`
  return `${f.store} ${f.href} is a retired address (${f.hits} hit(s), ${f.hops} redirect hop(s) to ${f.destination} on every click)`
}

/**
 * The human report. Returns lines + an exit code, so the tests can drive every branch.
 *
 * `probe: null`      the guard: 79 on floors · 1 on stale / disagreement / unknown link / retired · 0 otherwise.
 * `probe: 'home'`    LIVE-104:  79 on floors or stale · 1 on disagreement, a retired or absolute
 *                    href, or fewer than two destinations · 0 otherwise.
 * `probe: 'retired'` LIVE-108:  79 on floors or stale · 1 on any retired or origin-pinned target · 0 otherwise.
 *
 * @param {object} census
 * @param {Map<string, string>} redirects
 * @param {{ probe?: 'home' | 'retired' | null, now?: number }} [opts]
 */
export function report(census, redirects, { probe = null, now = Date.now() } = {}) {
  const lines = []
  const v = classify(census, redirects, { now })
  const stores = census.stores ?? []
  const docs = stores.reduce((n, s) => n + (s.documents ?? 0), 0)
  const set = stores.reduce((n, s) => n + (s.hrefsSet ?? 0), 0)
  const header = `${docs} stored document(s) across ${stores.length} store(s), ${set} set href(s), ${redirects.size} redirect(s), captured ${census.capturedAt}`
  const label = probe ? `check:stored-links --probe=${probe}` : 'check:stored-links'

  if (v.integrity.length) {
    lines.push('', `⚠️  ${label} CANNOT TELL: the census failed its integrity floors (${CENSUS_PATH}):`, '')
    for (const p of v.integrity) lines.push(`    ${p}`)
    lines.push('', '    A census that measures nothing passes everything. Re-capture it with the SQL in', `    ${CENSUS_PATH} ("recaptureQuery") rather than lowering a floor.`, '')
    return { code: INDETERMINATE, lines, verdict: v }
  }

  if (v.freshness.length) {
    const code = probe ? INDETERMINATE : 1
    lines.push('', `${probe ? '⚠️ ' : '🔴'} ${label}: ${header}. The census is STALE:`, '')
    for (const p of v.freshness) lines.push(`    ${p}`)
    lines.push(
      '',
      probe
        ? '    A stale reading answers nothing about the row, so this is 79, not a verdict.'
        : '    A stale reading says nothing about production today, and a date on its own is not a reading.',
      `    Re-run "recaptureQuery" in ${CENSUS_PATH} against production (read-only), rewrite "stores" and "home"`,
      '    from the result, then set "capturedAt" AND add a recaptureLog entry dated the same day.',
      '',
    )
    return { code, lines, verdict: v }
  }

  // ── LIVE-104 ────────────────────────────────────────────────────────────────────────────────
  if (probe === 'home') {
    const h = v.home
    if (h.disagreements.length) {
      lines.push('', `🔴 ${label}: the census disagrees with what it derives:`, '', ...h.disagreements.map((d) => `    ${d}`), '', `    Re-capture ${CENSUS_PATH}; a recorded number cannot close the row on its own.`, '')
      return { code: 1, lines, verdict: v }
    }
    if (h.destinations.length < 2) {
      lines.push('', `🔴 ${label}: the published home document offers ${h.destinations.length} destination (${h.destinations.join(', ')}) from ${h.links.length} links;`, '    a visitor who is not ready to join has nowhere else to go.', '')
      return { code: 1, lines, verdict: v }
    }
    if (h.retired || h.absolute) {
      lines.push('', `🔴 ${label}: home offers ${h.destinations.length} destinations but ${h.retired} href(s) route through a retired address and ${h.absolute} hardcode ${census.origin}.`, '')
      return { code: 1, lines, verdict: v }
    }
    lines.push('', `✅ ${label}: ${header}. The published home document offers ${h.destinations.length} destinations (${h.destinations.join(', ')}), none retired, none origin-pinned, every recorded count re-derived.`, '')
    return { code: 0, lines, verdict: v }
  }

  // ── LIVE-108 ────────────────────────────────────────────────────────────────────────────────
  if (probe === 'retired') {
    if (v.bad.length) {
      lines.push('', `🔴 ${label}: stored page documents still point at addresses that no longer exist:`, '', ...v.bad.map((f) => `    ${describeBad(f)}`), '')
      return { code: 1, lines, verdict: v }
    }
    lines.push('', `✅ ${label}: ${header}. No stored target routes through a redirect source or hardcodes the origin.`, '')
    return { code: 0, lines, verdict: v }
  }

  // ── the guard ───────────────────────────────────────────────────────────────────────────────
  const failures = []
  if (v.home.disagreements.length) failures.push(['the home block disagrees with what its links derive', v.home.disagreements])
  if (v.unknownLinks.length) failures.push(['the home block and its store describe different documents', v.unknownLinks])
  if (v.looped.length) failures.push([`a redirect chain never settles inside ${MAX_HOPS} hops`, v.looped.map((f) => `${f.store} ${f.href}`)])
  if (v.bad.length) failures.push(['stored page documents point at addresses that no longer exist', v.bad.map(describeBad)])
  if (failures.length) {
    lines.push('', `🔴 ${label}: ${header}.`, '')
    for (const [title, items] of failures) {
      lines.push(`    ${title}:`)
      for (const i of items) lines.push(`      ${i}`)
      lines.push('')
    }
    lines.push(
      '    A retired or origin-pinned target is fixed in the DATA (a repair migration, as ADR-1125 did) or by',
      `    keeping the address alive; a disagreement is fixed by re-capturing ${CENSUS_PATH} whole,`,
      '    "stores" and "home" together, never by editing a number.',
      '',
    )
    return { code: 1, lines, verdict: v }
  }

  const ext = v.stores.filter((f) => f.kind === 'external').length
  const anchors = v.stores.filter((f) => f.kind === 'anchor').length
  lines.push('', `✅ ${label}: ${header}. Every stored target is live (${v.stores.length} distinct: ${v.stores.length - ext - anchors} path(s), ${anchors} in-page anchor(s), ${ext} external), the home block re-derives, and its store agrees with it.`, '')
  return { code: 0, lines, verdict: v }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('check-stored-links.mjs')
if (invokedDirectly) {
  const args = process.argv.slice(2)
  const probeArg = args.find((a) => a.startsWith('--probe'))
  const probe = probeArg ? (probeArg.split('=')[1] ?? 'home') : null
  if (probe && probe !== 'home' && probe !== 'retired') {
    console.error(`\n⚠️  check:stored-links: unknown probe "${probe}" (home | retired)\n`)
    process.exit(INDETERMINATE)
  }
  let census, redirects
  try {
    census = loadCensus()
    redirects = loadRedirects()
  } catch (err) {
    console.error(`\n⚠️  check:stored-links CANNOT TELL. ${err.message}\n`)
    process.exit(INDETERMINATE)
  }
  const { code, lines, verdict } = report(census, redirects, { probe })
  if (args.includes('--json')) {
    console.log(JSON.stringify({ code, capturedAt: census.capturedAt, origin: census.origin, ...verdict }, null, 2))
  } else {
    for (const l of lines) (code === 0 ? console.log : console.error)(l)
  }
  process.exit(code)
}
