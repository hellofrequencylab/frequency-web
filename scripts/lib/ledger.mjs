// LEDGER FRAGMENTS: the one list and the ADR ledger, read as base file + fragments (HYG-145, ADR-1635).
//
// WHY THIS EXISTS. Every PR used to edit docs/BUILD-BACKLOG.json (close its row, prune it from a
// meta.slate wave) and docs/DECISIONS.md (append its ADR). So every merge conflicted every other
// open PR on those two files, merges ran strictly one at a time, and each one needed
// `git merge origin/main && pnpm fold` first. Owner, 2026-09-29: "Change the rule or something. I
// don't want stuff like this jamming me up."
//
// So a PR now writes its ledger change as a FRAGMENT, one file per row and one per ADR, and never
// touches the two shared files:
//
//   docs/ledger/rows/<ID>.json
//     a NEW row:    the full row object, exactly as it would sit in `entries`, plus an optional
//                   top-level "wave": "W7" that places it on that meta.slate wave (the key is
//                   stripped from the row).
//     an EDIT:      { "id": "<ID>", "patch": { ... }, "append": { ... }, "wave": "W7" | null }
//                   `patch` sets keys on the row (a null value deletes the key; objects such as
//                   `verify` are replaced whole). `append` concatenates onto a string field (the
//                   usual `detail` "CLOSED ..." paragraph) or an array field. `wave` moves the row
//                   to that wave, or with null takes it off every wave. Every key but `id` is optional.
//   `docs/ledger/adr/ADR-NNNN.md`
//     the full ADR text, in DECISIONS.md's format: its first line is `## ADR-NNNN: ...`, and it
//     declares no other ADR. Relative links resolve from docs/ (check:docs-links reads them that
//     way), because the text lands in docs/DECISIONS.md when it is compacted.
//
// One file per row per PR is the collision rule, and it is the right one: two PRs editing the SAME
// row's fragment conflict in git, because they genuinely disagree. Two PRs editing different rows
// never meet.
//
// THE MERGED VIEW is what every reader uses (check:backlog, check:adr, check:id-collisions,
// check:shipped-ids, pnpm backlog, pnpm packets, and probes that read rows). It is deterministic:
// base entries in file order with their patches applied, then new rows in id order; the base ADR
// text, then each fragment ADR in number order. Nothing may assume a fragment exists: with none,
// the view is the base file (less any done or parked id on a wave, below).
//
// WAVES STOP NEEDING EDITS ON CLOSE. A row that is done or parked is dropped from every
// meta.slate wave at load time, whichever file closed it. Only open and blocked rows are
// sequenced work (HYG-047, HYG-134), and the loader now enforces that instead of every PR.
//
// This module is a LEAF on purpose: it imports nothing from the scripts that read it
// (check-adr.mjs, fold-ledger-docs.mjs), so none of them can form an import cycle through it.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export const BACKLOG = 'docs/BUILD-BACKLOG.json'
export const DECISIONS = 'docs/DECISIONS.md'
export const LEDGER_DIR = 'docs/ledger'
export const ROWS_DIR = 'docs/ledger/rows'
export const ADR_DIR = 'docs/ledger/adr'

/** When there are more fragments than this, `pnpm backlog` and check:backlog print a notice that
 *  a compaction PR is due (owner ruling 2026-09-29: "When 30+ pile up"; no cron). */
export const COMPACT_AT = 30

/** An ADR declaration line. `#{2,3}`, not `##`: seven entries (ADR-052 to 057, ADR-156a) use ###.
 *  check-adr.mjs re-exports this as HEADING so every reader agrees on what a declaration is. */
export const ADR_HEADING = /^#{2,3} ADR-(\d+[a-z]?)\b/

/** A row id: an upper-case prefix, a dash, and the rest (LIVE-034, PROG-CAL13, DEF-HARDEN). */
export const ROW_ID = /^[A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)+$/

/** Statuses that sit on a wave. Everything else (done, parked) sits on NO wave. */
export const SLATED_STATUSES = ['open', 'blocked']

/** The keys an edit fragment may carry. Anything else is a typo that would silently do nothing. */
const PATCH_KEYS = new Set(['id', 'patch', 'append', 'wave'])

