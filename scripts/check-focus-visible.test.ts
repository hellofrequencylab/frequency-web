import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { stripComments } from '@/test/source-shape'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FOCUS-VISIBLE GATE (HYG-065 · Lift 3c · a11y · ADR-1250). A SOURCE-reading test, not a
// build gate.
//
// Every control a keyboard can reach must paint a focus ring when it gets there (WCAG 2.4.7).
// This repo's ring is ONE unlayered rule in app/globals.css, and it is a `box-shadow`:
//
//   :where(button, a, select, summary, [tabindex]:not([tabindex="-1"]), …):focus-visible
//     { outline: none; box-shadow: 0 0 0 3px var(--color-focus-ring); }
//
// So the words in a className are NOT the thing to measure. `outline-none` on a <button> drops
// nothing: the rule above already sets `outline: none` and paints the ring as a shadow. The census
// this gate was written from (2026-09-07) found 110 `outline-none` sites, 0 `outline-0`, 0
// `ring-0`, and not one of them lost its ring by saying `outline-none`. The ring was lost two
// other ways, at 109 sites, and neither contains the word:
//
//   1. 🔴 A LIFT BEATS EVERY RING (107 sites in 81 files). `.lift-1/2/3` set `box-shadow`
//      UNLAYERED, later in the sheet than the ring rule and at the same specificity, so they win
//      over the global ring; and a Tailwind `focus-visible:ring-2` compiles into `@layer
//      utilities`, which loses to any unlayered declaration whatever its specificity. A lifted
//      <input>, <button> or <Link> with `focus-visible:ring-2 focus-visible:ring-primary/50`
//      spelled out on it painted NOTHING on tab. The card kit had the same defect and fixed it with
//      `.ring-focus` (components/cards/card-focus-ring.test.ts): an `outline`, which a lift never
//      touches. Two sites, both in the card kit, had learned to add it; 107 had not, and nothing was going
//      to make the 108th. So the sheet now carries the card's fix BY CONSTRUCTION: one rule gives every lifted,
//      keyboard-reachable element the `.ring-focus` outline, the way the reduced-motion gate's
//      `[class*="animate-[slideUp"]` backstop made a keyframe safe without every author remembering
//      `motion-safe:`. `.ring-focus` stays for the surface that CONTAINS the focusable thing (the
//      `:has(:focus-visible)` arm), which no element-level rule can reach.
//
//   2. 🔴 NO RULE REACHED A CONTENTEDITABLE EDITOR (2 sites). Tiptap's ProseMirror surface is a
//      `contenteditable` <div>: natively focusable, no tabindex, so it matched none of the ring
//      rule's branches, and both editor slots passed `class: 'outline-none'` to it. A keyboard user
//      tabbing into an editable slot on the email or Space canvas saw nothing. The rule now lists
//      `[contenteditable]:not([contenteditable="false"])` beside `summary`, the way `summary` was
//      added on 2026-08-10, so every editor is ringed at once.
//
// WHY IT LIVES IN scripts/ AS A *.test.ts: the ARM-C precedent (ADR-1140, SCAN-506) and the
// reduced-motion gate beside it (HYG-058): a guard that reads SOURCE runs on every PR under
// `pnpm test`, which is earlier and stronger than a gate that can only run where a build exists.
//
// HOW IT DECIDES, and it measures the CONSEQUENCE rather than the presence of the words:
//   1. Parse app/globals.css brace-aware, tracking `@layer`, and read three sets OUT OF THE SHEET:
//      the selectors the unlayered `:focus-visible` box-shadow ring reaches (RINGED); the unlayered
//      classes that set a `box-shadow` of their own and so beat that ring (RING-BEATING: the
//      lifts); and the unlayered `:focus-visible` rules that set an `outline`, which a lift cannot
//      beat (RESTORING), each recorded with the classes it needs on the element and the element
//      kinds it reaches. Nothing here is a hard-coded list: delete `button` from the backstop and
//      every lifted <button> goes red; delete the backstop and 107 sites do.
//   2. Walk every JSX opening element in app/, components/ and lib/ (brace-aware through
//      `className={cn(…)}` and template literals; comments blanked first so a comment cannot pass
//      or fail a site), plus Tiptap's `editorProps.attributes.class`, which is the class of an
//      element React never sees.
//   3. An element is KEYBOARD-REACHABLE when its tag is one the ring rule names, when it carries a
//      `tabIndex` other than -1, when it is `contentEditable`, or when it is a kit component that
//      renders one of those (Link, Button, IconButton, IconLink, Input, Textarea, Select).
//   4. A reachable element FAILS when it carries a ring-beating class and no restoring rule reaches
//      it (a restoring rule reaches it when every class the rule needs is on the element and the
//      rule's reach covers the element's kind), or when it is contenteditable and neither the sheet
//      nor its own class paints a `:focus-visible` indicator. A detached class string (a
//      `const CONTROL = '…'` applied later) fails when it carries a ring-beating class and a
//      focus-ring utility with no restoring rule for the class: the utility is the author saying
//      "this is a control", and the lift made it dead CSS.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = path.join(import.meta.dirname, '..')
const GLOBALS = 'app/globals.css'
const SOURCE_DIRS = ['app', 'components', 'lib']

