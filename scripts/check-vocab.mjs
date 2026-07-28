#!/usr/bin/env node
// Vocabulary contract drift guard (ADR-879 / ADR-887, enforced per ADR-889). `pnpm check:vocab`,
// wired into CI.
//
// THE CONTRACT: every category-like vocabulary has exactly ONE source file, and every surface
// that renders a picker or validates a write reads it from there:
//   • SUBJECTS (Channels + Spaces + practices) — lib/taxonomy/subjects.ts, viewed through
//     lib/channels/categories.ts (ADR-887: the Channel file derives, it does not re-declare)
//   • SPACE KINDS — lib/spaces/categories.ts
//   • EVENT CATEGORIES — lib/events/options.ts
//
// Drift this guard exists to catch (all three shipped as real bugs before 2026-07-28):
//   • practice-builder carried a six-key hand copy of the channel vocabulary, missing
//     `activism` — a stored `activism` practice displayed as "None";
//   • the channel UPDATE actions accepted arbitrary category text the CREATE action refused;
//   • the events SEO hub catalog (app/discover/events/_data.ts) referenced seven category
//     values that exist nowhere and omitted six of the ten real ones — those six categories
//     silently vanished from the hub index and app/sitemap.ts.
//
// Three rules, deliberately NARROW (a guard the team learns to ignore protects nothing):
//   A. NO HAND-COPIED VOCABULARY: outside the canonical sources, no single array literal may
//      contain 3+ distinct canonical keys of one vocabulary as quoted strings (4+ for space
//      kinds, whose six keys are everyday words — 3 of them appear legitimately in the
//      application-track vocabulary, a different axis that shares spellings).
//      Keys are matched only INSIDE array literals, so a switch/case, a lookup, or a single
//      default value never trips it. Tests are exempt (they pin vocabularies on purpose).
//   B. PICKERS + WRITE GATES IMPORT THE SOURCE: every known category picker imports its
//      canonical module, and every category write gate imports its validator. A picker that
//      stops importing has forked its own list.
//   C. THE EVENT HUB CATALOG ⊆ AND ⊇ THE VOCABULARY: every `values` key in EVENT_CATEGORIES
//      (app/discover/events/_data.ts) is a real lib/events/options.ts category, and every
//      real category has a hub row — an unknown category is silently dropped from the hub
//      index and the sitemap, so a gap here is an invisible SEO hole, not an error.
//
// Escape hatch: add a file to ALLOWLIST below WITH a reason (printed on every run).
// Model: scripts/check-crm-parity.mjs / scripts/check-menu.mjs. Exits 1 on any violation.

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── The canonical sources (the ONLY files that may declare these vocabularies) ──
const CANONICAL_SOURCES = [
  'lib/taxonomy/subjects.ts',
  'lib/channels/categories.ts', // ADR-887 view onto subjects — same vocabulary, kept API
  'lib/spaces/categories.ts',
  'lib/events/options.ts',
]

// ── Rule A allowlist: files that legitimately hold 3+ canonical keys, each with its reason.
//    These CONSUME keys as data (demo fixtures picking sample channels); they do not declare a
//    vocabulary a picker could read. Printed on every run so the exemptions stay visible. ──
const ALLOWLIST = new Map([
  [
    'app/discover/events/_data.ts',
    'the event hub catalog NECESSARILY spells vocabulary values (that is its job); rule C checks it key-for-key in both directions, which is stronger than rule A',
  ],
  [
    'lib/demo/engine.ts',
    'demo fixture: default channel trio + slug-keyed flavour map consume canonical keys as sample data (ADR-887 known debt; not a picker source)',
  ],
  [
    'app/(main)/admin/demo/studio/studio-wizard.tsx',
    'demo wizard: default channel selection is three canonical keys used as a value, not a vocabulary',
  ],
])

