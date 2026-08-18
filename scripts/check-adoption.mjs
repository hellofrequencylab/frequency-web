#!/usr/bin/env node
// check:adoption — the design-debt RATCHET harness (Lift 2a, docs/UX-MATURITY-PLAN.md).
//
// One harness for every adoption-debt class. The admin-client ratchet
// (scripts/check-admin-client.mjs) proved the pattern on a per-FILE list; design debt is a
// COUNT problem — thousands of literal utilities that can only be retired in sweeps — so this
// harness freezes a number per class and holds the line between sweeps:
//
//   * a count that RISES above its frozen baseline FAILS CI — new code may not add debt,
//   * a count that HOLDS or SHRINKS passes, and prints the delta as progress,
//   * `--update` re-freezes counts from reality (run it at the end of a sweep, so the
//     baselines file reads as the scoreboard of what the sweeps actually bought).
//
// Each entry in scripts/adoption-baselines.json declares: a `key`, a human `description`, a
// ripgrep-class `patterns` list (plus optional `absent` patterns that must NOT appear), a file
// scope (`include`/`exclude` globs over the POSIX repo-relative path), a `mode`
// (`matches` = count occurrences · `files` = count qualifying files), and the frozen `baseline`.
//
// Why counts and not per-file lists here: a radius literal is not a decision, it is a leftover.
// The per-file ratchet is right when each entry is a justified exception (an RLS bypass); a
// count is right when the goal is monotone decline of an undifferentiated population.
//
// ---------------------------------------------------------------------------------------------
// PROVENANCE — added 2026-08-04 after the ratchet laundered a raise (see below).
// ---------------------------------------------------------------------------------------------
// `baseline vs current` answers "did debt rise since the freeze?" but never "was the freeze
// itself justified?". A blind `--update` writes whatever it measures, so it cannot tell a WIN
// (684 shadow literals → 54, a codemod landed) from a RAISE (raw-button-bg 494 → 529) — and a
// raise, once written, reads green forever. ADR-928 forbids exactly that: falls are written
// down, rises are refused unless forced and explained.
//
// So every entry now carries `frozen: { at, value, direction, basis, reason }` plus a `history`
// of every change, and three rules hold the record honest:
//
//   1. PROVENANCE INTEGRITY — `frozen.value` must equal `baseline`. Hand-editing a number
//      without writing why now FAILS the gate instead of passing silently.
//   2. BASIS FINGERPRINT — `frozen.basis` hashes the entry's measurement basis (mode +
//      patterns + absent + include + exclude). Change the pattern or the scope and the number
//      stops being comparable to the one it is checked against, so the gate FAILS and demands a
//      re-freeze that records the basis change. This is the hole that let a narrowed pattern
//      book an 809-site "shrink" nobody swept.
//   3. ASYMMETRIC MERGE — `--update` writes falls automatically; a RISE is refused unless
//      `--allow-raise --reason "<why>"`, and is then recorded as `direction: "raised"` and
//      flagged ⚠️ on every subsequent run. A raised floor is debt the ratchet stopped guarding,
//      and it stays visible and attributable for as long as it is raised.
//
// None of this loosens the gate: every rule adds a failure mode, none removes one.
//
// Usage: `node scripts/check-adoption.mjs [--key <key>]`
//        `node scripts/check-adoption.mjs --update --reason "<why>" [--allow-raise]`

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const BASELINES = join('scripts', 'adoption-baselines.json')

/** How a baseline came to hold its value. `rebased` = the measurement basis changed under it. */
export const DIRECTIONS = ['seed', 'lowered', 'raised', 'rebased']

/** Directions that were NOT bought by a sweep — the gate names these on every run. */
const UNEARNED = new Set(['raised', 'rebased'])

const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------------------------
// Scope matching (a small glob subset: `**`, `*`, `?`, `{a,b}` — enough for path scopes, and
// dependency-free so the gate stays a plain node script like every other check in scripts/).
// ---------------------------------------------------------------------------------------------

