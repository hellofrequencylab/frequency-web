#!/usr/bin/env node
// LABEL CONTRACT — every <label> in the app names exactly one control, and no <label> nests.
//
// WHY THIS EXISTS. `components/ui/field.tsx` exports a `Label` that renders a bare
// `<label className={labelClasses}>`. It mints no `id` and threads no `htmlFor`, so the shape
//
//     <div className="space-y-1">
//       <Label>Board name</Label>
//       <Input value={n} onChange={…} />
//     </div>
//
// renders a <label> pointing at nothing and an <input> with no accessible name. It LOOKS
// labelled in review and in a screenshot; a screen reader announces "edit text, blank", and
// clicking the text does not focus the field. 14 controls shipped that way (ADR-966).
//
// The second failure was worse and equally invisible: `app/(main)/events/drafts/[id]/editor.tsx`
// wrapped each `<Label>` in a native `<label>`, so a <label> contained a <label>. That is
// forbidden by the HTML content model, and browsers recover from it inconsistently, which means
// the bug's symptom depends on the browser rather than on the markup.
//
// WHAT IT ENFORCES, over app/ + components/:
//
//   1. NO NESTED LABELS. A <label> or <Label> inside another is invalid HTML, full stop.
//   2. EVERY LABEL NAMES A CONTROL. A <label>/<Label> must either carry `htmlFor` (explicit
//      association) or contain a labelable control (implicit association, which is what the
//      `Field` primitive does). Neither one means it names nothing.
//
// THE FIX WHEN THIS FAILS is always one of three, and the gate prints them:
//   · one control      -> `<Field label="…">` (components/ui/field.tsx) — wraps, so no id to mint
//   · several controls -> `<p className={labelClasses} id="x">` + `role="group" aria-labelledby="x"`
//   · no control       -> `<p className={labelClasses}>`. A caption over a read-only preview or a
//                         list of already-labelled rows is a heading, not a label.
//
// WHAT IT CANNOT SEE, so green here is not "every control is named":
//   · A control named by a bare <span> sibling — there is no <label> to find. That class was swept
//     by hand in `qr-splash-form.tsx`; the axe pass in the e2e run is what catches the rest.
//   · Whether an `htmlFor` target exists. All 125 were verified by hand on 2026-08-10; a static
//     cross-file id check is future work, and `aria-labelledby` ids are checked below.
//   · Whether the label TEXT is any good. That is docs/CONTENT-VOICE.md's job.
//
// Usage: `node scripts/check-labels.mjs` (or `pnpm check:labels`). Exits 1 on violation.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['app', 'components']

/** Controls a <label> can name. `Checkbox`/`Switch`/`RadioGroup` render their own label, but they
 *  do wrap a labelable input, so a <label> around one is still associated. */
const LABELABLE =
  /<(?:input|textarea|select|Input|Textarea|Select|Checkbox|Switch|SearchInput|TagInput|DatePicker)\b/

/** A repo this size never legitimately drops to a handful of components. */
const MIN_FILES = 500
/** Nor to a handful of labels. A parser that stops finding tags must fail loudly, not pass. */
const MIN_LABELS = 200

/** Blank JSX/JS comments, preserving length so every offset stays put. */
export function stripComments(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)))
}

/**
 * Find every <label>/<Label> element and report the two violations.
 *
 * Returns `{ violations, labels }` — `labels` is the count of opening tags seen, which the caller
 * ratchets against MIN_LABELS. A silent parse failure would otherwise read as a clean repo.
 */