/** The key a wave is known by: the token before its first " · " ("W4 · THIRD TO LAST ..." -> "W4"),
 *  or the whole name when it has none ("owner-timed"). A wave's name is prose that main rewrites;
 *  the token is what a human means by "the same wave" (HYG-134). */
export function waveToken(name) {
  const s = String(name ?? '')
  const i = s.indexOf(' · ')
  return (i === -1 ? s : s.slice(0, i)).trim()
}

/** Ids sort with their digit runs compared as numbers, so HYG-99 comes before HYG-100, and the
 *  order never depends on a locale. */
export function compareIds(a, b) {
  const key = (s) => String(s).replace(/\d+/g, (d) => d.padStart(12, '0'))
  const x = key(a)
  const y = key(b)
  return x < y ? -1 : x > y ? 1 : 0
}

/** `ADR-1635` or `1635` or `156a` -> [1635, ''] / [156, 'a'], for ordering. */
function adrOrder(id) {
  const m = /^(\d+)([a-z]?)$/.exec(String(id))
  return m ? [Number(m[1]), m[2]] : [Number.POSITIVE_INFINITY, String(id)]
}

function listDir(dir, ext) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(ext))
    .map((d) => d.name)
}

// ── Fragment ids from paths (no file reads: check:id-collisions uses this on a PR's file list) ──

/** { rows, adrs } named by a list of repo paths. Only a path directly under ROWS_DIR or ADR_DIR
 *  with the right shape counts; the id is the file name, which the loader requires. */
export function fragmentIdsFromPaths(paths) {
  const rows = new Set()
  const adrs = new Set()
  for (const p of paths) {
    const s = String(p).replace(/\\/g, '/')
    let m = new RegExp(`^${ROWS_DIR}/([^/]+)\\.json$`).exec(s)
    if (m && ROW_ID.test(m[1])) rows.add(m[1])
    m = new RegExp(`^${ADR_DIR}/ADR-(\\d+[a-z]?)\\.md$`).exec(s)
    if (m) adrs.add(m[1])
  }
  return { rows, adrs }
}

// ── Reading fragments ─────────────────────────────────────────────────────────────────────────

/** Every row fragment under `root`, sorted by id. Unreadable ones come back with `problem` set. */
export function readRowFragments(root = '.') {
  const dir = join(root, ROWS_DIR)
  return listDir(dir, '.json')
    .map((name) => {
      const path = `${ROWS_DIR}/${name}`
      const id = name.slice(0, -'.json'.length)
      let body = null
      let problem = null
      try {
        body = JSON.parse(readFileSync(join(dir, name), 'utf8'))
      } catch (err) {
        problem = `${path} is not valid JSON: ${err.message}`
      }
      return { path, id, body, problem }
    })
    .sort((a, b) => compareIds(a.id, b.id))
}

/** Every ADR fragment under `root`, sorted by number. */
export function readAdrFragments(root = '.') {
  const dir = join(root, ADR_DIR)
  return listDir(dir, '.md')
    .map((name) => {
      const m = /^ADR-(\d+[a-z]?)\.md$/.exec(name)
      return { path: `${ADR_DIR}/${name}`, id: m ? m[1] : null, text: readFileSync(join(dir, name), 'utf8') }
    })
    .sort((a, b) => {
      const [x, xs] = adrOrder(a.id)
      const [y, ys] = adrOrder(b.id)
      return x - y || (xs < ys ? -1 : xs > ys ? 1 : 0) || (a.path < b.path ? -1 : 1)
    })
}

// ── The pure merge ────────────────────────────────────────────────────────────────────────────

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/** Is this fragment an edit (`patch`/`append`/`wave` on an existing row) rather than a new row? A
 *  new row always has a title and a status; an edit never needs them. */
export function isEdit(body) {
  return body != null && typeof body === 'object' && !('title' in body) && !('status' in body)
}

