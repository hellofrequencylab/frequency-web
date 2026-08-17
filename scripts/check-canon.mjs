#!/usr/bin/env node
// Canon guard — keeps member-facing copy on-canon so the meta-scan cleanup doesn't regress.
//
// THREE SCANS, widest to narrowest instrument:
//   1. content/**/*.md          — pure member prose; every rule, whole-line regex.
//   2. the marketing SOURCE     — comment-stripped whole-file scan for the retired ADR-811
//                                 money model + taglines, on the marketing roots only.
//   3. the CODE SEAM (ADR-1065) — app/ + lib/ + components/, but only the strings that
//                                 actually reach a human. See below.
//
// Enforces the unambiguous rules from docs/NAMING.md + docs/CONTENT-VOICE.md:
//   - no em dashes in brand copy (CONTENT-VOICE hard rule);
//   - Zaps / Gems are proper nouns (never lowercase "zaps"/"gems");
//   - "cohort" is internal/research framing only (member word is "Run");
//   - "broadcast" as a product noun is retired (the member word is "Dispatch").
//
// ── WHY SCAN 3 IS NOT A GREP (read before widening anything) ────────────────────────────────────
//
// This guard scanned content/ only for most of its life, and the note here used to say .tsx/.ts
// "needs human judgement". That was true of a GREP and false of the seam. Every canon break the
// 2026-07-27 meta scan found was in app/ or lib/ — Dispatches called "broadcasts" in visible
// strings, lowercase "zaps"/"gems" on stat pills — i.e. entirely outside what this file could see
// (LIVE-018).
//
// The trap in widening is that app/ and lib/ are mostly text that NO HUMAN EVER READS: identifiers,
// comments, log lines, database column names, enum values, ADR citations, Tailwind class strings,
// test fixtures. A grep for `broadcast` over lib/ returns hundreds of hits of which the design token
// `text-broadcast-*` and the `dispatches` schema are explicitly CANON (NAMING.md §Dispatch keeps
// them). A guard that fires on those gets routed around, and then it reads as coverage — the
// failure ADR-970 names.
//
// So a string is MEMBER-FACING here only when all three hold, and each is machine-checkable:
//
//   (1) SEAM — it occupies a copy POSITION in the TypeScript AST: a JSX text node, or a string /
//       template literal that is the value of a JSX attribute or object property whose name is in
//       COPY_KEYS below. Nothing else is read. Comments, identifiers, imports, `className`, route
//       paths, DB columns, enum values, log arguments and ADR citations are invisible BY
//       CONSTRUCTION rather than by exception — there is no list of things to remember to skip,
//       because the scanner never sees them. `.test.ts` / `.spec.ts` files are not walked at all.
//
//   (2) PROSE — the value reads as human text, not a machine token. A value containing whitespace
//       is prose; a single token is prose only if it is one plain word. That is what separates the
//       label `'Broadcast'` (judged) from `'text-broadcast-strong'`, `'--color-broadcast'`,
//       `'bg-broadcast'` and `'zaps_total'` (not judged), all of which sit in `label:`/`name:` keys
//       in this repo today.
//
//   (3) AUDIENCE — the rule's audience covers the file. Two audiences, and the split is the
//       canon's own, not a convenience:
//         · `everyone`  — every string a human reads, operator consoles included. AGENTS.md: the
//           two canons govern "everything a member, visitor, or operator can read", and NAMING.md
//           §Dispatch says "every visible label, help article, notification topic, AND ADMIN
//           HEADING says Dispatch". Proper-noun casing and retired product nouns are `everyone`.
//         · `member`    — member/host surfaces only, because the canon scopes these rules that way
//           itself. CONTENT-VOICE bans the em dash in "brand/member-facing copy"; NAMING.md
//           §Co-op/Run says "cohort is internal/research framing only" and "Member/host copy always
//           says Run". An operator analytics console reading "weekly retention cohorts" is CORRECT
//           copy, and a rule that failed it would be a rule banning the canon.
//
// SURFACES below classifies the operator surfaces that the path segments `admin/` and `manage/`
// do not already cover. It is a CLASSIFICATION, never a waiver: a file on it is still judged by
// every `everyone` rule. EXCEPTIONS is the waiver list, it carries a canon citation per entry, it
// is capped, and both are printed on every run.
//
// Usage: `node scripts/check-canon.mjs` (or `pnpm check:canon`). Exits non-zero on any
// violation, printing file:line. Wired into CI's `checks` job (.github/workflows/ci.yml),
// alongside check:authz and check:seo, so a canon regression fails the PR. The seam scan is
// additionally enforced by scripts/check-canon.test.ts, which vitest auto-discovers.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import ts from 'typescript'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => { try { return readFileSync(join(REPO, p), 'utf8') } catch { return null } }

