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
//   3. AN `htmlFor` MUST RESOLVE. Rule 2 accepts the PRESENCE of the attribute, which is shape,
//      not truth: `<Label htmlFor="event-scop">` beside `<Select id="event-scope" />` renders a
//      label naming nothing, exactly like the bare label rule 2 was built to catch, and it passes
//      rule 2 on the strength of a typo. Every string-literal and template-literal `htmlFor` must
//      match an `id` in the same file. (Added 2026-08-17, ADR-1057 — until then this file said
//      "All 125 were verified by hand on 2026-08-10; a static cross-file id check is future
//      work". A hand-verified population is a population that is correct on one date.)
//   4. THE TARGET MUST BE ABLE TO BE A CONTROL. An id that sits only on a <div>/<p>/<button> is
//      not labelable, so the association is void even though both halves exist. Only PLAIN
//      lowercase elements are judged: a capitalised component may forward `id` to a real control
//      (`PillarSelect` -> `<Select id={id}>` does exactly that), and unknowable is not a violation.
//
// THE FIX WHEN RULE 1 OR 2 FAILS is always one of three, and the gate prints them:
//   · one control      -> `<Field label="…">` (components/ui/field.tsx) — wraps, so no id to mint
//   · several controls -> `<p className={labelClasses} id="x">` + `role="group" aria-labelledby="x"`
//   · no control       -> `<p className={labelClasses}>`. A caption over a read-only preview or a
//                         list of already-labelled rows is a heading, not a label.
//
// WHAT IT CANNOT SEE, so green here is not "every control is named":
//   · A control named by a bare <span> sibling — there is no <label> to find. ✅ THAT HALF IS NOW
//     GATED, next door: `pnpm check:a11y-names` (scripts/check-a11y-names.mjs, ADR-1069) asks the
//     honest question — "does this CONTROL have an accessible name" — and it can resolve the
//     label-WRAPPING components (`Field`, `StudioField`, `Labeled`) that this comment said were the
//     blocker. It runs at ZERO with no allowlist. The gap between the two questions was real: it
//     found 17 unnamed controls in 14 files while this gate read clean, four of them exactly the
//     bare-<span> shape named here. The rest of THIS comment's warning still stands, though — see
//     that file's own "what it still cannot see", and the axe pass in the e2e run remains the gate
//     on the rendered tree.
//   · An `htmlFor` whose value is a bare identifier or a computed expression — it is usually a
//     prop threaded in by a wrapper (`<label htmlFor={htmlFor}>`), so the target lives in the
//     CALLER. Unknowable is not a violation; rules 3 and 4 skip those two shapes deliberately.
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
/** Nor to a handful of DECIDED `htmlFor`s. Rules 3–4 only judge literal and template-literal
 *  values; if a parser change quietly reclassified those as unknowable, every one of them would
 *  be skipped and the gate would print ✓ over an unchecked repo — the same missing-instrument
 *  failure that MIN_LABELS exists for, one rule down. 306 were judged on 2026-08-17. */
const MIN_RESOLVED = 250

/** Elements a `for`/`htmlFor` can legally name. Anything else lowercase — a <div>, a <p>, a
 *  <button> — is not labelable, so pointing a label at its id names nothing. */
const LABELABLE_ELEMENTS = new Set(['input', 'textarea', 'select', 'meter', 'output', 'progress'])

/**
 * The LOCAL names bound to the field primitive's `Label` in this file.
 *
 * The first version of this test was `/from '@\/components\/ui\/field'/` with hard single quotes
 * and a literal `Label`, which means BOTH of these files were skipped in full — every `<Label>` in
 * them invisible to rules 1–4:
 *
 *     import { Label } from "@/components/ui/field"          // double quotes
 *     import { Label as FieldLabel } from '@/components/ui/field'   // renamed
 *
 * A gate you step around by changing quote style is not a gate; the admin-client ratchet learned
 * the same lesson from `await import(...)` (see scripts/check-admin-client.mjs). Returns an empty
 * set when the file does not import it, which is what keeps the 60 SVG-caption `Label`s in the
 * onboarding renders and the on-air stage out of the count.
 */