/** Compile a glob to an anchored RegExp over POSIX-style repo-relative paths. */
export function globToRegExp(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` swallows any number of directories (including none); bare `**` = anything.
        if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2 } else { out += '.*'; i += 1 }
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else if (c === '{') {
      const end = glob.indexOf('}', i)
      if (end === -1) out += '\\{'
      else {
        out += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
        i = end
      }
    } else out += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

/** True when `relPath` is inside an entry's declared scope. */
export function inScope(relPath, entry) {
  const include = entry.include ?? ['**/*']
  const exclude = entry.exclude ?? []
  if (!include.some((g) => globToRegExp(g).test(relPath))) return false
  return !exclude.some((g) => globToRegExp(g).test(relPath))
}

// ---------------------------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------------------------

function compile(pattern) {
  return new RegExp(pattern, 'g')
}

/**
 * A WRITTEN carve-out: a match whose own line, or the comment block attached above it, carries an
 * annotation explaining why the literal is correct there.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A RATCHET NEEDS THIS, and why an exclude glob is the wrong shape for it — 2026-08-17.
 * ---------------------------------------------------------------------------------------------
 * `white-black-literals` read 27, and had read 27 since 2026-08-06. All 27 carry a
 * `KEEP <utility>: <reason>` comment — QR quiet zones a scanner needs true white for, video
 * letterboxes, an email preview frame, a tick sitting on an operator's own hex. Not one was
 * retirable. The class's floor was 27; the DAWN Phase 9 queue recorded it as 2; and BOTH numbers
 * are the same defect, because a total cannot tell a justified carve-out from new debt.
 *
 * The consequence, which is what makes it a bug rather than an untidiness: carve-outs and debt
 * were FUNGIBLE inside the total. Retire one annotated site, add one bare `bg-white`, and the
 * ratchet reads 27 → 27, "✅ held", green — over the class its own description calls "the only bug
 * class in the census".
 *
 * The obvious fix, adding `app/print/**` to `exclude`, is a WIDER ALLOWANCE that settles 2 of the
 * 27 and blinds the gate to every future literal under that directory, justified or not. An
 * annotation escape does the opposite: the floor becomes 0, so the next unjustified monochrome
 * fails CI, and each exemption is one reviewable sentence in a diff naming the utility and the
 * reason — the `// token-ok:` convention DAWN-CONVERSION §1 already blesses.
 *
 * The annotation is read from the ORIGINAL source, because `stripComments` has blanked it out of
 * the matched text; the two line up because blanking is length-preserving.
 *
 * THE WINDOW IS STRUCTURAL, NOT A LINE COUNT: from the match's own line, walk UP and stop at
 * whichever comes first — a blank line, another match of the same pattern, or the top of the
 * comment block reached on the way. Every stop condition is a fact about the code, so there is no
 * number to tune later, and two of the three are what keep it honest:
 *
 *   • ANOTHER MATCH ENDS THE WALK, so one annotation can never cover two literals. Add a second
 *     bare `bg-white` under an existing `KEEP bg-white:` and the second one counts.
 *   • A BLANK LINE ENDS THE WALK, so an annotation cannot reach down a file to a site nobody
 *     wrote it about.
 *
 * A fixed `lines: 3` was written first and mis-read live carve-outs in both directions, which is
 * why it is gone: `components/spaces/space-form.tsx` explains its `text-white` in a three-line JSX
 * comment, putting the word KEEP four lines above the match, while `app/print/qr/page.tsx` writes
 * its `KEEP bg-white:` above the `return (`, one line further out again. A window that has to be
 * tuned to the length of someone's sentence is not a rule.
 */
function escapeChecker(entry) {
  if (!entry.escape) return null
  if ((entry.mode ?? 'matches') === 'files') {
    throw new Error(
      `${entry.key}: \`escape\` is a per-MATCH annotation and cannot be honoured in mode "files". ` +
        'Silently ignoring it would make the entry read as annotation-aware while counting every file.',
    )
  }
  const re = new RegExp(entry.escape.pattern)
  const site = (entry.patterns ?? []).map((p) => new RegExp(p))
  return (source, stripped, offset) => {
    const src = source.split('\n')
    const bare = stripped.split('\n')
    const i = source.slice(0, offset).split('\n').length - 1 // 0-based line of the match
    const window = [src[i] ?? '']
    let inComment = false
    for (let k = i - 1; k >= 0; k--) {
      if (src[k].trim() === '') break
      if (site.some((r) => r.test(bare[k]))) break
      const isComment = src[k] !== bare[k]
      if (inComment && !isComment) break
      if (isComment) inComment = true
      window.push(src[k])
    }
    return re.test(window.join('\n'))
  }
}

/**
 * Count one entry against an in-memory corpus.
 * @param entry  a baselines.json entry
 * @param files  [{ path, text, source? }] — POSIX repo-relative paths. `text` is comment-blanked;
 *               `source` is the original, read only to resolve an `escape` annotation.
 * @returns {{ count: number, files: string[] }} count plus the files that contributed
 */
export function countEntry(entry, files) {
  const scoped = files.filter((f) => inScope(f.path, entry))
  const patterns = (entry.patterns ?? []).map(compile)
  const absent = (entry.absent ?? []).map(compile)
  const escaped = escapeChecker(entry)
  const hit = []

  let count = 0

  for (const f of scoped) {
    const present = patterns.length === 0 || patterns.some((re) => { re.lastIndex = 0; return re.test(f.text) })
    const excluded = absent.some((re) => { re.lastIndex = 0; return re.test(f.text) })
    if (entry.mode === 'files') {
      if (present && !excluded) { count += 1; hit.push(f.path) }
      continue
    }
    if (excluded) continue
    let n = 0
    for (const re of patterns) {
      re.lastIndex = 0
      if (!escaped) { n += (f.text.match(re) ?? []).length; continue }
      const source = f.source ?? f.text
      let m
      while ((m = re.exec(f.text)) !== null) {
        if (!escaped(source, f.text, m.index)) n += 1
        if (re.lastIndex === m.index) re.lastIndex += 1
      }
    }
    if (n > 0) { count += n; hit.push(f.path) }
  }
  return { count, files: hit.sort() }
}

// ---------------------------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------------------------

/**
 * Fingerprint an entry's MEASUREMENT BASIS — everything that decides what gets counted.
 * Two numbers are only comparable when their bases match, so the baseline records the basis it
 * was measured under and the gate refuses to compare across a change.
 */
/** Bumped whenever the CORPUS PREPROCESSING changes, because that changes what every entry is
 *  measuring just as surely as editing its pattern does — and until 2026-08-05 the fingerprint
 *  could not see it. `strip-comments@1` is the first: blanking comments moved seven counts
 *  (literal-radius −41, white-black-literals −52) and raised one, none of it bought by a sweep.
 *  Folding it into the hash is what makes the gate REFUSE to compare across the change instead
 *  of silently booking those as wins. */
/** `strip-comments@2` (2026-08-17): the blanker learned that a string literal is not code. A file
 *  input's `accept="image/…"` glob puts a slash next to a star, which opened a block comment that
 *  ran to the next close-comment token anywhere in the file — blanking 121,627 characters of REAL
 *  markup across 101 files. A false FALL, the one direction a ratchet must never be wrong in.
 *  See `stripComments` for the measurement. */
const CORPUS_BASIS = 'strip-comments@2'

export function basisFingerprint(entry) {
  const canonical = JSON.stringify({
    corpus: CORPUS_BASIS,
    mode: entry.mode ?? 'matches',
    patterns: entry.patterns ?? [],
    absent: entry.absent ?? [],
    escape: entry.escape ?? null,
    include: entry.include ?? [],
    exclude: entry.exclude ?? [],
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

/**
 * Check that every baseline can account for itself. Returns human-readable problems; any
 * problem fails the gate, because an unaccountable baseline is indistinguishable from a
 * laundered one.
 */
export function auditProvenance(entries) {
  const problems = []
  for (const entry of entries) {
    const f = entry.frozen
    if (!f || typeof f !== 'object') {
      problems.push(`${entry.key}: baseline ${entry.baseline} carries no \`frozen\` record — where did this number come from?`)
      continue
    }
    if (f.value !== entry.baseline) {
      problems.push(
        `${entry.key}: baseline ${entry.baseline} ≠ frozen.value ${f.value} — the number was hand-edited without recording why.`,
      )
    }
    if (!DIRECTIONS.includes(f.direction)) {
      problems.push(`${entry.key}: frozen.direction "${f.direction}" is not one of ${DIRECTIONS.join(' / ')}.`)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.at ?? '')) {
      problems.push(`${entry.key}: frozen.at "${f.at}" is not an ISO date — a baseline must say WHEN it was frozen.`)
    }
    if (typeof f.reason !== 'string' || f.reason.trim().length < 12) {
      problems.push(`${entry.key}: frozen.reason must say, in a sentence, what moved this number.`)
    }
    const basis = basisFingerprint(entry)
    if (f.basis !== basis) {
      problems.push(
        `${entry.key}: the measurement basis changed since the baseline was frozen ` +
          `(basis ${f.basis ?? '—'} → ${basis}). ${entry.baseline} was measured by a different question, so it is ` +
          `not a floor for the current one. Re-freeze:  node scripts/check-adoption.mjs --update --key ${entry.key} --reason "<what changed>"`,
      )
    }
  }
  return problems
}

/** Evaluate every entry; returns one row per key (the scoreboard). */
export function evaluate(entries, files) {
  return entries.map((entry) => {
    const { count, files: hits } = countEntry(entry, files)
    const delta = count - entry.baseline
    const frozen = entry.frozen ?? null
    return {
      key: entry.key,
      description: entry.description,
      baseline: entry.baseline,
      current: count,
      delta,
      status: delta > 0 ? 'risen' : delta < 0 ? 'shrunk' : 'held',
      frozen,
      // A floor nobody swept for: raised outright, or rebased onto a different measurement.
      //
      // …UNLESS the floor is ZERO, and that exception is the point of the warning rather than a
      // hole in it. The note exists because "a raised or rebased floor is debt the ratchet stopped
      // guarding" — at baseline 0 the ratchet guards everything, since the very next site fails CI,
      // so there is nothing standing on that floor to name. literal-type and raw-palette are both
      // 0, both retired by real sweeps, and both were flagged ⚠️ forever only because a later
      // corpus change moved their fingerprint. They padded an eight-line warning block that
      // literal-display-type's 204-site gap was sitting inside, unread. A warning that names
      // classes with no debt in them is how the one with debt in it gets missed.
      unearned: frozen ? UNEARNED.has(frozen.direction) && entry.baseline > 0 : false,
      files: hits,
    }
  })
}

/** Render the scoreboard as a fixed-width table. Provenance rides alongside the numbers. */
export function formatScoreboard(rows) {
  const head = ['key', 'baseline', 'current', 'delta', '', 'frozen', 'how']
  const body = rows.map((r) => [
    r.key,
    String(r.baseline),
    String(r.current),
    r.delta === 0 ? '—' : r.delta > 0 ? `+${r.delta}` : String(r.delta),
    r.status === 'risen' ? '🔴 rose' : r.status === 'shrunk' ? '✅ shrank' : '✅ held',
    r.frozen?.at ?? '—',
    r.frozen ? `${r.unearned ? '⚠️ ' : ''}${r.frozen.direction}` : '⚠️ no record',
  ])
  const widths = head.map((_, i) => Math.max(...[head, ...body].map((r) => r[i].length)))
  const pad = (c, i) => (i === 0 || i >= 4 ? c.padEnd(widths[i]) : c.padStart(widths[i]))
  const line = (cells) => '  ' + cells.map(pad).join('  ').trimEnd()
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n')
}

/**
 * Name every baseline that is NOT standing on retired debt. `baseline vs current` cannot see
 * these — a raised floor reads "held" forever — so the gate says them out loud on every run,
 * with the date, the movement and the reason attached.
 */
export function formatProvenanceNotes(rows) {
  const flagged = rows.filter((r) => r.unearned)
  if (flagged.length === 0) return ''
  const out = [
    `  ⚠️  ${flagged.length} baseline(s) were not bought by a sweep. A raised or rebased floor is debt the`,
    '      ratchet stopped guarding, so it stays named here until a sweep brings the number back down:',
  ]
  for (const r of flagged) {
    const last = r.frozen
    out.push(`        • ${r.key} — ${last.direction} ${last.from === undefined ? '' : `${last.from} → ${last.value} `}on ${last.at}`)
    out.push(`            ${last.reason}`)
  }
  return out.join('\n')
}

/**
 * Merge measured counts into the config, ASYMMETRICALLY (ADR-928): falls are written down,
 * rises are refused unless explicitly allowed AND explained. Mutates `config`; returns what
 * happened so the caller can refuse to write.
 */
export function mergeBaselines(config, rows, { allowRaise = false, reason = '', at = today() } = {}) {
  const raised = []
  const changed = []
  for (const row of rows) {
    const entry = config.entries.find((e) => e.key === row.key)
    if (!entry) continue
    const basis = basisFingerprint(entry)
    const basisMoved = entry.frozen?.basis !== undefined && entry.frozen.basis !== basis
    if (row.current > entry.baseline) raised.push({ key: row.key, from: entry.baseline, to: row.current })
    if (row.current === entry.baseline && !basisMoved && entry.frozen) continue
    changed.push({ key: row.key, from: entry.baseline, to: row.current, basisMoved })
  }
  if (raised.length > 0 && !allowRaise) return { raised, changed: [], written: false }

  for (const change of changed) {
    const entry = config.entries.find((e) => e.key === change.key)
    const direction = change.basisMoved
      ? 'rebased'
      : entry.frozen === undefined
        ? 'seed'
        : change.to > change.from
          ? 'raised'
          : 'lowered'
    entry.history = [...(entry.history ?? []), { at, from: change.from, to: change.to, direction, reason }]
    entry.baseline = change.to
    entry.frozen = { at, value: change.to, direction, basis: basisFingerprint(entry), reason }
    if (direction !== 'seed') entry.frozen.from = change.from
  }
  return { raised, changed, written: true }
}

// ---------------------------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------------------------

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, exts, out)
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p.split('\\').join('/'))
  }
  return out
}