/** Apply one edit to a row in place. Returns the problems it found. */
function applyEdit(row, frag, path) {
  const problems = []
  for (const k of Object.keys(frag)) {
    if (!PATCH_KEYS.has(k)) problems.push(`${path}: unknown key "${k}" (an edit carries id, patch, append, wave)`)
  }
  const patch = frag.patch ?? {}
  if (typeof patch !== 'object' || Array.isArray(patch)) {
    problems.push(`${path}: "patch" must be an object`)
  } else {
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'id') {
        problems.push(`${path}: a patch may not change the row id`)
        continue
      }
      if (v === null) delete row[k]
      else row[k] = clone(v)
    }
  }
  const append = frag.append ?? {}
  if (typeof append !== 'object' || Array.isArray(append)) {
    problems.push(`${path}: "append" must be an object`)
  } else {
    for (const [k, v] of Object.entries(append)) {
      const cur = row[k]
      if (Array.isArray(v)) {
        if (cur === undefined) row[k] = clone(v)
        else if (Array.isArray(cur)) row[k] = [...cur, ...clone(v)]
        else problems.push(`${path}: append.${k} is an array but the row's ${k} is not`)
      } else if (typeof v === 'string') {
        if (cur === undefined) row[k] = v
        else if (typeof cur === 'string') row[k] = cur + v
        else problems.push(`${path}: append.${k} is a string but the row's ${k} is not`)
      } else {
        problems.push(`${path}: append.${k} must be a string or an array`)
      }
    }
  }
  return problems
}

/** Drop every done or parked id from every wave. Phantom ids (no row) are left for HYG-047 to name. */
export function filterWaves(doc) {
  const waves = doc?.meta?.slate?.waves
  if (!Array.isArray(waves)) return []
  const by = new Map((doc.entries ?? []).map((e) => [e.id, e]))
  const dropped = []
  for (const w of waves) {
    if (!Array.isArray(w.ids)) continue
    w.ids = w.ids.filter((id) => {
      const r = by.get(id)
      if (r && !SLATED_STATUSES.includes(r.status)) {
        dropped.push(id)
        return false
      }
      return true
    })
  }
  return dropped
}

/** THE MERGE. `base` is the parsed BUILD-BACKLOG.json; `fragments` is readRowFragments' output.
 *  Returns { doc, problems, added, edited, dropped } and never mutates `base`. */
export function applyRowFragments(base, fragments = []) {
  const doc = clone(base)
  const problems = []
  const added = []
  const edited = []
  if (!Array.isArray(doc.entries)) return { doc, problems, added, edited, dropped: [] }
  const index = new Map(doc.entries.map((e, i) => [e.id, i]))
  const placements = [] // [id, token | null] in fragment order

  for (const f of fragments) {
    if (f.problem) {
      problems.push(f.problem)
      continue
    }
    const body = f.body
    if (body == null || typeof body !== 'object' || Array.isArray(body)) {
      problems.push(`${f.path}: a fragment is one JSON object`)
      continue
    }
    if (!ROW_ID.test(f.id)) {
      problems.push(`${f.path}: the file name is not a row id`)
      continue
    }
    if (body.id !== f.id) {
      problems.push(`${f.path}: its "id" is ${JSON.stringify(body.id)}, but the file is named for ${f.id}; one file per row, named by its id`)
      continue
    }
    const hasWave = Object.prototype.hasOwnProperty.call(body, 'wave')
    if (hasWave && body.wave !== null && typeof body.wave !== 'string') {
      problems.push(`${f.path}: "wave" must be a wave token such as "W7", or null`)
      continue
    }
    if (isEdit(body)) {
      if (!index.has(f.id)) {
        problems.push(`${f.path}: edits ${f.id}, and no row ${f.id} exists in ${BACKLOG}. A new row carries its full object (title, status, lane ...)`)
        continue
      }
      const row = doc.entries[index.get(f.id)]
      const p = applyEdit(row, body, f.path)
      problems.push(...p)
      edited.push(f.id)
    } else {
      if (index.has(f.id)) {
        problems.push(`${f.path}: is a full row, and ${f.id} already exists in ${BACKLOG}. Edit it with { "id", "patch" } instead, or take the next free id`)
        continue
      }
      const row = clone(body)
      delete row.wave
      index.set(f.id, doc.entries.length)
      doc.entries.push(row)
      added.push(f.id)
    }
    if (hasWave) placements.push([f.id, body.wave, f.path])
  }

  const waves = doc.meta?.slate?.waves
  for (const [id, token, path] of placements) {
    if (!Array.isArray(waves)) {
      problems.push(`${path}: places ${id} on a wave, and ${BACKLOG} has no meta.slate.waves`)
      continue
    }
    const target = token === null ? null : waves.find((w) => waveToken(w.name) === token)
    if (token !== null && !target) {
      problems.push(`${path}: no meta.slate wave has the token "${token}" (tokens: ${waves.map((w) => waveToken(w.name)).join(', ')})`)
      continue
    }
    for (const w of waves) if (Array.isArray(w.ids)) w.ids = w.ids.filter((x) => x !== id)
    if (target) {
      if (!Array.isArray(target.ids)) target.ids = []
      target.ids.push(id)
    }
  }

  const dropped = filterWaves(doc)
  return { doc, problems, added, edited, dropped }
}