/** Kit components whose rendered root is one of the natively-ringed tags, and which tag that is. A
 *  `className` handed to one of these lands on that root, so a lift there beats the ring exactly as
 *  it would on the tag. `Button` renders <a> only through `asChild`, which hands the class to the
 *  child element the walker sees on its own. */
const KIT_CONTROLS: Record<string, string> = {
  Link: 'a',
  Button: 'button',
  IconButton: 'button',
  IconLink: 'a',
  Input: 'input',
  Textarea: 'textarea',
  Select: 'select',
}

// ── The stylesheet reader (pure; the controls below run it on synthetic CSS) ────────────────

type CssRule = { selector: string; body: string; layered: boolean }

const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Brace-aware walk. Descends into at-rules (so `@media` and `@layer` nesting is followed),
 *  tracks whether a rule sits inside ANY `@layer`, and never descends into `@keyframes`. */
export function parseCssRules(css: string, layered = false, out: CssRule[] = []): CssRule[] {
  let i = 0
  let start = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '{') {
      const prelude = norm(css.slice(start, i))
      let depth = 1
      let j = i + 1
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++
        else if (css[j] === '}') depth--
        j++
      }
      const body = css.slice(i + 1, j - 1)
      if (prelude.startsWith('@')) {
        if (!/^@keyframes\b/.test(prelude)) parseCssRules(body, layered || /^@layer\b/.test(prelude), out)
      } else if (prelude) {
        out.push({ selector: prelude, body, layered })
      }
      i = j
      start = j
    } else if (ch === '}' || ch === ';') {
      // `;` closes a statement at-rule (`@import …;`, `@layer a, b;`) so it never leaks into the
      // next prelude.
      i++
      start = i
    } else {
      i++
    }
  }
  return out
}