const ROOT = 'content'

// The retired-framing tripwires (ADR-811 Community Collective). These phrases are the pre-rebrand
// money model + retired taglines/register that the brand-canon rewrite purged. They are distinctive
// enough to be near-zero false positives, so a reappearance is real drift, not a coincidence. Shared
// by the content/ scan below AND the marketing-source scan (comment-stripped) further down.
export const BANNED = [
  { name: 'retired "pay-it-forward" money model', re: /pay[-\s]?it[-\s]?forward/i, hint: 'the model is 0% on your own bookings + a network-only take-rate (ADR-811)' },
  { name: 'retired "memberships fund the rooms"', re: /memberships?\s+fund\s+the\s+(rooms|physical spaces)/i, hint: 'Spaces are funded by a separate community-owned vehicle, not memberships' },
  { name: 'retired "keeps the rooms open"', re: /keeps?\s+the\s+rooms\s+open/i, hint: 'do not tie membership to funding the rooms' },
  { name: 'breaks promise #1 ("cut on what you sell")', re: /a?\s*small\s+cut\s+only\s+on\s+what\s+you\s+sell/i, hint: '0% on your own bookings; a cut only on network-sourced business' },
  { name: 'false "lowest fee on the platform"', re: /lowest\s+fee\s+on\s+the\s+platform/i, hint: 'false against the 0% Non Profit / Independent tiers' },
  { name: 'retired tagline "a place to be human"', re: /a\s+place\s+to\s+be\s+human/i, hint: 'tagline is "Community Collective"' },
  { name: 'retired "one price, five doors"', re: /one\s+price,?\s+five\s+doors/i, hint: 'six-tier ladder now (ADR-811)' },
  { name: 'retired "flat 3%" take-rate', re: /flat\s+3\s?%/i, hint: 'take-rate is network-only + tier-declining, never a flat fee on your work' },
  // 🔴 THREE RULES WERE DELETED FROM HERE, AND THE REASON MATTERS (ADR-914, superseding ADR-913).
  //
  // This guard used to ban `/\b10\s?%\s+on\b/`, `/free\s+space\s+\d{1,2}\s?%/`, and "halves the rate",
  // on the doctrine that "the free Member cannot sell at all, and no surface may quote a rate for a tier
  // that takes no payments". That rule is REVERSED. Selling is free on every tier, 10% is the reference
  // rate the entire ladder descends from, a free Space quotes exactly that rung, and Business really does
  // halve it (10% -> 5%). All three patterns had become bans on CORRECT copy.
  //
  // They never actually fired, which is the part worth remembering: every live rate interpolates from the
  // take-rate config, so the literal string never appears in source, and a stale ban sat here reading as
  // canon while being unenforceable and wrong. A guard nobody trips is a guard nobody notices has rotted.
  //
  // What survives is the real invariant, and it is stronger than any of the three: a hardcoded rate in
  // marketing source is the smell, whatever its value. lib/marketing/marketing-figures.test.ts enforces
  // that directly by failing on any `$`+digit or percentage in a marketing source, which is why no
  // per-rung regex is needed here at all.
  { name: 'banned "find your tribe"', re: /find\s+your\s+tribe/i, hint: 'off-voice (CONTENT-VOICE)' },
  { name: 'banned "on the same wavelength"', re: /on\s+the\s+same\s+wavelength/i, hint: 'off-voice vibe register (CONTENT-VOICE)' },
].map((r) => ({ ...r, audience: 'everyone' }))