/** Blank out comments so PROSE ABOUT a token stops counting as a USE of it.
 *
 *  Hit twice on 2026-08-05, independently: writing `shadow-lg` inside a `//` comment raised
 *  `shadow-literals` by one, and a comment quoting `text-6xl sm:text-7xl` as the anti-pattern
 *  raised `literal-display-type` by four. No markup in either case. The mirror image is worse
 *  than the false rise: a sweep could bank a phantom "win" by deleting a comment. Same defect
 *  class as check-bridge's first version, which matched a token MENTIONED in a comment a
 *  thousand lines from the real at-rule.
 *
 *  BLANKED, NOT DELETED — every comment character becomes a space and newlines survive.
 *  Deleting text would pull unrelated code together and silently change what a SPAN entry
 *  measures. `handrolled-icon-button` spans an opening tag through its first child, and
 *  `raw-button-bg` spans an opening tag (it was a 500-character proximity window until
 *  2026-08-05 — see its `frozen.reason`); either would move if blanking changed lengths.
 *  Length-preserving substitution keeps every offset, line number and span distance intact,
 *  which means this change can only ever REMOVE comment matches, never move a real one. The
 *  invariant outlives any one pattern, so it holds for whatever span entry is added next.
 *
 *  Line comments are stripped only when the `//` OPENS the line (optionally indented). A naive
 *  strip would treat the `//` in `https://example.com` as a comment and blank the rest of that
 *  line — including any real class beside it — turning a false rise into a false FALL, which is
 *  the direction a ratchet must never be wrong in. A trailing comment after code on the same
 *  line still counts; that is the deliberate, safe side of the trade. */