// ── Rule B: the known pickers + write gates, and what each must import. Adding a NEW picker
//    means adding it here — that is the contract. `anyOf` = at least one symbol suffices. ──
const REQUIRED_IMPORTS = [
  // Channel category pickers (the drawer, the full editor, create) — ADR-879.
  { file: 'components/admin/modules/channel-settings-module.tsx', module: '@/lib/channels/categories', symbols: ['CHANNEL_CATEGORIES'] },
  { file: 'app/(main)/channels/[id]/edit/channel-edit-form.tsx', module: '@/lib/channels/categories', symbols: ['CHANNEL_CATEGORIES'] },
  { file: 'app/(main)/channels/new-channel-compose.tsx', module: '@/lib/channels/categories', symbols: ['CHANNEL_CATEGORIES'] },
  // Channel category write gates: create refuses off-list; the two update paths skip off-list
  // (never write, never throw — the ADR-879 preservation rule on the write side).
  { file: 'app/(main)/channels/actions.ts', module: '@/lib/channels/categories', symbols: ['isChannelCategory'] },
  { file: 'app/(main)/channels/admin-actions.ts', module: '@/lib/channels/categories', symbols: ['isChannelCategory'] },
  // Practice category pickers — practices share the Channel subject vocabulary.
  { file: 'components/studio/practice/practice-builder.tsx', module: '@/lib/channels/categories', symbols: ['CHANNEL_CATEGORIES'] },
  { file: 'components/admin/modules/practice-settings-module.tsx', module: '@/lib/channels/categories', symbols: ['CHANNEL_CATEGORIES'] },
  // Space subject + kind pickers (ADR-887).
  { file: 'components/spaces/space-business-info-form.tsx', module: '@/lib/taxonomy/subjects', symbols: ['SUBJECTS'] },
  { file: 'components/spaces/space-business-info-form.tsx', module: '@/lib/spaces/categories', symbols: ['SPACE_KINDS'] },
  { file: 'components/spaces/spaces-toolbar.tsx', module: '@/lib/taxonomy/subjects', symbols: ['SUBJECTS'] },
  // Event category pickers + write gate.
  { file: 'components/admin/modules/event-settings-module.tsx', module: '@/lib/events/options', symbols: ['CATEGORY_OPTIONS'] },
  { file: 'app/(main)/events/new/event-form.tsx', module: '@/lib/events/options', symbols: ['CATEGORY_OPTIONS'] },
  { file: 'app/(main)/events/index-data.ts', module: '@/lib/events/options', symbols: ['CATEGORY_OPTIONS'] },
  { file: 'app/(main)/events/admin-actions.ts', module: '@/lib/events/options', symbols: ['CATEGORY_VALUES'] },
]

const HUB_CATALOG = 'app/discover/events/_data.ts'
const SEARCH_DIRS = ['app', 'components', 'lib']

const read = (p) => readFileSync(join(ROOT, p), 'utf8')

// ── Parse the vocabularies out of their canonical sources (never hardcoded here, so the guard
//    tracks the vocabulary as it evolves; a parse that comes back tiny fails loudly instead). ──
function parseKeys(source, blockStart, keyRe) {
  const src = read(source)
  const start = src.indexOf(blockStart)
  if (start === -1) return []
  // The declaration block runs to the first line that closes the array at column 0.
  const end = src.indexOf('\n]', start)
  const block = src.slice(start, end === -1 ? src.length : end)
  return [...block.matchAll(keyRe)].map((m) => m[1])
}

function loadVocabularies() {
  const vocabs = [
    {
      name: 'subjects (Channels/Spaces/practices)',
      source: 'lib/taxonomy/subjects.ts',
      keys: parseKeys('lib/taxonomy/subjects.ts', 'export const SUBJECTS', /key:\s*'([a-z0-9-]+)'/g),
      threshold: 3,
    },
    {
      name: 'space kinds',
      source: 'lib/spaces/categories.ts',
      keys: parseKeys('lib/spaces/categories.ts', 'export const SPACE_KINDS', /key:\s*'([a-z0-9-]+)'/g),
      // All six kind keys are everyday words (business, coach, studio…) that other vocabularies
      // legitimately share (application tracks, partner personas). Requiring 4 of 6 keeps zero
      // false positives while still catching any copied kind list.
      threshold: 4,
    },
    {
      name: 'event categories',
      source: 'lib/events/options.ts',
      keys: parseKeys('lib/events/options.ts', 'export const CATEGORY_OPTIONS', /value:\s*'([a-z0-9_]+)'/g),
      threshold: 3,
    },
  ]
  for (const v of vocabs) {
    if (v.keys.length < 3) {
      throw new Error(
        `check-vocab could not parse the ${v.name} vocabulary from ${v.source} (found ${v.keys.length} keys). ` +
        `The declaration shape probably changed — update parseKeys in scripts/check-vocab.mjs.`,
      )
    }
  }
  return vocabs
}

