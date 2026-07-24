#!/usr/bin/env node
// Canon guard — keeps member-facing copy on-canon so the meta-scan cleanup doesn't regress.
//
// Scope: content/**/*.md (help center + marketing content = pure member prose, so these
// checks are high-signal with near-zero false positives). It intentionally does NOT scan
// .tsx/.ts (copy there is mixed with code/comments/tokens and needs human judgement).
//
// Enforces the unambiguous rules from docs/NAMING.md + docs/CONTENT-VOICE.md:
//   - no em dashes in brand copy (CONTENT-VOICE hard rule);
//   - Zaps / Gems are proper nouns (never lowercase "zaps"/"gems");
//   - "cohort" is internal/research framing only (member word is "Run").
//
// Usage: `node scripts/check-canon.mjs` (or `pnpm check:canon`). Exits non-zero on any
// violation, printing file:line. Wired into CI's `checks` job (.github/workflows/ci.yml),
// alongside check:authz and check:seo, so a canon regression fails the PR.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const read = (p) => { try { return readFileSync(p, 'utf8') } catch { return null } }

const ROOT = 'content'

// The retired-framing tripwires (ADR-811 Community Collective). These phrases are the pre-rebrand
// money model + retired taglines/register that the brand-canon rewrite purged. They are distinctive
// enough to be near-zero false positives, so a reappearance is real drift, not a coincidence. Shared
// by the content/ scan below AND the marketing-source scan (comment-stripped) further down.
const BANNED = [
  { name: 'retired "pay-it-forward" money model', re: /pay[-\s]?it[-\s]?forward/i, hint: 'the model is 0% on your own bookings + a network-only take-rate (ADR-811)' },
  { name: 'retired "memberships fund the rooms"', re: /memberships?\s+fund\s+the\s+(rooms|physical spaces)/i, hint: 'Spaces are funded by a separate community-owned vehicle, not memberships' },
  { name: 'retired "keeps the rooms open"', re: /keeps?\s+the\s+rooms\s+open/i, hint: 'do not tie membership to funding the rooms' },
  { name: 'breaks promise #1 ("cut on what you sell")', re: /a?\s*small\s+cut\s+only\s+on\s+what\s+you\s+sell/i, hint: '0% on your own bookings; a cut only on network-sourced business' },
  { name: 'false "lowest fee on the platform"', re: /lowest\s+fee\s+on\s+the\s+platform/i, hint: 'false against the 0% Non Profit / Independent tiers' },
  { name: 'retired tagline "a place to be human"', re: /a\s+place\s+to\s+be\s+human/i, hint: 'tagline is "The Community Collective"' },
  { name: 'retired "one price, five doors"', re: /one\s+price,?\s+five\s+doors/i, hint: 'six-tier ladder now (ADR-811)' },
  { name: 'retired "flat 3%" take-rate', re: /flat\s+3\s?%/i, hint: 'take-rate is network-only + tier-declining, never a flat fee on your work' },
  { name: 'banned "find your tribe"', re: /find\s+your\s+tribe/i, hint: 'off-voice (CONTENT-VOICE)' },
  { name: 'banned "on the same wavelength"', re: /on\s+the\s+same\s+wavelength/i, hint: 'off-voice vibe register (CONTENT-VOICE)' },
]

const RULES = [
  { name: 'em-dash in brand copy', re: /—/, hint: 'use a comma, period, or colon' },
  { name: 'lowercase "zaps" (proper noun Zaps)', re: /\bzaps\b/, hint: 'capitalize: Zaps' },
  { name: 'lowercase "gems" (proper noun Gems)', re: /\bgems\b/, hint: 'capitalize: Gems' },
  { name: '"cohort" (member word is "Run")', re: /\bcohorts?\b/i, hint: 'say "Run" (ADR-252)' },
  ...BANNED,
]

/** Recursively collect .md files under dir. */
function mdFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...mdFiles(p))
    else if (entry.endsWith('.md')) out.push(p)
  }
  return out
}

let violations = 0
for (const file of mdFiles(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n')
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
      if (rule.re.test(bare)) {
        console.error(`${file}:${i + 1}  ${rule.name} — ${rule.hint}`)
        console.error(`    ${line.trim().slice(0, 120)}`)
        violations++
      }
    }
  })
}

// ── Marketing source scan (ADR-811 anti-drift) ────────────────────────────────────────────────────
// The retired money model + taglines lived in .tsx/.ts marketing source, not just content/*.md, and
// that is where the drift keeps returning. We scan the marketing surface for the distinctive BANNED
// phrases only (never the casing rules, which are ambiguous in code). Comments are STRIPPED first so a
// historical reference in a code comment ("purged the pay-it-forward copy") never trips the gate; only a
// live string/JSX-text reappearance does.
const SRC_DIRS = ['app/(marketing)', 'lib/page-editor/templates', 'lib/marketing', 'components/marketing']
const SRC_FILES = ['lib/site.ts', 'lib/jsonld.ts', 'app/page.tsx', 'app/llms.txt/route.ts', 'app/llms-full.txt/route.ts']

function srcFiles(dir) {
  const out = []
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    const p = join(dir, entry)
    let s
    try { s = statSync(p) } catch { continue }
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
const targets = [...new Set([...SRC_DIRS.flatMap(srcFiles), ...SRC_FILES])]
for (const file of targets) {
  const raw = read(file)
  if (raw == null) continue
  const code = stripComments(raw)
  for (const rule of BANNED) {
    const m = code.match(rule.re)
    if (m) {
      console.error(`${file}  ${rule.name} — ${rule.hint}`)
      console.error(`    ...${m[0]}...`)
      violations++
    }
  }
}

if (violations > 0) {
  console.error(`\n✖ canon guard: ${violations} violation(s). See docs/NAMING.md + docs/CONTENT-VOICE.md + ADR-811.`)
  process.exit(1)
}
console.log('✓ canon guard: content/ + marketing source on-canon (no em dashes/casing drift, no retired money model or taglines).')