/** `strip-comments@2` (2026-08-17) — THE SAME MISTAKE THE `//` RULE ABOVE WAS WRITTEN TO AVOID,
 *  one token over. The `//` case was guarded by hand; the open-comment case was not, and a regex
 *  cannot tell a comment opener from two characters inside a string. A file input's
 *  `accept="image/…"` glob — 37 of them in this repo — puts a slash next to a star, and so opened
 *  a block comment that ran to the NEXT close-comment token anywhere in the file, usually the end
 *  of some later JSDoc block. (This paragraph cannot spell either token, which is the
 *  demonstration.) Measured over `{app,components,lib}`: 101 files and 121,627 characters of real
 *  markup blanked, hiding 23 debt sites across six classes — literal-radius −11, raw-input −5,
 *  raw-px-arbitrary −3, raw-textarea −2, raw-select −1, shadow-literals −1. literal-radius
 *  therefore read 2,281 against a 2,287 floor and printed "✅ shrank" while its true count was
 *  2,292: a RISE, reported as a win.
 *
 *  So the scan now tracks string and template literals and recognises a comment only OUTSIDE them.
 *  Two properties are load-bearing, and both are asserted in check-adoption.test.ts:
 *    1. Still LENGTH-PRESERVING — every offset, line number and span distance survives, which is
 *       what lets an `escape` annotation map back onto its source line.
 *    2. Strictly UN-blanking versus @1 — every character @2 blanks, @1 blanked too. The change can
 *       therefore only reveal debt, never hide it, which is the safe direction for a ratchet.
 *  An unterminated quote in JSX prose (`don't`) stops at the newline, so its worst case is
 *  UNDER-blanking a comment: a false rise, which fails loudly, rather than a false fall. */