export const RULES = [
  // CONTENT-VOICE's punctuation hard rule scopes itself: "do not use em dashes anywhere in
  // BRAND/MEMBER-FACING copy". An operator console's analytics blurb is neither, so this rule is
  // `member`. On the code seam that distinction is the whole difference between 1 finding and 39.
  { name: 'em-dash in brand copy', re: /—/, hint: 'use a comma, period, or colon', audience: 'member' },
  { name: 'lowercase "zaps" (proper noun Zaps)', re: /\bzaps\b/, hint: 'capitalize: Zaps', audience: 'everyone' },
  { name: 'lowercase "gems" (proper noun Gems)', re: /\bgems\b/, hint: 'capitalize: Gems', audience: 'everyone' },
  // NAMING.md §Co-op / Run: "Member/host copy always says 'Run,' never 'cohort' (cohort is
  // INTERNAL/RESEARCH FRAMING ONLY)". The canon licenses the word on an operator surface, so an
  // `everyone` audience here would be a rule that fails the canon: /admin/crm's trait catalog and
  // the retention widget describe "weekly cohorts" correctly and must keep doing so.
  { name: '"cohort" (member word is "Run")', re: /\bcohorts?\b/i, hint: 'say "Run" (ADR-252)', audience: 'member' },
  // The retired NOUN, not the verb. NAMING.md §Dispatch: "This is the sole member-facing name…
  // 'Broadcast' is retired from member copy and RESERVED… it survives only as the internal route,
  // schema, featureKeys, and design token" — and, explicitly, "The verb 'broadcast' as plain
  // English… is fine; the product noun is always Dispatch."
  //
  // That distinction is load-bearing rather than pedantic: content/help/safety/meeting-people-
  // safely.md says "It is never broadcast, and nobody is added to a mailing list", which is
  // correct copy. A flat /\bbroadcasts?\b/ would fail the one sentence in content/ that uses the
  // word properly, and a rule that cries wolf on correct copy gets deleted.
  //
  // So: flag the noun, exempt the verb by its grammar. Verb forms are preceded by a be-verb,
  // a negation, an infinitive "to", or a coordinating "or"/"and" after another verb; or followed
  // by "to"/"across" (broadcast TO the hub). Everything else — "Latest broadcasts", "your
  // broadcast", "Edit broadcast", "${scope} broadcast" — is the noun, and every one of those was a
  // real violation on 2026-08-10.
  //
  // Front matter is already skipped by the scanner above, so `featureKeys: [broadcast]` — a
  // named survivor — never reaches this rule. On the code seam the same survivors are invisible
  // for a different reason: `text-broadcast-strong` and `--color-broadcast` fail the PROSE test.
  //
  // AUDIENCE `everyone`, and NAMING.md is explicit about why: "every visible label, help article,
  // notification topic, AND ADMIN HEADING says Dispatch."
  {
    name: '"broadcast" as a NOUN (the member-facing noun is Dispatch)',
    re: /(?<!\b(?:is|are|was|were|be|been|being|never|not|to)\s)\bbroadcasts?\b(?!\s+(?:to|across)\b)/i,
    hint: 'say "Dispatch" (NAMING.md §Dispatch). The VERB is fine: "it is never broadcast".',
    audience: 'everyone',
  },
  ...BANNED,
]

/** Recursively collect .md files under dir. */
function mdFiles(dir) {
  const out = []
  for (const entry of readdirSync(join(REPO, dir))) {
    const p = `${dir}/${entry}`
    const s = statSync(join(REPO, p))
    if (s.isDirectory()) out.push(...mdFiles(p))
    else if (entry.endsWith('.md')) out.push(p)
  }
  return out
}