/** Base ADR text plus each fragment, in number order, separated the way DECISIONS.md separates its
 *  entries (one blank line). Returns { text, problems, declared }. */
export function mergeAdrFragments(baseText, fragments = []) {
  const problems = []
  const declared = new Set()
  for (const line of baseText.split('\n')) {
    const m = ADR_HEADING.exec(line)
    if (m) declared.add(m[1])
  }
  let text = baseText
  if (text.length && !text.endsWith('\n')) text += '\n'
  for (const f of fragments) {
    if (!f.id) {
      problems.push(`${f.path}: an ADR fragment is named ADR-<number>.md`)
      continue
    }
    const body = f.text.replace(/\s+$/, '') + '\n'
    const lines = body.split('\n')
    const heads = lines.map((l) => ADR_HEADING.exec(l)).filter(Boolean)
    const first = ADR_HEADING.exec(lines[0])
    if (!first) {
      problems.push(`${f.path}: its first line must be the "## ADR-${f.id}: ..." heading`)
      continue
    }
    if (first[1] !== f.id) {
      problems.push(`${f.path}: declares ADR-${first[1]}, but the file is named for ADR-${f.id}`)
      continue
    }
    if (heads.length > 1) {
      problems.push(`${f.path}: declares ${heads.length} ADRs; one fragment is one ADR`)
      continue
    }
    if (declared.has(f.id)) {
      problems.push(`${f.path}: ADR-${f.id} is already declared in ${DECISIONS}; take the next free number`)
      continue
    }
    declared.add(f.id)
    text += '\n' + body
  }
  return { text, problems, declared }
}

// ── The loaders every reader uses ─────────────────────────────────────────────────────────────

export class LedgerError extends Error {}

/** The merged backlog with everything a gate needs to report on it. Throws only when the base
 *  file itself cannot be read or parsed (a broken base is not an empty list).
 *  @param {{ root?: string, backlog?: string }} [opts] */
export function readBacklogView({ root = '.', backlog = BACKLOG } = {}) {
  const basePath = isAbsolute(backlog) ? backlog : join(root, backlog)
  if (!existsSync(basePath)) throw new LedgerError(`${backlog} is missing. It is the one list; nothing else may replace it.`)
  let base
  try {
    base = JSON.parse(readFileSync(basePath, 'utf8'))
  } catch (err) {
    throw new LedgerError(`${backlog} is not valid JSON: ${err.message}`)
  }
  const fragments = readRowFragments(root)
  const merged = applyRowFragments(base, fragments)
  return { ...merged, base, fragments }
}

/** The merged backlog document. Throws LedgerError when a fragment is broken: a reader that
 *  silently skipped one would be reading a list that is not the list. */
export function loadBacklog(root = '.') {
  const view = readBacklogView({ root })
  if (view.problems.length) throw new LedgerError(`ledger fragments are broken:\n  ${view.problems.join('\n  ')}`)
  return view.doc
}

/** The merged ADR ledger with its problems. */
export function readDecisionsView(root = '.') {
  const basePath = join(root, DECISIONS)
  const baseText = existsSync(basePath) ? readFileSync(basePath, 'utf8') : ''
  const fragments = readAdrFragments(root)
  return { ...mergeAdrFragments(baseText, fragments), baseText, fragments }
}

/** The merged ADR ledger text. Throws LedgerError when a fragment is broken. */
export function loadDecisions(root = '.') {
  const view = readDecisionsView(root)
  if (view.problems.length) throw new LedgerError(`ADR fragments are broken:\n  ${view.problems.join('\n  ')}`)
  return view.text
}

/** How many fragments are waiting to be compacted, and whether that is past COMPACT_AT. */
export function fragmentCount(root = '.') {
  const n = listDir(join(root, ROWS_DIR), '.json').length + listDir(join(root, ADR_DIR), '.md').length
  return { n, due: n > COMPACT_AT }
}