export function stripComments(text) {
  const out = text.split('')
  const blank = (from, to) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ' }
  let i = 0
  let atLineStart = true
  while (i < text.length) {
    const c = text[i]
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      i += 1
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue }
        if (text[i] === quote) { i += 1; break }
        if (quote !== '`' && text[i] === '\n') break
        i += 1
      }
      atLineStart = false
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end === -1) { i += 2; atLineStart = false; continue }
      blank(i, end + 2)
      i = end + 2
      atLineStart = false
      continue
    }
    if (c === '/' && text[i + 1] === '/' && atLineStart) {
      let end = text.indexOf('\n', i)
      if (end === -1) end = text.length
      blank(i, end)
      i = end
      continue
    }
    if (c === '\n') atLineStart = true
    else if (c !== ' ' && c !== '\t') atLineStart = false
    i += 1
  }
  return out.join('')
}

/** A ratchet compares today's count against a frozen one, so it reads an ABSENT corpus as a
 *  clean sweep. `walk` returns `[]` for a missing directory, every entry then books as
 *  `shrunk`, and the run prints "✓ 14 shrank" and exits 0.
 *
 *  Verified 2026-08-10 (ADR-962): pointing one `roots` entry at a directory that does not
 *  exist drops the corpus 3,953 → 2,833 files and turns every one of the 14 debt classes into
 *  a win. Renaming or moving a top-level directory — `components/` → `src/components/`, say —
 *  therefore reads as the largest sweep in the project's history while changing nothing.
 *
 *  This is the same defect the provenance work was built to stop, one level down: `frozen.basis`
 *  fingerprints the PATTERNS so a narrowed regex cannot bank a fake win, but nothing fingerprinted
 *  the CORPUS. A missing root is now a hard error, and the file count is asserted against a floor,
 *  because "the thing I measure disappeared" must never be spelled the same way as "the debt
 *  disappeared". */