export function fieldLabelNames(code) {
  const names = new Set()
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]@\/components\/ui\/field['"]/g)) {
    for (const spec of m[1].split(',')) {
      const parts = spec.trim().split(/\s+as\s+/)
      if (parts[0].trim() === 'Label') names.add((parts[1] ?? parts[0]).trim())
    }
  }
  return names
}

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
  const imported = fieldLabelNames(code)

  // `[^>]*` cannot span a `>` inside an attribute expression. On a <label> that is vanishingly
  // rare (they carry className / htmlFor, not arrow functions), and MIN_LABELS is the backstop
  // if a future pattern breaks it.
  const tagNames = ['label', 'Label', ...imported].filter((n, i, a) => a.indexOf(n) === i)
  const tagRe = new RegExp(`<(/?)(${tagNames.join('|')})\\b([^>]*?)(/?)>`, 'g')
  for (const m of code.matchAll(tagRe)) {
    const [full, closing, tag, attrs, selfClosing] = m
    if (tag !== 'label' && !imported.has(tag)) continue
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

// ---------------------------------------------------------------------------------------------
// Rules 3 + 4 — does the `htmlFor` actually reach a control?
// ---------------------------------------------------------------------------------------------

/**
 * Read a JSX attribute value starting at `i` (the character after the `=`).
 * Returns `{ raw, kind }` where kind is:
 *   lit    "a string"          — comparable by value
 *   tpl    {`a-${b}`}          — comparable by SOURCE TEXT, which is what makes a useId() pair
 *                                like htmlFor={`${uid}-name`} / id={`${uid}-name`} checkable
 *   ident  {someProp}          — unknowable: usually a prop threaded in from the caller
 *   expr   {cond ? a : b}      — unknowable
 * Brace-aware, so an arrow function or a nested object in an attribute cannot end the value early.
 */
export function readAttrValue(src, i) {
  const c = src[i]
  if (c === '"' || c === "'") {
    const end = src.indexOf(c, i + 1)
    if (end === -1) return null
    return { raw: src.slice(i + 1, end), kind: 'lit' }
  }
  if (c !== '{') return null
  let depth = 0
  let j = i
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++
    else if (src[j] === '}') { depth--; if (depth === 0) break }
  }
  const raw = src.slice(i + 1, j)
  const trimmed = raw.trim()
  const kind = trimmed.startsWith('`') ? 'tpl' : /^[A-Za-z_$][\w$]*$/.test(trimmed) ? 'ident' : 'expr'
  return { raw, kind }
}

/** Every opening tag in the source, with its attribute text. Brace- and quote-aware, so a `>`
 *  inside `onChange={(e) => …}` or inside a className string does not close the tag early —
 *  the `[^>]*` shortcut rules 1–2 can afford is not safe here, because THIS scan reads the
 *  attributes of every element in the file, not just of <label>s. */
export function openingTags(code) {
  const out = []
  for (const m of code.matchAll(/<([A-Za-z][\w.]*)/g)) {
    let j = m.index + m[0].length
    let depth = 0
    for (; j < code.length; j++) {
      const c = code[j]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '"' || c === "'") { const e = code.indexOf(c, j + 1); if (e !== -1) j = e }
      else if (c === '>' && depth === 0) break
    }
    out.push({ tag: m[1], start: m.index, attrs: code.slice(m.index + m[0].length, j) })
  }
  return out
}

const normalise = (s) => s.replace(/\s+/g, '')

/**
 * Rules 3 + 4. Returns `{ violations: [{ line, rule, ref }], judged }` — `judged` is how many
 * `htmlFor`s this scan was ABLE to decide, which the caller ratchets against MIN_RESOLVED so a
 * parser that quietly stops deciding anything fails loudly instead of reporting a clean repo.
 *
 * Only literal and template-literal `htmlFor` values are judged. A bare identifier or a computed
 * expression is a prop passthrough (two in the repo: `connections/new/creator.tsx` and
 * `page-editor/mobile/field-form.tsx` both render `<label htmlFor={htmlFor}>`), and the target
 * lives in the caller — flagging those would be the false-positive class that kills a gate.
 */
