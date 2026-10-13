// LIVE-913 probe (docs/LAUNCH-MARKETING-PLAN.md §14, Phase 0.4): every "0%", "100%", "no fee" or
// "keep everything" money claim on the pricing surfaces says card processing is extra, in the SAME
// sentence. docs/VALUE-LADDER.md §2: "We never describe a rate as '0%' without the words 'plus card
// processing' nearby in the same view." The claim and its caveat travel together or not at all.
//
//   node scripts/probes/launch-0-4-fees.mjs
//
// It reads every user-facing string in scope with the TypeScript parser (string literals, template
// literals, JSX text), so a comment that says "0%" is never a claim and a claim split across a template
// interpolation is still one string. An interpolated `${PLAN_STORY.plusProcessing}` or
// `${PLAN_STORY.afterProcessing}` (lib/pricing/plan-story.ts) counts as the caveat, because that is
// where the words live. A bare figure ("0%" as a stat value) is checked with the sibling strings of its
// object, which is where its label sits.
//
// Scope is LIVE-913's lane: /pricing, lib/pricing, the page-editor templates (except home, about,
// what-is-frequency and tools-for-community-builders, which other Phase 0 rows own) and llms-full.txt.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const ts = createRequire(import.meta.url)('typescript')

const OTHER_LANES = new Set(['home.ts', 'about.ts', 'what-is-frequency.ts', 'tools-for-community-builders.ts'])

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
const isSource = (p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)

const FILES = [
  ...walk('app/(marketing)/pricing').filter(isSource),
  ...walk('lib/pricing').filter(isSource),
  ...walk('lib/page-editor/templates').filter(isSource).filter((p) => !OTHER_LANES.has(p.split('/').pop())),
  'app/llms-full.txt/route.ts',
]

/** A money claim that needs the caveat. Not preceded by a digit or a point, so "10%" and "50%" are
 *  never read as "0%". */
const CLAIM = /(?<![\d.])(?:0|100) ?%|\bno (?:platform )?fees?\b|\bkeep (?:everything|it all|all of it)\b|\bzero fees?\b|\bfee-free\b/i
// The interpolation marker is a NUL, never a typed `${`: a plain quoted string that merely CONTAINS the
// characters "${PLAN_STORY.plusProcessing}" renders them literally, and must not pass.
const CAVEAT = /card processing|\u0000\{PLAN_STORY\.(?:plus|after)Processing\}/i
const BARE_FIGURE = /^\s*(?:0|100) ?%\s*$/

/** Strings that carry a percent and are not a claim to a reader. Each one names why. */
const NOT_A_CLAIM = [
  // formatBps's own return value for a zero rate: a formatter, not a sentence. Every caller that
  // shows it to a reader is held by this probe at the call site.
  { file: 'lib/pricing/display.ts', text: '0%' },
]

/** The text of a string-ish node, with each interpolation kept as `${source}` so a caveat read from
 *  PLAN_STORY is visible to CAVEAT. The marker is NUL so a typed `${` in a quoted string never counts. */
function textOf(node, sf) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    let out = node.head.text
    for (const span of node.templateSpans) out += '\u0000{' + span.expression.getText(sf).replaceAll('${PLAN_STORY.', '\u0000{PLAN_STORY.') + '}' + span.literal.text
    return out
  }
  if (ts.isJsxText(node)) return node.getText(sf).replace(/\s+/g, ' ')
  return null
}

/** Sibling string values of a bare figure: the other strings in its object literal. */
function siblingText(node, sf) {
  let obj = node.parent
  while (obj && !ts.isObjectLiteralExpression(obj)) {
    if (ts.isSourceFile(obj)) return ''
    obj = obj.parent
  }
  if (!obj) return ''
  return obj.properties
    .map((p) => (ts.isPropertyAssignment(p) ? textOf(p.initializer, sf) : null))
    .filter(Boolean)
    .join(' ')
}

/** Every claim in `source` that lacks the caveat in its own sentence. PURE over its input. */
export function offenders(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out = []
  const visit = (node) => {
    // A template expression is read whole; its spans are not separate strings.
    const text = textOf(node, sf)
    if (text != null) {
      if (NOT_A_CLAIM.some((n) => file.endsWith(n.file) && n.text === text)) return
      if (BARE_FIGURE.test(text)) {
        if (!CAVEAT.test(siblingText(node, sf))) out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text })
        return
      }
      for (const sentence of text.split(/(?<=[.!?])\s+/)) {
        if (CLAIM.test(sentence) && !CAVEAT.test(sentence)) {
          out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: sentence.trim() })
        }
      }
      if (ts.isTemplateExpression(node)) {
        // Still descend into the interpolated expressions: a nested literal is its own string.
        node.templateSpans.forEach((s) => visit(s.expression))
      }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

// ── Mutation check: the scanner fires on a planted claim and passes its fixed twin ──────────────────
{
  const planted = [
    "const a = 'You keep 100% of your own bookings, always.'",
    'const b = `0% on your own people, ${rate} once per introduced customer`',
    "const c = { value: '0%', label: 'On your own bookings' }",
    "const d = <p>Tips work on both, with no fee.</p>",
    "const f = 'You keep 100% of it, ${PLAN_STORY.afterProcessing}.'",
    "// You keep 100% of a comment, which is not a claim.",
    "const e = 'Opacity 50% and 10% are not claims.'",
  ].join('\n')
  assert.deepEqual(offenders('planted.tsx', planted).map((o) => o.line), [1, 2, 3, 4, 5], 'the probe must catch every planted claim')
  const fixed = [
    "const a = 'You keep 100% of your own bookings, after card processing, always.'",
    'const b = `0% on your own people, ${PLAN_STORY.plusProcessing}, ${rate} once`',
    "const c = { value: '0%', label: 'On your own bookings, plus card processing' }",
    "const d = <p>Tips work on both, with no platform fee, only card processing.</p>",
  ].join('\n')
  assert.deepEqual(offenders('fixed.tsx', fixed), [], 'the probe must pass a claim that carries its caveat')
}

// ── The real scope ──────────────────────────────────────────────────────────────────────────────────
assert.ok(FILES.length > 20, `scope collapsed to ${FILES.length} files; the walk is broken`)
const found = FILES.flatMap((f) => offenders(f, readFileSync(f, 'utf8')))
if (found.length > 0) {
  for (const o of found) console.error(`${o.file}:${o.line}  ${o.text.replace(/\u0000/g, '$')}`)
  console.error(`\n${found.length} money claim(s) without "card processing" in the same sentence (LIVE-913).`)
  process.exit(1)
}

// The fragments the caveat is read from exist, so `${PLAN_STORY.plusProcessing}` never renders "undefined".
const story = readFileSync('lib/pricing/plan-story.ts', 'utf8')
assert.match(story, /plusProcessing: 'plus card processing'/)
assert.match(story, /afterProcessing: 'after card processing'/)

console.log(`ok: every 0%, 100% and no-fee claim in ${FILES.length} files says card processing is extra`)
