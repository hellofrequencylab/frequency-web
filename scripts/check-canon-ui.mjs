#!/usr/bin/env node
// Canon guard — UI-copy pass (complements check-canon.mjs, which covers content/**/*.md).
//
// WHY: check-canon.mjs deliberately skips .tsx because "copy there is mixed with
// code/comments/tokens." That left a blind spot — member-facing strings in app/** and
// components/** can drift off-canon (the 2026-07 meta-scan found "Marketplace" used for the
// Classifieds surface + "the shop" for the Frequency Store, none of which the .md guard sees).
//
// This pass closes it WITHOUT the false positives that scared the .md guard off .tsx: it
// parses each file with the TypeScript AST and inspects ONLY genuinely member-facing copy —
//   1. JSX text nodes (the words rendered between tags), and
//   2. string literals passed to copy-bearing JSX attributes (title, description, label, …).
// Identifiers (MarketplaceFacets), imports, className tokens, and code comments are never
// read, so component/prop names can keep the retired words.
//
// Usage: `node scripts/check-canon-ui.mjs [--report]`
//   default : exit non-zero on any violation (CI mode)
//   --report: print every finding grouped by rule and always exit 0 (triage mode)

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

const ROOTS = ['app', 'components']
const REPORT = process.argv.includes('--report')

// Operator/admin surfaces. The voice ban is primarily member-facing (docs/CONTENT-VOICE;
// operator copy is a lower-priority, separately-tracked backlog), so enforced mode skips
// these. --report still scans them so the operator backlog stays visible.
const OPERATOR_PATHS = ['/admin/', 'components/widgets/marketing/']
const isOperator = (file) => OPERATOR_PATHS.some((p) => file.includes(p))

// Attributes whose string value is rendered to a member. Kept deliberately tight so a
// config/identifier string (area="market", href, className) is never mistaken for copy.
const COPY_ATTRS = new Set([
  'title', 'description', 'label', 'placeholder', 'subtitle', 'heading', 'eyebrow',
  'cta', 'ctaLabel', 'emptyTitle', 'emptyDescription', 'tooltip', 'confirmLabel',
])

// Unambiguous, member-facing canon rules (docs/NAMING.md + docs/CONTENT-VOICE.md). Kept to the
// rules that are BOTH high-signal AND currently clean in app/**+components/**, so the guard is a
// true regression fence, not a backlog. (Operator/admin em-dash cleanup is tracked separately.)
// `enforced` rules fail CI (member scope only). The rest are report-only backlog: em dashes
// and "cohort" both have legitimate/deferred uses (operator prose; "founding cohort" is not the
// Journey-Run sense ADR-252 bans), so they need a human pass before they can gate.
const RULES = [
  { name: 'retired surface word "Marketplace"', re: /\bMarketplace\b/, hint: 'say Classifieds, Market, or Frequency Store (NAMING.md)', enforced: true },
  { name: 'lowercase "zaps" (proper noun Zaps)', re: /\bzaps\b/, hint: 'capitalize: Zaps', enforced: true },
  { name: 'lowercase "gems" (proper noun Gems)', re: /\bgems\b/, hint: 'capitalize: Gems', enforced: true },
  { name: 'em dash in brand copy', re: /—/, hint: 'use a comma, period, or colon (CONTENT-VOICE)', enforced: false },
  { name: '"cohort" (member word is "Run")', re: /\bcohorts?\b/i, hint: 'say "Run" (ADR-252)', enforced: false },
]

function tsxFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const s = statSync(p)
    if (s.isDirectory()) out.push(...tsxFiles(p))
    else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) out.push(p)
  }
  return out
}

/** Collect member-facing copy strings from a source file as {text, pos} records. */
function copyStrings(sourceFile) {
  const found = []
  const visit = (node) => {
    // 1. Rendered JSX text (the words between <tags>).
    if (ts.isJsxText(node)) {
      const text = node.text.trim()
      if (text) found.push({ text, pos: node.getStart(sourceFile) })
    }
    // 2. String literals on copy-bearing JSX attributes.
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sourceFile)
      if (COPY_ATTRS.has(name)) {
        const init = node.initializer
        const lit =
          ts.isStringLiteral(init) ? init
          : ts.isJsxExpression(init) && init.expression &&
            (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))
            ? init.expression
          : null
        if (lit) found.push({ text: lit.text, pos: lit.getStart(sourceFile) })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

const byRule = new Map(RULES.map((r) => [r.name, []]))
let total = 0

for (const root of ROOTS) {
  for (const file of tsxFiles(root)) {
    const src = readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    for (const { text, pos } of copyStrings(sf)) {
      for (const rule of RULES) {
        if (rule.re.test(text)) {
          const { line } = sf.getLineAndCharacterOfPosition(pos)
          byRule.get(rule.name).push({ file, line: line + 1, text: text.slice(0, 100), hint: rule.hint, operator: isOperator(file) })
          total++
        }
      }
    }
  }
}

const enforcedNames = new Set(RULES.filter((r) => r.enforced).map((r) => r.name))

if (REPORT) {
  for (const [rule, hits] of byRule) {
    const tag = enforcedNames.has(rule) ? 'ENFORCED' : 'report-only'
    console.log(`\n### [${tag}] ${rule} — ${hits.length} (${hits.filter((h) => !h.operator).length} member-facing)`)
    for (const h of hits) console.log(`  ${h.operator ? 'op ' : '   '}${h.file}:${h.line}  "${h.text}"`)
  }
  console.log(`\nTotal: ${total} finding(s) across ${RULES.length} rule(s). Enforced mode fails only on member-facing hits of the ENFORCED rules.`)
  process.exit(0)
}

// CI mode: fail only on ENFORCED rules, member-facing files.
const failures = []
for (const [rule, hits] of byRule) {
  if (!enforcedNames.has(rule)) continue
  for (const h of hits) if (!h.operator) failures.push({ ...h, rule })
}

if (failures.length > 0) {
  for (const f of failures) {
    console.error(`${f.file}:${f.line}  ${f.rule} — ${f.hint}`)
    console.error(`    "${f.text}"`)
  }
  console.error(`\n✖ canon UI guard: ${failures.length} member-facing violation(s). See docs/NAMING.md + docs/CONTENT-VOICE.md.`)
  console.error('  (Run `node scripts/check-canon-ui.mjs --report` to see the full backlog incl. report-only rules + operator copy.)')
  process.exit(1)
}
console.log('✓ canon UI guard: member-facing JSX copy is on-canon (retired surface names, Zaps/Gems casing).')