const MIN_CORPUS_FILES = 2000

export function loadCorpus(config) {
  const missing = config.roots.filter((r) => !existsSync(r))
  if (missing.length > 0) {
    throw new Error(
      `check:adoption cannot see its corpus — missing root(s): ${missing.join(', ')} ` +
        `(cwd: ${process.cwd()}). An absent root reads as a clean sweep and would silently ` +
        `book every debt class as shrunk. Run from the repo root, or update "roots" in ${BASELINES}.`,
    )
  }

  const corpus = config.roots
    .flatMap((r) => walk(r, config.extensions))
    .sort()
    .map((path) => {
      const source = readFileSync(path, 'utf8')
      // `source` keeps the comments an `escape` annotation lives in; `text` is what gets matched.
      return { path, text: stripComments(source), source }
    })

  if (corpus.length < MIN_CORPUS_FILES) {
    throw new Error(
      `check:adoption scanned only ${corpus.length} file(s), expected at least ${MIN_CORPUS_FILES}. ` +
        `Either the extension filter is wrong or the tree is not what this gate thinks it is; ` +
        `a shrunken corpus makes every baseline look swept. Update MIN_CORPUS_FILES deliberately ` +
        `if the repo really did get this much smaller.`,
    )
  }
  return corpus
}

export function loadConfig(file = BASELINES) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