function walkCodeFiles() {
  const out = []
  const walk = (rel) => {
    let entries
    try { entries = readdirSync(join(ROOT, rel), { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (['node_modules', '.next', '.git', 'dist'].includes(e.name)) continue
      const p = `${rel}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
    }
  }
  for (const d of SEARCH_DIRS) walk(d)
  return out
}

/**
 * Rule A scanner: find every quoted canonical key that sits inside an ARRAY literal, and
 * attribute it to its nearest enclosing `[`. A tiny state machine (strings, template literals,
 * comments, bracket depth) — not a parser, but precise enough that a switch/case, an object
 * map, or a single default value can never trip the rule: only a literal LIST of keys can.
 * Returns Map<arrayStartIndex, Set<key>> per vocabulary.
 */
function keysInArrayLiterals(src, keySet) {
  const perArray = new Map()
  const stack = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') { // line comment
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') { // block comment
      i = src.indexOf('*/', i + 2)
      if (i === -1) break
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      let j = i + 1
      let content = ''
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\') { content += src[j + 1] ?? ''; j += 2; continue }
        if (quote === '`' && src[j] === '\n') { content = null } // multi-line template ≠ a key
        if (content !== null) content += src[j]
        j++
      }
      if (content !== null && keySet.has(content) && stack.length > 0) {
        const arrayId = stack[stack.length - 1]
        if (!perArray.has(arrayId)) perArray.set(arrayId, new Set())
        perArray.get(arrayId).add(content)
      }
      i = j + 1
      continue
    }
    if (c === '[') stack.push(i)
    else if (c === ']') stack.pop()
    i++
  }
  return perArray
}

/** Does `src` import all `symbols` from `module`? Tolerant of multi-line blocks + aliases. */
function importsAll(src, module, symbols) {
  const re = new RegExp(
    `import\\s*(?:type\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]${module.replace(/[/\-]/g, (m) => '\\' + m)}['"]`,
    'gs',
  )
  const imported = new Set()
  let m
  while ((m = re.exec(src)) !== null) {
    for (const raw of m[1].split(',')) {
      const name = raw.replace(/\s+as\s+\w+/, '').replace(/\btype\b/, '').trim()
      if (name) imported.add(name)
    }
  }
  return symbols.every((s) => imported.has(s))
}

/** Run every check. Pure over the tree — a test can import and assert on it. */
export function checkVocab() {
  const violations = []
  const vocabs = loadVocabularies()
  const files = walkCodeFiles()
  const skipped = new Set([...CANONICAL_SOURCES, ...ALLOWLIST.keys()])

  // ── Rule A: no hand-copied vocabulary outside the canonical sources ──
  let scanned = 0
  for (const file of files) {
    if (skipped.has(file)) continue
    scanned++
    const src = read(file)
    for (const v of vocabs) {
      // Cheap pre-filter before the char scan: a file that can't hold `threshold` distinct
      // quoted keys can't violate.
      const present = v.keys.filter((k) => src.includes(`'${k}'`) || src.includes(`"${k}"`))
      if (present.length < v.threshold) continue
      const perArray = keysInArrayLiterals(src, new Set(v.keys))
      for (const [arrayStart, found] of perArray) {
        if (found.size >= v.threshold) {
          const line = src.slice(0, arrayStart).split('\n').length
          violations.push(
            `${file}:${line} — an array literal holds ${found.size} keys of the ${v.name} vocabulary ` +
            `(${[...found].join(', ')}).\n      This is a hand-copied vocabulary: it WILL drift (practice-builder's copy ` +
            `was missing 'activism').\n      Import from ${v.source} instead, or allowlist the file in scripts/check-vocab.mjs with a reason.`,
          )
        }
      }
    }
  }

  // ── Rule B: pickers + write gates import the canonical source ──
  for (const { file, module, symbols } of REQUIRED_IMPORTS) {
    let src
    try { src = read(file) } catch {
      violations.push(`Picker not found (did a path change? update REQUIRED_IMPORTS): ${file}`)
      continue
    }
    if (!importsAll(src, module, symbols)) {
      violations.push(
        `${file}\n      must import { ${symbols.join(', ')} } from '${module}'.\n` +
        `      A picker or write gate that stops importing the canonical source has forked its own vocabulary.`,
      )
    }
  }

  // ── Rule C: the event SEO hub catalog and the vocabulary agree in BOTH directions ──
  const eventVocab = new Set(vocabs.find((v) => v.name === 'event categories').keys)
  const hubSrc = read(HUB_CATALOG)
  const hubStart = hubSrc.indexOf('export const EVENT_CATEGORIES')
  const hubBlock = hubStart === -1 ? '' : hubSrc.slice(hubStart, hubSrc.indexOf('\n]', hubStart))
  const hubValues = [...hubBlock.matchAll(/values:\s*\[([^\]]*)\]/g)]
    .flatMap((m) => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]))
  if (hubValues.length === 0) {
    violations.push(
      `${HUB_CATALOG}: could not parse any \`values\` keys out of EVENT_CATEGORIES — the declaration shape ` +
      `probably changed; update scripts/check-vocab.mjs so rule C keeps holding.`,
    )
  }
  for (const val of hubValues) {
    if (!eventVocab.has(val)) {
      violations.push(
        `${HUB_CATALOG}: hub catalog references category '${val}', which is NOT in lib/events/options.ts.\n` +
        `      A phantom value can never match an event, so its hub is permanently empty.`,
      )
    }
  }
  for (const val of eventVocab) {
    if (!hubValues.includes(val)) {
      violations.push(
        `${HUB_CATALOG}: real event category '${val}' has NO hub row in EVENT_CATEGORIES.\n` +
        `      Events in it are silently dropped from the hub index and app/sitemap.ts (this exact drift hid six ` +
        `categories until 2026-07-28). Add a hub row with house-voice copy.`,
      )
    }
  }

  return { violations, vocabs, scanned, hubValues }
}