/** Does `body` set `prop` to something that paints? `none`, `0` and an empty value do not. */
const setsVisible = (body: string, prop: 'box-shadow' | 'outline') => {
  const m = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;}]*)`).exec(body)
  if (!m) return false
  const value = m[1].trim()
  return value !== '' && !/^(none|0)$/.test(value)
}

/** The comma parts of every `:where(…)` group in a selector, one array per group, paren-balanced
 *  so `:not([x="-1"])` keeps its closing bracket. */
function whereGroups(selector: string): string[][] {
  const out: string[][] = []
  let i = selector.indexOf(':where(')
  while (i !== -1) {
    let depth = 0
    let j = i + ':where'.length
    const start = j + 1
    for (; j < selector.length; j++) {
      if (selector[j] === '(') depth++
      else if (selector[j] === ')' && --depth === 0) break
    }
    out.push(selector.slice(start, j).split(',').map(norm))
    i = selector.indexOf(':where(', j)
  }
  return out
}

export type Restoring = {
  /** Classes the element must carry for the rule to match. */
  classes: string[]
  /** The element kinds the rule reaches (the parts of its tag-level `:where(…)` list), or null when
   *  it reaches whatever element carries the classes. */
  reach: string[] | null
}

export type Sheet = {
  /** Every comma part inside the unlayered `:focus-visible` box-shadow ring rules' `:where(…)`
   *  lists, e.g. `button`, `[tabindex]:not([tabindex="-1"])`. */
  ringed: string[]
  /** Unlayered plain-class selectors that set a `box-shadow` of their own (the lifts). */
  ringBeating: string[]
  /** Unlayered `:focus-visible` rules that set an `outline`, which a lift cannot beat. */
  restoring: Restoring[]
}

const isClassPart = (p: string) => /^\.[\w-]+$/.test(p)

/** A selector list split on its TOP-LEVEL commas only, so `:where(.a, .b)` stays one part. */
function splitTop(selector: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      out.push(norm(selector.slice(start, i)))
      start = i + 1
    }
  }
  out.push(norm(selector.slice(start)))
  return out.filter(Boolean)
}

export function readSheet(css: string): Sheet {
  const rules = parseCssRules(stripCssComments(css))
  const ringed = new Set<string>()
  const ringBeating = new Set<string>()
  const restoring: Restoring[] = []
  for (const r of rules) {
    if (r.layered) continue
    const isFocusVisible = /:focus-visible/.test(r.selector)
    if (isFocusVisible && setsVisible(r.body, 'box-shadow')) {
      for (const group of whereGroups(r.selector)) for (const part of group) ringed.add(part)
    }
    if (isFocusVisible && setsVisible(r.body, 'outline')) {
      for (const part of splitTop(r.selector)) {
        if (!/:focus-visible|:has\(:focus-visible\)/.test(part)) continue
        const groups = whereGroups(part)
        const classGroups = groups.filter((g) => g.every(isClassPart))
        const reachGroups = groups.filter((g) => !g.every(isClassPart))
        const reach = reachGroups.length ? reachGroups.flat() : null
        // A `:where(.a, .b)` group is an OR (one entry per class); chained groups are an AND
        // (the cartesian product); a compound `.a.b:focus-visible` is an AND of its classes.
        const alternatives = classGroups.length
          ? classGroups.reduce<string[][]>((acc, g) => acc.flatMap((a) => g.map((c) => [...a, c.slice(1)])), [[]])
          : [[...part.replace(/:where\([^]*\)/, '').matchAll(/\.([\w-]+)/g)].map((m) => m[1])]
        for (const classes of alternatives) if (classes.length) restoring.push({ classes, reach })
      }
    }
    if (!isFocusVisible && setsVisible(r.body, 'box-shadow')) {
      for (const part of splitTop(r.selector)) if (isClassPart(part)) ringBeating.add(part.slice(1))
    }
  }
  return { ringed: [...ringed], ringBeating: [...ringBeating], restoring }
}

// ── The source reader (pure) ────────────────────────────────────────────────────────────────

export type Site = {
  line: number
  /** The JSX tag, `contenteditable-editor` for a Tiptap `editorProps.attributes.class`, or
   *  `(string)` for a class string not attached to any element in this file. */
  tag: string
  /** The element's attribute text (or the detached string itself). */
  text: string
}

const QUOTES = new Set(["'", '"', '`'])

/** Index just past the string/template literal opening at `i`. Template `${…}` expressions are
 *  followed brace-aware, with nested literals skipped, so a `}` or `>` inside one never ends the
 *  enclosing tag early. */
function skipLiteral(src: string, i: number): number {
  const q = src[i]
  let j = i + 1
  while (j < src.length) {
    const c = src[j]
    if (c === '\\') {
      j += 2
      continue
    }
    if (c === q) return j + 1
    if (q === '`' && c === '$' && src[j + 1] === '{') {
      j = skipBraces(src, j + 1)
      continue
    }
    if (q !== '`' && c === '\n') return j // an unterminated quote: stop at the line end
    j++
  }
  return j
}