export function auditLabels(src) {
  const code = stripComments(src)
  const violations = []
  const stack = []
  let labels = 0

  // `<Label>` is only THIS repo's field primitive when the file imports it from there. Several
  // files define a LOCAL `Label` that renders an SVG `<text>` — the onboarding illustration
  // renders and the on-air stage overlays draw 60 of them — and an SVG caption has no control to
  // name by construction. Counting those would have made the gate 60 false positives deep on day
  // one, which is how a gate gets an allowlist and then gets ignored.
  const usesFieldLabel = /import\s*\{[^}]*\bLabel\b[^}]*\}\s*from\s*'@\/components\/ui\/field'/.test(code)

  // `[^>]*` cannot span a `>` inside an attribute expression. On a <label> that is vanishingly
  // rare (they carry className / htmlFor, not arrow functions), and MIN_LABELS is the backstop
  // if a future pattern breaks it.
  for (const m of code.matchAll(/<(\/?)(Label|label)\b([^>]*?)(\/?)>/g)) {
    const [full, closing, tag, attrs, selfClosing] = m
    if (tag === 'Label' && !usesFieldLabel) continue
    const line = code.slice(0, m.index).split('\n').length

    if (closing) {
      const open = stack.pop()
      if (open) open.end = m.index
      if (open && !open.reported) {
        const inner = code.slice(open.contentStart, m.index)
        if (!open.hasFor && !LABELABLE.test(inner) && !/\{\s*children\s*\}/.test(inner)) {
          violations.push({
            line: open.line,
            rule: 'names nothing',
            snippet: open.snippet,
            tag: open.tag,
          })
        }
      }
      continue
    }

    labels++
    // A spread may carry `htmlFor` (that is exactly how `Label` in components/ui/field.tsx passes
    // it through), so a spread tag is unknowable from here. Unknowable is not a violation.
    const hasFor = /\bhtmlFor\s*=/.test(attrs) || /\bfor\s*=/.test(attrs) || /\{\s*\.\.\./.test(attrs)
    const snippet = full.replace(/\s+/g, ' ').slice(0, 100)

    if (stack.length > 0) {
      violations.push({ line, rule: 'nested inside another label', snippet, tag })
      // Reported once; do not also fault it for naming nothing.
      if (!selfClosing) stack.push({ line, tag, hasFor, snippet, contentStart: m.index + full.length, reported: true })
      continue
    }

    if (selfClosing) {
      if (!hasFor) violations.push({ line, rule: 'names nothing', snippet, tag })
      continue
    }
    stack.push({ line, tag, hasFor, snippet, contentStart: m.index + full.length, reported: false })
  }

  return { violations, labels }
}

/** Every `aria-labelledby="x"` must have an `id="x"` in the same file. The group pattern this gate
 *  steers people toward is only correct if the two halves actually match, and a typo there is
 *  silent: the element simply has no name again. */
export function auditLabelledBy(src) {
  const code = stripComments(src)
  const ids = new Set()
  for (const m of code.matchAll(/\bid=(?:"([^"]+)"|\{`([^`$]+)`\})/g)) ids.add(m[1] ?? m[2])
  const out = []
  for (const m of code.matchAll(/\baria-labelledby=(?:"([^"]+)"|\{`([^`$]+)`\})/g)) {
    const ref = m[1] ?? m[2]
    for (const token of ref.split(/\s+/).filter(Boolean)) {
      if (ids.has(token)) continue
      out.push({ line: code.slice(0, m.index).split('\n').length, ref: token })
    }
  }
  return out
}

function tsxFiles(dir) {
  const out = []
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    let s
    try { s = statSync(p) } catch { continue }
    if (s.isDirectory()) out.push(...tsxFiles(p))
    else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) out.push(p)
  }
  return out
}

function main() {
  const files = ROOTS.flatMap(tsxFiles)
  if (files.length < MIN_FILES) {
    console.error(`✗ check:labels — found ${files.length} .tsx file(s) under ${ROOTS.join(' + ')}, expected at least ${MIN_FILES}.`)
    console.error('    Run from the repo root. A gate cannot pass over nothing.')
    process.exit(1)
  }

  let failures = 0
  let labels = 0
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const res = auditLabels(src)
    labels += res.labels
    for (const v of res.violations) {
      failures++
      console.error(`✗ ${file}:${v.line}  <${v.tag}> ${v.rule}`)
      console.error(`    ${v.snippet}`)
    }
    for (const v of auditLabelledBy(src)) {
      failures++
      console.error(`✗ ${file}:${v.line}  aria-labelledby="${v.ref}" has no matching id in this file`)
    }
  }

  if (labels < MIN_LABELS) {
    console.error(`✗ check:labels — parsed only ${labels} label(s), expected at least ${MIN_LABELS}.`)
    console.error('    The tag scanner has stopped matching. Fix the parser; do not lower the floor.')
    process.exit(1)
  }

  if (failures > 0) {
    console.error(`\n✖ Label contract: ${failures} violation(s) across ${labels} label(s).\n`)
    console.error('  A <label> must name exactly ONE control, and must never nest. Pick one:')
    console.error('    one control      <Field label="Name">{control}</Field>        (components/ui/field.tsx)')
    console.error('    several controls <p className={labelClasses} id="x">Name</p>')
    console.error('                     + role="group" aria-labelledby="x" on the wrapper')
    console.error('    no control       <p className={labelClasses}>Name</p>         (it is a heading, not a label)')
    console.error('\n  See ADR-966 and components/ui/field.tsx.')
    process.exit(1)
  }

  console.log(`✓ Label contract: ${labels} label(s) across ${files.length} file(s), every one naming exactly one control, none nested.`)
}

if (process.argv[1] && process.argv[1].endsWith('check-labels.mjs')) main()