// ── CLI ──
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1])
if (isMain || process.argv[1]?.endsWith('check-vocab.mjs')) {
  const { violations, vocabs, scanned, hubValues } = checkVocab()
  console.log('Vocabulary contract guard (ADR-879 / ADR-887)\n')
  for (const v of vocabs) {
    console.log(`  checked: ${v.name} — ${v.keys.length} keys from ${v.source} (copy threshold: ${v.threshold}+ keys in one array)`)
  }
  console.log(`  checked: ${scanned} source files under ${SEARCH_DIRS.join('/, ')}/ for hand-copied vocabularies (tests exempt)`)
  console.log(`  checked: ${REQUIRED_IMPORTS.length} picker/write-gate imports of the canonical sources`)
  console.log(`  checked: event hub catalog (${HUB_CATALOG}) ⊆⊇ the event vocabulary (${hubValues.length} hub keys)`)
  for (const [file, reason] of ALLOWLIST) console.log(`  allowlisted: ${file} — ${reason}`)
  console.log('')
  if (violations.length === 0) {
    console.log('  ✓ one source per vocabulary; every picker reads it; the event hub catalog matches it exactly.')
    process.exit(0)
  }
  console.log(`  ✗ ${violations.length} vocabulary violation(s):\n`)
  for (const v of violations) console.log(`  ✗ ${v}\n`)
  console.log('The vocabulary contract: docs/DECISIONS.md ADR-879 (one source, off-list preserved) + ADR-887 (shared subjects) + ADR-889 (this guard).')
  process.exit(1)
}