export function auditForTargets(src) {
  const code = stripComments(src)
  const tags = openingTags(code)

  // id value -> the tags carrying it. A value may appear more than once across branches.
  const owners = new Map()
  for (const t of tags) {
    const m = t.attrs.match(/\bid=/)
    if (!m) continue
    const v = readAttrValue(t.attrs, m.index + m[0].length)
    if (!v) continue
    const key = normalise(v.raw)
    if (!owners.has(key)) owners.set(key, [])
    owners.get(key).push(t.tag)
  }

  const labelNames = new Set(['label', ...fieldLabelNames(code)])
  const violations = []
  let judged = 0
  for (const t of tags) {
    if (!labelNames.has(t.tag)) continue
    const m = t.attrs.match(/\b(?:htmlFor|for)=/)
    if (!m) continue
    const v = readAttrValue(t.attrs, m.index + m[0].length)
    if (!v || (v.kind !== 'lit' && v.kind !== 'tpl')) continue
    judged++
    const line = code.slice(0, t.start).split('\n').length
    const key = normalise(v.raw)
    const carriers = owners.get(key)
    if (!carriers) {
      violations.push({ line, rule: 'htmlFor names an id that exists nowhere in this file', ref: v.raw })
      continue
    }
    // A capitalised carrier may forward `id` to a real control, so it is unknowable, not wrong.
    const judgeable = carriers.every((tag) => /^[a-z]/.test(tag))
    if (judgeable && !carriers.some((tag) => LABELABLE_ELEMENTS.has(tag))) {
      violations.push({
        line,
        rule: `htmlFor names <${[...new Set(carriers)].join('>/<')}>, which cannot be labelled`,
        ref: v.raw,
      })
    }
  }
  return { violations, judged }
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
  let resolved = 0
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
    const targets = auditForTargets(src)
    resolved += targets.judged
    for (const v of targets.violations) {
      failures++
      console.error(`✗ ${file}:${v.line}  ${v.rule}`)
      console.error(`    htmlFor = ${v.ref}`)
    }
  }

  if (labels < MIN_LABELS) {
    console.error(`✗ check:labels — parsed only ${labels} label(s), expected at least ${MIN_LABELS}.`)
    console.error('    The tag scanner has stopped matching. Fix the parser; do not lower the floor.')
    process.exit(1)
  }

  if (resolved < MIN_RESOLVED) {
    console.error(`✗ check:labels — decided only ${resolved} htmlFor target(s), expected at least ${MIN_RESOLVED}.`)
    console.error('    Rules 3-4 have stopped judging. Fix the parser; do not lower the floor.')
    process.exit(1)
  }

  if (failures > 0) {
    console.error(`\n✖ Label contract: ${failures} violation(s) across ${labels} label(s).\n`)
    console.error('  A <label> must name exactly ONE control, and must never nest. Pick one:')
    console.error('    one control      <Field label="Name">{control}</Field>        (components/ui/field.tsx)')
    console.error('    several controls <p className={labelClasses} id="x">Name</p>')
    console.error('                     + role="group" aria-labelledby="x" on the wrapper')
    console.error('    no control       <p className={labelClasses}>Name</p>         (it is a heading, not a label)')
    console.error('\n  An htmlFor that reaches nothing is the SAME defect wearing an attribute. Point it at the')
    console.error('  id of a real <input>/<textarea>/<select> in this file, or drop it and wrap with <Field>.')
    console.error('\n  See ADR-966, ADR-1057 and components/ui/field.tsx.')
    process.exit(1)
  }

  console.log(
    `✓ Label contract: ${labels} label(s) across ${files.length} file(s), every one naming exactly one control, ` +
      `none nested; ${resolved} htmlFor target(s) reach a labelable element.`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('check-labels.mjs')) main()
