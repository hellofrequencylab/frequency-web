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
// violation, printing file:line. Wire into CI's checks job once content is clean.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'content'
const RULES = [
  { name: 'em-dash in brand copy', re: /—/, hint: 'use a comma, period, or colon' },
  { name: 'lowercase "zaps" (proper noun Zaps)', re: /\bzaps\b/, hint: 'capitalize: Zaps' },
  { name: 'lowercase "gems" (proper noun Gems)', re: /\bgems\b/, hint: 'capitalize: Gems' },
  { name: '"cohort" (member word is "Run")', re: /\bcohorts?\b/i, hint: 'say "Run" (ADR-252)' },
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

if (violations > 0) {
  console.error(`\n✖ canon guard: ${violations} violation(s) in ${ROOT}/. See docs/NAMING.md + docs/CONTENT-VOICE.md.`)
  process.exit(1)
}
console.log('✓ canon guard: content/ copy is on-canon (em dashes, Zaps/Gems casing, no "cohort").')