/** Scan content/**\/*.md. Pure member prose, so every rule applies regardless of audience. */
export function scanContent() {
  const found = []
  for (const file of mdFiles(ROOT)) {
    const lines = read(file).split('\n')
    // Skip the YAML frontmatter block (slugs, featureKeys, etc. are metadata, not prose).
    let inFrontmatter = false
    if (lines[0]?.trim() === '---') inFrontmatter = true
    lines.forEach((line, i) => {
      if (inFrontmatter) {
        if (i > 0 && line.trim() === '---') inFrontmatter = false
        return
      }
      // Strip inline code spans and markdown link/image URLs (the `](url)` part) — only the
      // rendered prose + link TEXT is member-facing copy; slugs like /help/zaps-and-gems are not.
      const bare = line
        .replace(/`[^`]*`/g, '')
        .replace(/\]\([^)]*\)/g, ']')
        .replace(/\]:\s*\S+/g, ']:') // reference-style link definitions
      for (const rule of RULES) {
        if (rule.re.test(bare)) found.push({ file, line: i + 1, rule, text: line.trim().slice(0, 120) })
      }
    })
  }
  return found
}

// ── Marketing source scan (ADR-811 anti-drift) ────────────────────────────────────────────────────
// The retired money model + taglines lived in .tsx/.ts marketing source, not just content/*.md, and
// that is where the drift keeps returning. We scan the marketing surface for the distinctive BANNED
// phrases only (never the casing rules, which are ambiguous in code). Comments are STRIPPED first so a
// historical reference in a code comment ("purged the pay-it-forward copy") never trips the gate; only a
// live string/JSX-text reappearance does.
// `lib/comms` is here because the retired tagline shipped in the footer of EVERY branded
// reply and digest for as long as this gate has existed, and the gate could not see it:
// member-facing copy is not only on marketing pages. If we send it to a person, scan it.
//
// The seam scan below now covers all of app/ + lib/ + components/, which is a superset of these
// roots — but it is a NARROWER instrument on each of them (copy positions only). This whole-file
// scan stays because a retired tagline pasted into a helper's return value or a config object with
// an unlisted key is still drift, and only this scan sees it.
const SRC_DIRS = ['app/(marketing)', 'lib/page-editor/templates', 'lib/marketing', 'components/marketing', 'lib/comms']
const SRC_FILES = ['lib/site.ts', 'lib/jsonld.ts', 'app/page.tsx', 'app/llms.txt/route.ts', 'app/llms-full.txt/route.ts']

function srcFiles(dir) {
  const out = []
  let entries
  try { entries = readdirSync(join(REPO, dir)) } catch { return out }
  for (const entry of entries) {
    const p = `${dir}/${entry}`
    let s
    try { s = statSync(join(REPO, p)) } catch { continue }
    if (s.isDirectory()) out.push(...srcFiles(p))
    else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) out.push(p)
  }
  return out
}
/** Strip block, line, and JSX comments so only live code/strings/JSX-text remain. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* block */
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ') // {/* jsx */}
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1') // // line (avoid matching https://)
}

/** A gate that scans nothing reports a clean bill of health. `srcFiles()` swallows a missing
 *  directory (`try { readdirSync } catch { return out }`), so renaming `app/(marketing)` would drop
 *  four of the five roots with no signal at all and this guard would print ✓ over an unscanned
 *  tree. Measured ~130 targets on 2026-08-10; the floor sits well under that and far above zero.
 *  Same pattern as MIN_ROWS in check-gate-parity.mjs. */
export const MIN_TARGETS = 60

export function scanMarketingSource() {
  const targets = [...new Set([...SRC_DIRS.flatMap(srcFiles), ...SRC_FILES])]
  const found = []
  for (const file of targets) {
    const raw = read(file)
    if (raw == null) continue
    const code = stripComments(raw)
    for (const rule of BANNED) {
      const m = code.match(rule.re)
      if (m) found.push({ file, line: null, rule, text: `...${m[0]}...` })
    }
  }
  return { targets, found }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SCAN 3 · THE CODE SEAM (LIVE-018 / ADR-1065)
// ════════════════════════════════════════════════════════════════════════════════════════════════

export const SEAM_ROOTS = ['app', 'lib', 'components']

/**
 * The copy-carrying keys. A string literal is judged ONLY when it is the value of a JSX attribute
 * or an object property with one of these names — or is JSX text, which needs no key.
 *
 * This is the whole reason the seam scan has a false-positive rate near zero: a DB column, an enum
 * value, a feature key, a route, a Tailwind class, an idempotency prefix and an audit action are all
 * string literals too, and none of them is the value of `label`/`title`/`description`. Adding a key
 * here widens the scan; adding a WORD to RULES does not.
 *
 * `name` and `text` earn their place through the PROSE test (below), which is what keeps
 * `name: '--color-broadcast'` and `text: 'text-broadcast-strong'` out while keeping the pricing
 * tier `name: 'Pay it forward'` and the feature line `text: '…'` in.
 */
export const COPY_KEYS = new Set([
  'label', 'title', 'description', 'desc', 'placeholder', 'heading', 'subheading', 'subtitle',
  'caption', 'hint', 'helpText', 'tooltip', 'alt', 'aria-label', 'ariaLabel',
  'emptyTitle', 'emptyDescription', 'blurb', 'tagline', 'headline', 'subhead', 'eyebrow',
  'summary', 'body', 'message', 'note', 'cta', 'ctaLabel', 'confirmLabel', 'cancelLabel',
  'submitLabel', 'actionLabel', 'buttonLabel', 'shortLabel', 'sublabel',
  'question', 'answer', 'name', 'text', 'copy',
])

/**
 * SURFACE CLASSIFICATION — NOT a waiver list.
 *
 * A file classified `operator` is still judged by every `everyone` rule (proper-noun casing,
 * retired product nouns, the ADR-811 money model). All it opts out of is the two rules the canon
 * itself scopes to member/host copy. `admin/` and `manage/` path segments are classified
 * automatically; this list is only for the operator surfaces that live elsewhere, and every entry
 * carries the reason. It is printed on every run and capped by MAX_SURFACE_ENTRIES.
 *
 * `not-copy` is stronger — the strings in these files are not read by a human at all — and is
 * capped harder, because "no human reads this" is a claim that rots.
 */
export const SURFACES = new Map([
  ['app/(main)/pages/', { kind: 'operator', why: 'the Pages operator workspace: every route is behind requireAdmin, and lib/layout/page-chrome.ts calls it "a member-accessible operator MANAGER"' }],
  ['components/widgets/', { kind: 'operator', why: 'the operator dashboard widgets (rendered only inside /admin consoles)' }],
  ['lib/widgets/modules.ts', { kind: 'operator', why: 'the operator dashboard widget catalog that components/widgets/ renders' }],
  ['lib/traits/registry.ts', { kind: 'operator', why: 'the CRM trait catalog rendered in /admin/crm; NAMING.md licenses "cohort" precisely here, as research framing' }],
  ['lib/nav/studio.ts', { kind: 'operator', why: 'THE operator destination catalog (ADR-848; check-menu.mjs names it as such)' }],
  ['lib/funnels/funnel-styles.ts', { kind: 'operator', why: 'the funnel-style catalog for the /pages/sequences operator console' }],
  ['lib/studio/recommendations.ts', { kind: 'operator', why: 'the AI Intelligence Studio recommendation feed (ADR-167); Admin/Janitor only' }],
  ['lib/ai/autodoc.ts', { kind: 'operator', why: 'the help-drift PR comment: a staff checklist posted to a pull request, never member copy' }],
  ['lib/ai/vera/tools.ts', { kind: 'not-copy', why: "the tool-schema `description` fields are the model's prompt, not human copy (ADR-066); Vera's OUTPUT is governed by lib/ai/voice.ts" }],
])
export const MAX_SURFACE_ENTRIES = 12

/**
 * WAIVERS — a hit the CANON ITSELF licenses. One entry per file+rule, each citing the canon line
 * that permits it. This is the list that must shrink; it is capped so it cannot quietly grow into
 * the coverage-shaped hole ADR-970 describes.
 */
export const EXCEPTIONS = [
  {
    file: 'components/admin/theme-studio/tokens.ts',
    rule: '"broadcast" as a NOUN (the member-facing noun is Dispatch)',
    why: 'the theme studio LABELS the design token. NAMING.md §Dispatch keeps "the design token (text-broadcast-*)" as one of the three named survivors, so the swatch has to be able to say its own name.',
  },
  {
    file: 'lib/walkthroughs.ts',
    rule: '"broadcast" as a NOUN (the member-facing noun is Dispatch)',
    why: 'ACCENT_TOKENS labels the same design token for the walkthrough slide editor swatch (NAMING.md §Dispatch, the design-token survivor).',
  },
]
export const MAX_EXCEPTIONS = 4

/** Files the seam scan never walks. Tests pin canon violations ON PURPOSE (a test asserting the
 *  guard catches "broadcasts" must be allowed to contain the word), and a scanner that judged them
 *  would make its own test suite unwritable. */
const SEAM_SKIP = /(\.(test|spec)\.tsx?$)|(^|\/)(node_modules|\.next|\.git|dist|__fixtures__|__mocks__)(\/|$)/

/**
 * PROSE TEST — does this literal read as human text, or as a machine token?
 *
 * Whitespace means prose. A single token is prose only when it is one plain word, which is what
 * separates a one-word LABEL ("Broadcast", "Dispatch") from the identifier-shaped values that share
 * these keys in this repo: 'text-broadcast-strong', '--color-broadcast', 'bg-broadcast',
 * 'zaps_total', 'suggest_circle', '/marketplace', 'broadcast.send'.
 *
 * Exported so the decision is testable on its own, without a tree.
 */
export function isProse(value) {
  const t = value.trim()
  if (!t || !/[A-Za-z]/.test(t)) return false
  if (/\s/.test(t)) return true
  return /^[A-Za-z][A-Za-z']*[.,!?:;]?$/.test(t)
}

/** Is `file` (a repo-relative posix path) an operator surface, and why? */
export function classifySurface(file) {
  for (const [prefix, meta] of SURFACES) if (file === prefix || file.startsWith(prefix)) return meta
  if (/(^|\/)(admin|manage)(\/|$)/.test(file)) {
    return { kind: 'operator', why: 'an admin/ or manage/ path segment: an operator console by construction' }
  }
  return { kind: 'member', why: '' }
}

/**
 * Extract every member-facing string from one TypeScript/TSX source.
 *
 * Exported and pure over a STRING so the seam definition is unit-testable: a test can hand it a
 * comment, a fixture, and an identifier carrying the same word and assert that none of them come
 * back. Returns `{ line, key, text }`, where `key` is the seam that admitted the string.
 */
export function memberFacingStrings(src, filename = 'x.tsx') {
  const sf = ts.createSourceFile(
    filename, src, ts.ScriptTarget.Latest, true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const out = []
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1

  /** The literal text of a copy VALUE, or null when the node is not a literal we can read.
   *  A template with substitutions is flattened to its literal spans, joined by a space, because
   *  `` `${scope} broadcast` `` is exactly the shape the 2026-08-10 sweep found in the wild. */
  const literalText = (node) => {
    if (!node) return null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ')
    if (ts.isJsxExpression(node)) return literalText(node.expression)
    return null
  }

  const add = (node, text, key) => {
    if (text && isProse(text)) out.push({ line: lineOf(node), key, text })
  }

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const t = node.text.trim()
      if (t) add(node, t, 'jsx-text')
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const key = node.name.getText(sf)
      if (COPY_KEYS.has(key)) add(node, literalText(node.initializer), key)
    } else if (ts.isPropertyAssignment(node)) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null
      if (key && COPY_KEYS.has(key)) add(node, literalText(node.initializer), key)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function seamFiles() {
  const out = []
  const walk = (rel) => {
    let entries
    try { entries = readdirSync(join(REPO, rel), { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const p = `${rel}/${e.name}`
      if (SEAM_SKIP.test(p)) continue
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name)) out.push(p)
    }
  }
  for (const r of SEAM_ROOTS) walk(r)
  return out
}

/** NON-TRIVIALITY FLOORS. The seam scan's verdict is "none of the N strings I extracted breaks
 *  canon", and N is the instrument. If the walk breaks, a root moves, or a TypeScript upgrade
 *  changes a node predicate so every literal is silently reclassified as unreadable, the scan
 *  reports ✓ over nothing — the exact missing-instrument failure MIN_TARGETS above and
 *  check-labels.mjs's MIN_RESOLVED exist for. Measured on 2026-08-17: 3,398 files, 22,524 strings.
 *  The floors sit well under both and far above zero. */
export const MIN_SEAM_FILES = 2000
export const MIN_SEAM_STRINGS = 15000

export function scanCodeSeam() {
  const files = seamFiles()
  const found = []
  let strings = 0
  const counts = { member: 0, operator: 0, 'not-copy': 0 }
  const waived = []
  for (const file of files) {
    const surface = classifySurface(file)
    counts[surface.kind]++
    if (surface.kind === 'not-copy') continue
    const src = read(file)
    if (src == null) continue
    // NOTE: no cheap "does the raw text match any rule" pre-filter here, deliberately. It saved
    // ~1s and made `strings` a MOVING instrument — it counted only the files that could violate,
    // so the number fell as the tree got cleaner, and MIN_SEAM_STRINGS would have started tripping
    // on success. Every file is parsed, and `strings` therefore measures the corpus, not the debt.
    for (const s of memberFacingStrings(src, file)) {
      strings++
      for (const rule of RULES) {
        if (rule.audience === 'member' && surface.kind !== 'member') continue
        if (!rule.re.test(s.text)) continue
        const ex = EXCEPTIONS.find((e) => (file === e.file || file.startsWith(e.file)) && e.rule === rule.name)
        if (ex) { waived.push({ file, line: s.line, rule: rule.name }); continue }
        found.push({ file, line: s.line, rule, text: `[${s.key}] ${s.text.replace(/\s+/g, ' ').slice(0, 130)}` })
      }
    }
  }
  return { files, found, strings, counts, waived }
}

// ── The whole guard, as one pure call a test can assert on ────────────────────────────────────────
export function checkCanon() {
  const content = scanContent()
  const marketing = scanMarketingSource()
  const seam = scanCodeSeam()
  return { content, marketing, seam }
}

// ── CLI ──
const invokedDirectly = process.argv[1]?.endsWith('check-canon.mjs')
if (invokedDirectly) {
  const { content, marketing, seam } = checkCanon()
  let violations = 0
  const report = (list) => {
    for (const v of list) {
      console.error(`${v.file}${v.line ? `:${v.line}` : ''}  ${v.rule.name} — ${v.rule.hint}`)
      console.error(`    ${v.text}`)
      violations++
    }
  }

  report(content)

  if (marketing.targets.length < MIN_TARGETS) {
    console.error(
      `✖ canon guard resolved only ${marketing.targets.length} marketing target(s), expected at least ${MIN_TARGETS}. ` +
        'A source root moved or the walk is broken; a run that reads almost nothing must fail rather ' +
        'than report the canon as held.',
    )
    process.exit(1)
  }
  report(marketing.found)

  if (seam.files.length < MIN_SEAM_FILES || seam.strings < MIN_SEAM_STRINGS) {
    console.error(
      `✖ canon guard: the code-seam scan read ${seam.files.length} file(s) and extracted ${seam.strings} ` +
        `member-facing string(s), below the floors (${MIN_SEAM_FILES} / ${MIN_SEAM_STRINGS}). A root moved, the ` +
        'walk broke, or a parser change reclassified every literal as unreadable. "I read nothing and found ' +
        'nothing" is not a clean bill of health.',
    )
    process.exit(1)
  }
  report(seam.found)

  if (SURFACES.size > MAX_SURFACE_ENTRIES) {
    console.error(`✖ canon guard: SURFACES holds ${SURFACES.size} entries, over the cap of ${MAX_SURFACE_ENTRIES}. Classify by path segment or fix the copy; do not grow the list.`)
    process.exit(1)
  }
  if (EXCEPTIONS.length > MAX_EXCEPTIONS) {
    console.error(`✖ canon guard: EXCEPTIONS holds ${EXCEPTIONS.length} waivers, over the cap of ${MAX_EXCEPTIONS}. This list must shrink, never grow.`)
    process.exit(1)
  }

  console.log('Canon guard (docs/NAMING.md + docs/CONTENT-VOICE.md + ADR-811 + ADR-1065)\n')
  console.log(`  content/     ${mdFiles(ROOT).length} markdown file(s), every rule, whole-line`)
  console.log(`  marketing/   ${marketing.targets.length} source file(s), retired money model + taglines, comments stripped`)
  console.log(
    `  code seam    ${seam.files.length} file(s) under ${SEAM_ROOTS.join('/, ')}/ ` +
      `(${seam.counts.member} member · ${seam.counts.operator} operator · ${seam.counts['not-copy']} not-copy), ` +
      `${seam.strings} member-facing string(s) judged`,
  )
  for (const [prefix, meta] of SURFACES) console.log(`    classified ${meta.kind}: ${prefix} — ${meta.why}`)
  for (const e of EXCEPTIONS) console.log(`    waived: ${e.file} · ${e.rule}\n      ${e.why}`)
  if (seam.waived.length) console.log(`    (${seam.waived.length} hit(s) waived by the ${EXCEPTIONS.length} entries above)`)

  if (violations > 0) {
    console.error(`\n✖ canon guard: ${violations} violation(s). See docs/NAMING.md + docs/CONTENT-VOICE.md + ADR-811.`)
    process.exit(1)
  }
  console.log('\n  ✓ content/, marketing source, and every member-facing string in app/ + lib/ + components/ are on-canon.')
}