/** Index just past the `}` matching the `{` at `i`, skipping literals on the way. */
function skipBraces(src: string, i: number): number {
  let depth = 0
  let j = i
  while (j < src.length) {
    const c = src[j]
    if (QUOTES.has(c)) {
      j = skipLiteral(src, j)
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return j + 1
    }
    j++
  }
  return j
}

const lineAt = (src: string, at: number) => src.slice(0, at).split('\n').length

/** Every JSX opening element (tag + attribute text), every Tiptap editor class, and every string
 *  literal that carries a class of interest but sits outside any element's attributes. */
export function scanSource(raw: string, interesting: RegExp): Site[] {
  const src = stripComments(raw)
  const sites: Site[] = []
  const covered: Array<[number, number]> = []
  const tagRe = /<([A-Z][\w.]*|[a-z][\w-]*)(?=[\s/>])/g
  for (const m of src.matchAll(tagRe)) {
    const start = m.index
    if (start > 0 && /[\w$]/.test(src[start - 1])) continue // `a<b`, never a tag
    let j = start + m[0].length
    while (j < src.length) {
      const c = src[j]
      if (QUOTES.has(c)) j = skipLiteral(src, j)
      else if (c === '{') j = skipBraces(src, j)
      else if (c === '>') break
      else j++
    }
    const text = src.slice(start + m[0].length, j)
    if (!/\b(className|class|tabIndex|contentEditable)\s*=/.test(text)) continue
    covered.push([start, j])
    sites.push({ line: lineAt(src, start), tag: m[1], text })
  }
  for (const m of src.matchAll(/editorProps\s*:\s*\{/g)) {
    const end = skipBraces(src, m.index + m[0].length - 1)
    const block = src.slice(m.index, end)
    const cls = /attributes\s*:\s*\{[^}]*\bclass\s*:\s*(['"`])([^'"`]*)\1/.exec(block)
    if (cls) sites.push({ line: lineAt(src, m.index), tag: 'contenteditable-editor', text: cls[2] })
  }
  // Detached strings: literals outside every element's attribute span.
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (!QUOTES.has(c)) {
      i++
      continue
    }
    const end = skipLiteral(src, i)
    const inside = covered.some(([a, b]) => i >= a && i <= b)
    const text = src.slice(i + 1, end - 1)
    if (!inside && interesting.test(text)) sites.push({ line: lineAt(src, i), tag: '(string)', text })
    i = end
  }
  return sites
}

// ── The verdict ─────────────────────────────────────────────────────────────────────────────

export type Verdict = { line: number; tag: string; ok: boolean; reason: string }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasClass = (text: string, name: string) => new RegExp(`(^|[\\s'"\`])${escapeRe(name)}(?=[\\s'"\`]|$)`).test(text)
export const classRe = (names: string[]) =>
  names.length ? new RegExp(`(^|[\\s'"\`])(${names.map(escapeRe).join('|')})(?=[\\s'"\`]|$)`) : /$^/

/** A Tailwind focus utility that paints a box-shadow ring: dead the moment a lift is present. */
const SHADOW_FOCUS_UTILITY = /(^|[\s'"`])(focus|focus-visible|focus-within):(ring(-\d|-\[|-[a-z])|shadow-(?!none))/
/** Any own `:focus-visible` indicator, box-shadow or not. */
const OWN_FOCUS_VISIBLE = /(^|[\s'"`])focus-visible:(ring(-\d|-\[|-[a-z])|outline-(?!none)|shadow-(?!none)|border-|bg-)/

type Reach = { kind: 'native' | 'tabindex' | 'editable' | 'kit'; tag: string }

function reachability(site: Site, sheet: Sheet): Reach | null {
  if (site.tag === 'contenteditable-editor' || /\bcontentEditable(?!\s*=\s*\{?\s*false)/.test(site.text)) {
    return { kind: 'editable', tag: site.tag }
  }
  const tab = /\btabIndex\s*=\s*\{?\s*(-?\d+)/.exec(site.text)
  if (tab) return tab[1] === '-1' ? null : { kind: 'tabindex', tag: site.tag }
  if (/\btabIndex\s*=/.test(site.text)) return { kind: 'tabindex', tag: site.tag } // a variable: assume reachable
  if (sheet.ringed.some((sel) => /^[a-z][\w-]*$/.test(sel) && sel === site.tag)) return { kind: 'native', tag: site.tag }
  if (site.tag in KIT_CONTROLS) return { kind: 'kit', tag: KIT_CONTROLS[site.tag] }
  return null
}

/** Does a restoring rule's reach list cover this element? */
function covers(reach: string[], r: Reach): boolean {
  if (r.kind === 'tabindex') return reach.some((p) => p.startsWith('[tabindex]'))
  if (r.kind === 'editable') return reach.some((p) => p.startsWith('[contenteditable]'))
  return reach.includes(r.tag)
}

function restoredBy(text: string, r: Reach | null, sheet: Sheet): boolean {
  return sheet.restoring.some(
    (rule) => rule.classes.every((c) => hasClass(text, c)) && (rule.reach === null || (r !== null && covers(rule.reach, r))),
  )
}

export function auditFocusVisible(sites: Site[], sheet: Sheet): Verdict[] {
  const beats = classRe(sheet.ringBeating)
  const editorsRinged = sheet.ringed.some((sel) => /^\[contenteditable\]/.test(sel))
  const restoringNames = [...new Set(sheet.restoring.flatMap((r) => r.classes))]
  const out: Verdict[] = []
  for (const site of sites) {
    const beaten = beats.exec(site.text)
    if (site.tag === '(string)') {
      // A detached string names no element, so a restoring rule counts if its classes are all
      // present, whatever its reach.
      const restored = sheet.restoring.some((rule) => rule.classes.every((c) => hasClass(site.text, c)))
      if (beaten && !restored && SHADOW_FOCUS_UTILITY.test(site.text)) {
        out.push({
          line: site.line,
          tag: site.tag,
          ok: false,
          reason: `a shared control string carries \`${beaten[2]}\` and a focus ring utility; the lift's unlayered box-shadow beats that ring, so it never paints, and no unlayered :focus-visible outline rule in app/globals.css reaches \`${beaten[2]}\`. Restore it with one of: ${restoringNames.join(', ') || '(none defined)'}.`,
        })
      }
      continue
    }
    const reach = reachability(site, sheet)
    if (!reach) continue
    if (reach.kind === 'editable' && !editorsRinged && !OWN_FOCUS_VISIBLE.test(site.text)) {
      out.push({
        line: site.line,
        tag: site.tag,
        ok: false,
        reason:
          'a contenteditable surface is keyboard-focusable but no `:focus-visible` rule reaches it: the global ring in app/globals.css does not list `[contenteditable]` and the element paints no ring of its own',
      })
      continue
    }
    if (beaten && !restoredBy(site.text, reach, sheet)) {
      out.push({
        line: site.line,
        tag: site.tag,
        ok: false,
        reason: `<${site.tag}> is keyboard-reachable (${reach.kind}) and carries \`${beaten[2]}\`, whose unlayered box-shadow beats the global focus ring and any \`focus-visible:ring-*\` utility, and no unlayered :focus-visible outline rule in app/globals.css reaches a lifted <${reach.tag}>. Restore it with one of: ${restoringNames.join(', ') || '(none defined)'}.`,
      })
      continue
    }
    out.push({ line: site.line, tag: site.tag, ok: true, reason: reach.kind })
  }
  return out
}

// ── The walk ────────────────────────────────────────────────────────────────────────────────

export function sourceFiles(root: string, dirs = SOURCE_DIRS): string[] {
  const out: string[] = []
  // Dirents, not a stat per entry: one filesystem ask per directory (HYG-041, walker-dirents.mjs).
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p)
    }
  }
  for (const d of dirs) walk(path.join(root, d))
  return out.sort()
}

const interestingFor = (sheet: Sheet) => classRe([...sheet.ringBeating, ...sheet.restoring.flatMap((r) => r.classes)])

export function auditTree(root: string, sheet: Sheet) {
  const interesting = interestingFor(sheet)
  const failures: string[] = []
  let elements = 0
  let reachable = 0
  let lifted = 0
  for (const file of sourceFiles(root)) {
    const sites = scanSource(readFileSync(file, 'utf8'), interesting)
    elements += sites.filter((s) => s.tag !== '(string)').length
    for (const v of auditFocusVisible(sites, sheet)) {
      if (v.ok) {
        reachable++
        const site = sites.find((s) => s.line === v.line && s.tag === v.tag)
        if (site && classRe(sheet.ringBeating).test(site.text)) lifted++
      } else failures.push(`${path.relative(root, file)}:${v.line} <${v.tag}>: ${v.reason}`)
    }
  }
  return { elements, reachable, lifted, failures }
}

// ── The gate ────────────────────────────────────────────────────────────────────────────────

const css = readFileSync(path.join(ROOT, GLOBALS), 'utf8')
const sheet = readSheet(css)

describe('focus-visible: every keyboard-reachable control paints a ring that survives the cascade', () => {
  it('the sheet reader is actually reading the ring, the lifts and the restoration out of globals.css', () => {
    // The check-admin-client lesson: a guard whose walk silently finds nothing reports success.
    expect(sheet.ringed).toEqual(
      expect.arrayContaining(['button', 'a', 'select', 'summary', 'input', 'textarea', '[tabindex]:not([tabindex="-1"])']),
    )
    expect(sheet.ringed.some((s) => /^\[contenteditable\]/.test(s))).toBe(true)
    expect(sheet.ringBeating).toEqual(expect.arrayContaining(['lift-1', 'lift-2', 'lift-3']))
    // The card's explicit class, and the by-construction backstop for every lifted control.
    expect(sheet.restoring).toContainEqual({ classes: ['ring-focus'], reach: null })
    for (const lift of ['lift-1', 'lift-2', 'lift-3']) {
      const backstop = sheet.restoring.find((r) => r.classes.length === 1 && r.classes[0] === lift)
      expect(backstop, `no unlayered :focus-visible outline rule restores the ring for .${lift}`).toBeDefined()
      expect(backstop!.reach).toEqual(expect.arrayContaining(['button', 'a', 'select', 'summary', 'input', 'textarea']))
      expect(backstop!.reach!.some((p) => p.startsWith('[tabindex]'))).toBe(true)
      expect(backstop!.reach!.some((p) => p.startsWith('[contenteditable]'))).toBe(true)
    }
  })

  it('the source walk is actually reading the tree', () => {
    const { elements, reachable, lifted } = auditTree(ROOT, sheet)
    // Floors sit under the live counts (2,900+ classed elements, 900+ reachable, 100+ lifted
    // controls on 2026-09-07) and far above zero.
    expect(elements).toBeGreaterThanOrEqual(2000)
    expect(reachable).toBeGreaterThanOrEqual(600)
    expect(lifted).toBeGreaterThanOrEqual(80)
  })

  it('no keyboard-reachable control loses its focus ring', () => {
    expect(auditTree(ROOT, sheet).failures).toEqual([])
  })
})

// ── Detector controls. A gate that has never been seen to FIRE is not known to work. ────────

describe('the detector fires', () => {
  const RING = ':where(button, a, [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"]))'
  const SHEET = `
    @layer theme, base, components, utilities;
    ${RING}:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--color-focus-ring);
    }
    @layer utilities { .focus-visible\\:ring-2:focus-visible { box-shadow: 0 0 0 2px red; } }
    .lift-1 { box-shadow: 0 1px 2px black; }
    .ring-focus:focus-visible, .ring-focus:has(:focus-visible) { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }
    @keyframes rise { from { box-shadow: none } to { box-shadow: 0 0 0 1px red } }
  `
  const BACKSTOP = `:where(.lift-1)${RING}:focus-visible { outline: 2px solid var(--color-focus-ring); outline-offset: 2px; }`
  const explicitOnly = readSheet(SHEET)
  const withBackstop = readSheet(SHEET + BACKSTOP)
  const interesting = /lift-1|ring-focus/

  it('reads the three sets out of the sheet, and neither a layered rule nor a keyframe step leaks in', () => {
    expect(explicitOnly).toEqual({
      ringed: ['button', 'a', '[tabindex]:not([tabindex="-1"])', '[contenteditable]:not([contenteditable="false"])'],
      ringBeating: ['lift-1'],
      restoring: [
        { classes: ['ring-focus'], reach: null },
        { classes: ['ring-focus'], reach: null },
      ],
    })
    expect(withBackstop.restoring).toContainEqual({
      classes: ['lift-1'],
      reach: ['button', 'a', '[tabindex]:not([tabindex="-1"])', '[contenteditable]:not([contenteditable="false"])'],
    })
  })

  const GOOD = `
    export function Row() {
      return (
        <a href="/x" className={cn('rounded-lg lift-1 ring-focus outline-none', open && 'bg-surface')}>
          <button type="button" className="press outline-none focus-visible:ring-2">go</button>
        </a>
      )
    }
  `

  it('positive control: a lifted link that carries ring-focus passes, and so does a plain button', () => {
    const verdicts = auditFocusVisible(scanSource(GOOD, interesting), explicitOnly)
    expect(verdicts.map((v) => [v.tag, v.ok])).toEqual([
      ['a', true],
      ['button', true],
    ])
  })

  it('mutation control: deleting ring-focus from the lifted link turns exactly that site red', () => {
    const mutated = GOOD.replace(' ring-focus', '')
    expect(mutated).not.toBe(GOOD)
    const red = auditFocusVisible(scanSource(mutated, interesting), explicitOnly).filter((v) => !v.ok)
    expect(red.map((v) => v.tag)).toEqual(['a'])
    expect(red[0].reason).toContain('lift-1')
    expect(red[0].reason).toContain('ring-focus')
  })

  it('mutation control: a focus-visible utility does NOT rescue a lifted control (it is dead CSS)', () => {
    const src = `<button className="lift-1 focus-visible:ring-2 focus-visible:ring-primary/50">x</button>`
    const [v] = auditFocusVisible(scanSource(src, interesting), explicitOnly)
    expect(v.ok).toBe(false)
  })

  it('positive control: the backstop rule restores the same lifted control with no class added', () => {
    const src = `<button className="lift-1 focus-visible:ring-2">x</button>`
    expect(auditFocusVisible(scanSource(src, interesting), withBackstop).map((v) => v.ok)).toEqual([true])
  })

  it('mutation control: dropping `button` from the backstop reach turns the lifted button red and leaves the lifted link green', () => {
    const narrowed = readSheet(SHEET + BACKSTOP.replace(':where(button, a,', ':where(a,'))
    const src = `<button className="lift-1">x</button>\n<a href="/" className="lift-1">y</a>`
    const verdicts = auditFocusVisible(scanSource(src, interesting), narrowed)
    expect(verdicts.map((v) => [v.tag, v.ok])).toEqual([
      ['button', false],
      ['a', true],
    ])
  })

  it('mutation control: a detached control string with a lift and a focus ring utility is red until a restoring rule names the lift; without the utility it is not judged', () => {
    const src = `const CONTROL = 'inline-flex lift-1 focus-visible:ring-2'\nconst CARD = 'rounded-2xl lift-1 bg-surface'`
    expect(auditFocusVisible(scanSource(src, interesting), explicitOnly).map((v) => [v.line, v.ok])).toEqual([[1, false]])
    expect(auditFocusVisible(scanSource(src, interesting), withBackstop)).toEqual([])
  })

  it('control: tabIndex -1 is not keyboard-reachable, so a lifted dialog box is never judged', () => {
    const src = `<div role="dialog" tabIndex={-1} className="lift-1 outline-none">x</div>`
    expect(auditFocusVisible(scanSource(src, interesting), explicitOnly)).toEqual([])
  })

  it('control: tabIndex 0 IS reachable, so the same box with a lift is red', () => {
    const src = `<div role="button" tabIndex={0} className="lift-1 outline-none">x</div>`
    const [v] = auditFocusVisible(scanSource(src, interesting), explicitOnly)
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('tabindex')
  })

  it('mutation control: removing [contenteditable] from the ring rule turns every Tiptap editor red', () => {
    const src = `useEditor({ editorProps: { attributes: { class: 'outline-none' } }, content: '' })`
    expect(auditFocusVisible(scanSource(src, interesting), explicitOnly).map((v) => v.ok)).toEqual([true])
    const blind = readSheet(SHEET.replace(', [contenteditable]:not([contenteditable="false"])', ''))
    const [v] = auditFocusVisible(scanSource(src, interesting), blind)
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('contenteditable')
  })

  it('control: the element walk is brace-aware, so a `>` inside a template expression never ends the tag early', () => {
    const src = '<Link href={`/x/${a > b ? "y" : "z"}`} className={`lift-1 ${open ? "a" : "b"}`}>x</Link>'
    const [site] = scanSource(src, interesting)
    expect(site.tag).toBe('Link')
    expect(site.text).toContain('lift-1')
    expect(auditFocusVisible([site], explicitOnly)[0].ok).toBe(false)
  })

  it('control: a comment cannot pass or fail a site', () => {
    const src = `// <a className="lift-1">commented out</a>\n<a className="lift-1 ring-focus">x</a> {/* lift-1 focus-visible:ring-2 */}`
    const verdicts = auditFocusVisible(scanSource(src, interesting), explicitOnly)
    expect(verdicts.map((v) => v.ok)).toEqual([true])
  })

  it('mutation control: deleting the backstop from the LIVE sheet turns the lifted controls red, and only them', () => {
    // The real stylesheet with the by-construction rule removed. Everything the rule restores goes
    // red; the two explicit `ring-focus` sites and every unlifted control stay green.
    const start = css.indexOf(':where(.lift-1, .lift-2, .lift-3)')
    expect(start).toBeGreaterThan(-1)
    const end = css.indexOf('}', start) + 1
    const mutated = css.slice(0, start) + css.slice(end)
    const blind = readSheet(mutated)
    expect(blind.restoring).toEqual([{ classes: ['ring-focus'], reach: null }, { classes: ['ring-focus'], reach: null }])
    const { failures, lifted } = auditTree(ROOT, blind)
    expect(failures.length).toBeGreaterThanOrEqual(100)
    // Every lifted element that is green with the rule is red without it (detached control
    // strings are judged only when red, so they are counted apart).
    const elementFailures = failures.filter((f) => !f.includes('<(string)>'))
    expect(elementFailures.length + lifted).toBe(auditTree(ROOT, sheet).lifted)
    expect(failures.every((f) => /lift-[123]/.test(f))).toBe(true)
  })

  it('mutation control: dropping `button` from the LIVE backstop turns exactly the lifted buttons red', () => {
    const start = css.indexOf(':where(.lift-1, .lift-2, .lift-3)')
    const head = css.slice(start, css.indexOf('{', start))
    const narrowed = css.replace(head, head.replace(':where(button, ', ':where('))
    expect(narrowed).not.toBe(css)
    const { failures } = auditTree(ROOT, readSheet(narrowed))
    expect(failures.length).toBeGreaterThanOrEqual(30)
    expect(failures.every((f) => / <(button|Button|IconButton)>: /.test(f))).toBe(true)
  })

  it('control: @keyframes step selectors are never mistaken for rules', () => {
    const selectors = parseCssRules(stripCssComments(css)).map((r) => r.selector)
    expect(selectors).not.toContain('from')
    expect(selectors).not.toContain('to')
    expect(selectors).not.toContain('0%')
  })
})