const flag = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null)

function main() {
  const config = loadConfig()
  const only = flag('--key')
  const entries = only ? config.entries.filter((e) => e.key === only) : config.entries
  if (only && entries.length === 0) {
    console.error(`✗ no baseline entry with key "${only}". Keys: ${config.entries.map((e) => e.key).join(', ')}`)
    process.exit(1)
  }
  const corpus = loadCorpus(config)
  const rows = evaluate(entries, corpus)

  if (process.argv.includes('--update')) {
    const reason = flag('--reason')
    if (!reason || reason.trim().length < 12) {
      console.error(
        '✗ --update needs --reason "<what moved these numbers>".\n' +
          '  A baseline with no stated reason is a number nobody can audit later; that is how a\n' +
          '  regression gets laundered into the floor. One sentence naming the sweep (or the basis\n' +
          '  change) is enough — it is written into the entry and printed on every future run.',
      )
      process.exit(1)
    }
    // ONE REASON PER ENTRY. `--update --reason "…"` writes that single sentence onto EVERY entry it
    // touches, which is how literal-radius came to carry literal-type's sentence: a pass-2a run moved
    // both, and the radius entry was stamped with "literal-type goes to 0 and the floor moves with it".
    // A provenance record whose reason describes a different class is worse than a blank one, because
    // it reads as an audited explanation. So a multi-entry update now has to be run per key.
    const wouldChange = rows.filter((row) => {
      const entry = config.entries.find((e) => e.key === row.key)
      if (!entry) return false
      const basisMoved = entry.frozen?.basis !== undefined && entry.frozen.basis !== basisFingerprint(entry)
      return !(row.current === entry.baseline && !basisMoved && entry.frozen)
    })
    if (wouldChange.length > 1 && !only) {
      console.error(
        `✗ --update would re-freeze ${wouldChange.length} entries with ONE reason, and they did not move\n` +
          '  for one reason. That sentence is the entry\'s whole audit trail; sharing it across classes\n' +
          '  puts a sentence about one class into the record of another.\n\n' +
          `    ${wouldChange.map((r) => r.key).join(', ')}\n\n` +
          '  Re-run once per key, each with the reason that actually moved it:\n' +
          `    node scripts/check-adoption.mjs --update --key ${wouldChange[0].key} --reason "<what moved it>"`,
      )
      process.exit(1)
    }
    const allowRaise = process.argv.includes('--allow-raise')
    const result = mergeBaselines(config, rows, { allowRaise, reason })
    if (!result.written) {
      console.error(`\n✗ ${result.raised.length} debt class(es) would be RAISED, not lowered. Nothing written.\n`)
      for (const r of result.raised) console.error(`    ${r.key}: ${r.from} → ${r.to}  (+${r.to - r.from})`)
      console.error(
        '\n  Re-freezing upward is not a re-freeze, it is a surrender: the new sites stop being debt\n' +
          '  and the ratchet reads green forever. Retire them instead. If the rise is genuinely correct\n' +
          '  (a class was redefined, code moved between scopes), say so and force it:\n' +
          '    node scripts/check-adoption.mjs --update --allow-raise --reason "<why the rise is correct>"\n' +
          '  The raise is then recorded with its date and reason, and flagged on every run until it falls.\n',
      )
      process.exit(1)
    }
    writeFileSync(BASELINES, `${JSON.stringify(config, null, 2)}\n`)
    const refreshed = evaluate(entries, corpus)
    console.log(`✓ adoption baselines re-frozen (${result.changed.length} entr${result.changed.length === 1 ? 'y' : 'ies'} changed):\n`)
    console.log(formatScoreboard(refreshed))
    const notes = formatProvenanceNotes(refreshed)
    if (notes) console.log(`\n${notes}`)
    return
  }

  // A baseline that cannot account for itself fails BEFORE any count is compared to it: comparing
  // against an unaccountable number is how the gate reported ten green classes while one of them
  // was standing on a raise and another on a narrowed pattern.
  const problems = auditProvenance(entries)
  if (problems.length > 0) {
    console.error(`\n✗ adoption ratchet: ${problems.length} baseline(s) cannot account for themselves.\n`)
    for (const p of problems) console.error(`  • ${p}`)
    console.error(
      '\n  Every baseline carries `frozen: { at, value, direction, basis, reason }`. The gate compares\n' +
        '  today against a number, so the number has to say when it was frozen, which way it moved, what\n' +
        '  question it answered (the basis fingerprint), and why. Fix the record — do not delete the check.\n',
    )
    process.exit(1)
  }

  const risen = rows.filter((r) => r.status === 'risen')
  if (risen.length === 0) {
    const shrunk = rows.filter((r) => r.status === 'shrunk')
    console.log(
      `✓ adoption ratchet: ${rows.length} debt class(es) held or shrank` +
        (shrunk.length ? ` — ${shrunk.length} shrank (${shrunk.reduce((a, r) => a + r.delta, 0)} sites retired).` : '.'),
    )
    console.log(formatScoreboard(rows))
    const notes = formatProvenanceNotes(rows)
    if (notes) console.log(`\n${notes}`)
    if (shrunk.length) {
      console.log('\n  A sweep landed. Re-freeze so the new floor holds:')
      console.log('    node scripts/check-adoption.mjs --update --reason "<which sweep retired them>"')
    }
    return
  }

  console.error(`\n✗ adoption ratchet: ${risen.length} debt class(es) ROSE above baseline.\n`)
  console.error(formatScoreboard(rows))
  console.error('')
  for (const r of risen) {
    console.error(`  • ${r.key} — ${r.description}`)
    console.error(`      baseline ${r.baseline} → ${r.current} (+${r.delta}). Sample sites:`)
    for (const f of r.files.slice(0, 8)) console.error(`        ${f}`)
    if (r.files.length > 8) console.error(`        … ${r.files.length - 8} more file(s)`)
  }
  console.error(
    '\n  Design debt is a one-way street: these counts may fall, never rise. Use the kit primitive or\n' +
      '  the role token instead of the literal (docs/UX-MATURITY-PLAN.md Lift 2, docs/PAGE-FRAMEWORK.md).\n' +
      '  If a rise is genuinely correct (a sweep moved code between scopes, a class was redefined), run\n' +
      '    node scripts/check-adoption.mjs --update --allow-raise --reason "<why the rise is correct>"\n' +
      '  in the SAME PR, so the new number is a reviewable line in the diff that carries its own date,\n' +
      '  direction and reason — and stays flagged ⚠️ on every run until a sweep brings it back down.\n',
  )
  process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
