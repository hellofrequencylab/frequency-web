#!/usr/bin/env node
// ACCESSIBLE-NAME CONTRACT — every interactive control in the app has an accessible name.
//
// WHY THIS EXISTS, AND WHY IT IS NOT scripts/check-labels.mjs. That gate asks "is this <label>
// associated with a control", and the answer has been zero violations since ADR-966/ADR-1057. It
// says so itself, in its own §"WHAT IT CANNOT SEE": a control named by a bare <span> sibling has
// no <label> to find, so it is invisible there. The honest question is the other one — "does this
// CONTROL have a name at all" — and nothing in the repo asked it.
//
// 🔴 THE NUMBER THIS GATE REPLACES, AND WHY IT WAS WRONG. LIVE-033 was filed as "143 controls
// across 67 files MAY have no accessible name". That 143 came from a brace-aware TEXT scan that
// could not resolve the label-WRAPPING components (`Field`, `StudioField`, `Labeled`, …) and could
// not read an element's CONTENTS, so it counted `<button><X aria-hidden /> Publish</button>` and
// every `<Field label="Name"><Input /></Field>` in the repo as unnamed. Measured properly — with
// the six naming paths the accessible-name computation actually has — the real number was 17,
// across 14 files. 126 of the 143 were false positives. That ratio is the whole reason ADR-970
// exists: a gate at 143 would have fired on correct code on its first run and been routed around
// within a day. The 17 were then FIXED, so the VIOLATION half of this gate runs at ZERO with no
// allowlist — there is nothing there to waive. That is not the whole gate any more: a second and
// deliberately WEAKER ratchet rides alongside it, on placeholder-only names. See
// MAX_PLACEHOLDER_ONLY, and §8 below for why that one has to be a ceiling and not a zero.
//
// WHAT COUNTS AS A NAME. All six paths the spec gives, plus the two the repo actually uses:
//   1. `aria-label`                      5. an `<svg><title>` inside the control
//   2. `aria-labelledby`                 6. a wrapping <label> (implicit association), including
//   3. `title`                              the WRAPPER COMPONENTS discovered below
//   4. visible text content              7. `htmlFor` on a <label> pointing at this control's id
//   8. `placeholder` / `alt` / `value`, which is what axe-core's own `label` rule accepts:
//      its `any:` list is aria-label · aria-labelledby · non-empty-title · non-empty-placeholder ·
//      implicit-label · explicit-label · presentational-role (verified in axe-core 4.13.0, the
//      version this repo runs in test/e2e). A placeholder is a WEAK name — it vanishes the moment
//      you type — but it is a name, and a gate that called it a VIOLATION would be stricter than
//      the axe pass already running in e2e, disagree with it, and get routed around (ADR-970).
//      So it is not a violation. It is RATCHETED instead — see MAX_PLACEHOLDER_ONLY below.
//
// 🔴 THE SECOND NUMBER THAT WAS WRONG, AND WHY THE ORDER OF THE CHECKS IS THE MEASUREMENT
// (2026-08-24). This gate printed "429 placeholder (weak)" and that was read — in the backlog and
// in this file's own comments — as "429 controls whose ONLY name is a placeholder". It was not.
// The placeholder test used to sit inside the `else if` chain AHEAD of `htmlFor`, `wrapping label`
// and `contents`, so `<Label htmlFor="x" /><Input id="x" placeholder="e.g. …" />` and every
// `<Field label="Title"><Input placeholder="…" /></Field>` scored `placeholder (weak)` despite
// having a real, permanent label. Measured with the placeholder LAST — where HTML-AAM puts it,
// behind aria-labelledby, aria-label and the native <label> — the honest number was 87, not 429.
// 347 of the 429 were false positives, which is the LIVE-033 ratio (126 of 143) repeating on the
// same gate for the same reason: a naming path checked in the wrong order is a naming path missed.
// The lesson generalises past this file — a tally is only worth what its precedence is worth.
//
// WHAT IS JUDGED. Under app/ + components/:
//   · the intrinsic controls `<button> <a href> <input> <textarea> <select>`
//   · the kit primitives that render one and DO NOT name it themselves — `Input` / `Textarea`
//     (components/ui/field.tsx), `Select`, `Checkbox`, `Switch`, `Button`. Resolved BY IMPORT, the
//     way check-labels.mjs resolves `Label`: a local component that happens to be called `Button`
//     is not the kit's Button, and counting it would be the false positive that kills the gate.
//   · anything carrying a literal interactive `role=` (switch, tab, radio, menuitem, …), because a
//     `<div role="button" onClick>` owes a name exactly as a <button> does.
//
// WHAT IS DELIBERATELY NOT A VIOLATION, because unknowable is not a violation (check-labels' rule):
//   · a control with a `{...spread}` — the name may arrive in the props, from the caller.
//   · a child that is a bare expression, a call, or an unknown component: `{label}`, `{t.name}`,
//     `<Foo />`. 686 controls pass on this alone and the run prints that count. A lucide-react icon
//     is the one component class this gate DOES judge, because it is resolved by import and renders
//     an <svg> with no <title> — which is precisely the icon-only-button bug (13 of the 17 found).
//   · anything `display:none` (`hidden`, `className="hidden"`) or `aria-hidden` — removed from the
//     accessibility tree, so it has no name to lack. `sr-only` is NOT that: it is visible to a
//     screen reader and does owe a name (2 of the 17 were `sr-only` file inputs).
//
// WHAT IT STILL CANNOT SEE, so green here is not "the app is accessible":
//   · whether the name is any GOOD. "Button", "Click here" and a name that duplicates a nearby
//     heading all pass. docs/CONTENT-VOICE.md owns that, and the axe pass in test/e2e owns the
//     rendered tree, where a name assembled at runtime is finally real.
//   · a name that only exists at runtime (threaded through three components, or set by an effect).
//     Those read as `spread`/unknowable here and pass.
//
// Usage: `node scripts/check-a11y-names.mjs` (or `pnpm check:a11y-names`). Exits 1 on violation.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve as resolvePath, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const ROOTS = ['app', 'components']

/** A repo this size never legitimately drops to a handful of components. Same backstop as
 *  MIN_FILES in check-labels.mjs: a gate cannot pass over nothing. */
export const MIN_FILES = 500

/** Nor to a handful of CONTROLS. This is the instrument check that matters most here, because
 *  every step of this scan is an opportunity to stop finding things: if the JSX parse, the import
 *  resolution or the tag walk quietly broke, the violation list would go to zero and the gate
 *  would print ✓ over an unmeasured repo. 3,596 controls were judged on 2026-08-17. */
export const MIN_JUDGED = 2500

/** Nor to a handful of resolved WRAPPERS. The `Field`/`StudioField`/`Labeled` discovery below is
 *  the single reason this gate can run at 17 instead of 143, so a discovery pass that stops
 *  discovering must fail loudly rather than turn 283 correctly-wrapped controls into violations.
 *  6 wrapper components naming 283 controls on 2026-08-17. */
export const MIN_WRAPPERS = 4

/**
 * ⚠️ THE WEAK-NAME RATCHET — how many controls may be named ONLY by their placeholder.
 *
 * A placeholder is a name that deletes itself. It is announced on an empty field and gone the
 * instant there is a value, so a member who tabs back through a form they half-filled hears a row
 * of unnamed text boxes. axe-core accepts it (see §8 above), the e2e pass therefore accepts it,
 * and a static gate that FAILED on it would be stricter than the pass already running — the exact
 * reason LIVE-033 declined to fail here and counted instead.
 *
 * 🔴 SO THIS IS A RATCHET, DELIBERATELY NOT A ZERO. It is weaker than a violation on purpose: it
 * never disagrees with axe about whether existing code is broken, it only refuses to let the
 * population GROW. New code may not add a placeholder-only control; retiring them is a per-field
 * product judgement about what the label should SAY (docs/CONTENT-VOICE.md), which is not a
 * codemod. What the freeze buys is the property the count never had — it stops rising while that
 * judgement gets made, one surface at a time.
 *
 * SEEDED 2026-08-24 at the measured value, twice. 429 under the old (wrong) precedence; 87 once
 * the placeholder test moved behind the real label paths; 59 after that change retired 28 of them
 * across the event address blocks, the event-draft editor rows, the induction funnel and the
 * Journey title rail. The number was the LAST of those three, because a ceiling seeded above
 * reality is a ceiling guarding nothing.
 *
 * LOWERED TO 1 on 2026-08-24 (LIVE-103, second pass), when the remaining 58 were retired across
 * 38 files. 15 took a VISIBLE label — the block editor's feature and card rails (12), the two
 * paste-a-link fields, and the reject-a-verification note — and the tally below moved by exactly
 * that: `wrapping label` 468 -> 483, `aria-label` 737 -> 780. The other 43 took an `aria-label`,
 * because the surface is deliberately chrome-free: seamless search boxes inside pickers and
 * overlays, seamless title rails in the Studio builders, the feed / event / reply composers, and
 * dense repeated rows (block links, booking questions) where a per-row visible label is noise.
 * No placeholder was deleted to move this number: the ones that only repeated their new label
 * went, the ones carrying a real example stayed.
 *
 * 🔴 THE 1 THAT IS LEFT IS A FALSE POSITIVE, AND IT IS LEFT ON PURPOSE.
 * `app/(main)/spaces/new/business/business-quickstart-form.tsx:50` is `<Field id="biz-what"
 * label="What do you do?">` from `components/spaces/space-form.tsx`, which renders
 * `<Label htmlFor={id}>` beside the control. That IS a real, permanent name; this walk cannot see
 * it because the `htmlFor` is a forwarded prop in ANOTHER file, so the literal never lands in
 * `fors`. `discoverWrappers` already solves the sibling problem for label-WRAPPING components;
 * the forwarding shape has no equivalent yet. Fixing the render site instead would put a second,
 * duplicate name on a correctly-labelled control to satisfy an instrument — the shape-not-truth
 * trade this gate's own 429 was built out of. It is booked as HYG-018 and the ceiling carries it
 * honestly at 1 rather than pretending to a 0 it has not earned.
 *
 * A COUNT, NOT A SET — and check-templates.mjs's §"A COUNT IS NOT A SET" is the argument against
 * that, so it is answered rather than ignored. There, one page adopting a template and one new
 * bare page net to zero and hide a regression, so the baseline had to become a path list. Here the
 * population is undifferentiated — a placeholder-only field is a leftover, not a justified
 * exception — which is check-adoption.mjs's own test for when a count is the right shape ("a count
 * is right when the goal is monotone decline of an undifferentiated population"). The swap-hiding
 * risk is real and is bought back cheaply: the failure below prints the worst files by count, and
 * every run prints the tally, so a net-zero swap still shows up as a moved number in a diff.
 *
 * TO LOWER IT: give the fields real names, then set this to what the run prints, in the SAME
 * change. Never raise it.
 */
export const MAX_PLACEHOLDER_ONLY = 1

/**
 * The ceiling verdict, as a pure function of the count.
 *
 * Split out from `main()` for one reason: a ratchet nobody has watched fire is a ratchet nobody
 * knows is wired (AGENTS.md — "every fail-safe needs a gate that notices it fired"). The sibling
 * test drives this at the ceiling, one below it and one above it, so the FIRING direction is
 * proven without a fixture tree and without shelling out.
 */
export function placeholderCeiling(count, max = MAX_PLACEHOLDER_ONLY) {
  return { count, max, over: count > max, delta: count - max }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// AST helpers
// ───────────────────────────────────────────────────────────────────────────────────────────────

export function parse(file, src) {
  return ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

const tagOf = (n) => n.tagName.getText()
const opening = (n) => (ts.isJsxElement(n) ? n.openingElement : n)
const propsOf = (n) => (n.attributes ? n.attributes.properties : [])

function attr(open, name) {
  for (const p of propsOf(open)) if (ts.isJsxAttribute(p) && p.name.getText() === name) return p
  return null
}
const hasSpread = (open) => propsOf(open).some((p) => ts.isJsxSpreadAttribute(p))

/** The attribute's value as comparable text: the STRING for a literal, the raw source otherwise.
 *  A bare attribute (`hidden`, `aria-hidden`) reads as the empty string, which is how the two
 *  `is*Hidden` predicates below spot it. */
function attrText(open, name) {
  const a = attr(open, name)
  if (!a) return null
  if (!a.initializer) return ''
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text
  return a.initializer.getText()
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Wrapper-component discovery — the half LIVE-033 says was missing
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** Which module a specifier points at, as a repo-relative path. `@/x` is the tsconfig alias for
 *  the repo root; a relative specifier resolves against the importing file. */
export function resolveSpec(fromFile, spec, exists = existsSync) {
  let base
  if (spec.startsWith('@/')) base = spec.slice(2)
  else if (spec.startsWith('.')) base = relative(process.cwd(), resolvePath(dirname(fromFile), spec))
  else return null
  for (const cand of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx')]) if (exists(cand)) return cand
  return null
}

/** Every named import in a file: local name -> { file, orig }. */
export function importMap(sf, file, exists) {
  const m = new Map()
  sf.forEachChild((n) => {
    if (!ts.isImportDeclaration(n)) return
    const target = resolveSpec(file, n.moduleSpecifier.getText().slice(1, -1), exists)
    const b = n.importClause?.namedBindings
    if (b && ts.isNamedImports(b)) {
      for (const el of b.elements) m.set(el.name.text, { file: target, orig: (el.propertyName ?? el.name).text })
    }
  })
  return m
}

function enclosingComponentName(node) {
  let p = node.parent
  while (p) {
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text
    p = p.parent
  }
  return null
}

/**
 * Every component that WRAPS its children in a <label>, as a set of `path::ComponentName`.
 *
 * This is the piece LIVE-033 names as the blocker, and it is why the honest count is 17 rather
 * than 143: `<Field label="Board name"><Input /></Field>` is a correctly named control, and a scan
 * that only looks for `aria-label` sees an unnamed one. Six of these exist in the repo, and they
 * name 283 controls between them.
 *
 * Run to a FIXPOINT, so a wrapper built out of another wrapper is one too. Takes a
 * { path -> source } map, so the sibling test can drive it without touching the filesystem.
 */
export function discoverWrappers(files, exists = existsSync) {
  const wrappers = new Set()
  for (let pass = 0; pass < 5; pass++) {
    const before = wrappers.size
    for (const [file, src] of files) {
      if (!src.includes('children')) continue
      const sf = parse(file, src)
      const local = new Set()
      for (const key of wrappers) {
        const [wf, wn] = key.split('::')
        if (wf === file) local.add(wn)
      }
      for (const [name, info] of importMap(sf, file, exists)) {
        if (info.file && wrappers.has(`${info.file}::${info.orig}`)) local.add(name)
      }
      const visit = (node) => {
        if (ts.isJsxElement(node)) {
          const tag = tagOf(node.openingElement)
          // `{children}` anywhere inside the <label> is the implicit association: HTML binds the
          // label to the first labelable descendant, and the child the caller passes IS that.
          if ((tag === 'label' || local.has(tag)) && /\{\s*children\s*\}/.test(node.getText())) {
            const name = enclosingComponentName(node)
            if (name) wrappers.add(`${file}::${name}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
    if (wrappers.size === before) break
  }
  return wrappers
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// What is a control
// ───────────────────────────────────────────────────────────────────────────────────────────────

/** Kit primitives that render a control and name NONE of it themselves, keyed by declaring module.
 *  `IconButton` / `IconLink` are absent on purpose: their `label: string` prop is REQUIRED and
 *  becomes both `aria-label` and `title`, so the type checker is already the gate for those. */
export const KIT_CONTROLS = new Map([
  ['components/ui/field.tsx::Input', 'input'],
  ['components/ui/field.tsx::Textarea', 'textarea'],
  ['components/ui/select.tsx::Select', 'select'],
  ['components/ui/checkbox.tsx::Checkbox', 'checkbox'],
  ['components/ui/switch.tsx::Switch', 'switch'],
  ['components/ui/button.tsx::Button', 'button'],
])

const INTRINSIC_CONTROLS = new Set(['button', 'a', 'input', 'textarea', 'select'])

/** ARIA roles that make ANY element an interactive control owing a name. A `<div role="button">`
 *  is a button to a screen reader and owes exactly what a <button> owes. */
export const ROLE_CONTROLS = new Set([
  'button', 'link', 'checkbox', 'switch', 'radio', 'tab', 'menuitem', 'menuitemcheckbox',
  'menuitemradio', 'option', 'textbox', 'searchbox', 'combobox', 'spinbutton', 'slider',
])

/** Controls a wrapping <label> can name. A <button> inside a <label> is NOT named by it. */
const LABELABLE = new Set(['input', 'textarea', 'select', 'checkbox'])

/** `display:none` and `aria-hidden` both remove the element from the accessibility tree, so there
 *  is no name to be missing. `sr-only` deliberately does NOT count: it is visible to a screen
 *  reader, and two of the real findings were `sr-only` file inputs. */
export function isRemovedFromA11yTree(open) {
  if (attr(open, 'hidden')) return true
  const h = attrText(open, 'aria-hidden')
  if (h === 'true' || h === '{true}' || h === '') return true
  const cls = attrText(open, 'className')
  // The whole-token match matters: `overflow-hidden` and `sm:hidden` are not `display:none`.
  return cls != null && /(^|[\s'"`{])hidden([\s'"`}]|$)/.test(cls)
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Does the content name it? (accname step 2F, "name from content")
// ───────────────────────────────────────────────────────────────────────────────────────────────

function svgHasTitle(node) {
  let found = false
  const visit = (n) => {
    if (found) return
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const t = tagOf(opening(n))
      if (t === 'title' || t === 'desc') { found = true; return }
    }
    ts.forEachChild(n, visit)
  }
  ts.forEachChild(node, visit)
  return found
}

function exprContributes(e, icons) {
  if (ts.isParenthesizedExpression(e)) return exprContributes(e.expression, icons)
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return contributes(e, icons)
  // `{busy ? <Loader2 /> : <Check />}` is two icons and no name; `{busy ? 'Saving' : label}` is a
  // name either way. Recursing both branches is what tells them apart — without it, every ternary
  // reads as unknowable and the icon-only case walks straight through.
  if (ts.isConditionalExpression(e)) return exprContributes(e.whenTrue, icons) || exprContributes(e.whenFalse, icons)
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return exprContributes(e.right, icons)
    if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) {
      return exprContributes(e.left, icons) || exprContributes(e.right, icons)
    }
  }
  // A call, an identifier, a member access, a `.map()`: it could render text. Unknowable is not a
  // violation — the same call check-labels.mjs makes for a computed `htmlFor`.
  return true
}

/** Does this JSX child contribute anything to the accessible name? */
export function contributes(node, icons) {
  if (ts.isJsxText(node)) return /\S/.test(node.text)
  if (ts.isJsxExpression(node)) return node.expression ? exprContributes(node.expression, icons) : false
  if (ts.isJsxFragment(node)) return node.children.some((c) => contributes(c, icons))
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const open = opening(node)
    if (isRemovedFromA11yTree(open)) return false
    if (attr(open, 'aria-label') || attr(open, 'aria-labelledby') || attr(open, 'title') || attr(open, 'alt')) return true
    const t = tagOf(open)
    if (t === 'svg') return svgHasTitle(node)
    // A lucide icon renders <svg> with no <title>: it contributes NOTHING, which is the entire
    // icon-only-button defect. This is the one component class resolved well enough to judge.
    if (icons.has(t)) return false
    if (ts.isJsxSelfClosingElement(node)) return !/^[a-z]/.test(t) // <img> with no alt names nothing
    return node.children.some((c) => contributes(c, icons))
  }
  return false
}

/** The lucide-react icon components a file imports. */
export function iconNames(sf) {
  const icons = new Set()
  sf.forEachChild((n) => {
    if (!ts.isImportDeclaration(n)) return
    if (n.moduleSpecifier.getText().slice(1, -1) !== 'lucide-react') return
    const b = n.importClause?.namedBindings
    if (b && ts.isNamedImports(b)) for (const el of b.elements) icons.add(el.name.text)
  })
  return icons
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// The audit
// ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Audit one file's controls.
 *
 * `ctx` is already RESOLVED — `{ wrapperNames: Set<string>, kitKinds: Map<string, kind> }` are the
 * LOCAL names in this file. Splitting resolution from judgement is what lets the sibling test drive
 * every arm from a string fixture with no filesystem at all.
 *
 * Returns `{ violations, judged, named, weak }`, where `named` is a { path -> count } tally the
 * caller prints and `weak` is the SITE LIST behind its `placeholder (weak)` entry. Publishing HOW
 * controls get their names is the point: 59 of them are named only by a placeholder, and a run
 * that hid that would be claiming more than it measured. The site list is what lets the ceiling
 * name files rather than just a number.
 */
export function auditNames(src, ctx, file = 'fixture.tsx') {
  const sf = parse(file, src)
  const icons = iconNames(sf)
  const wrapperNames = ctx.wrapperNames ?? new Set()
  const kitKinds = ctx.kitKinds ?? new Map()

  // Every htmlFor in the file, for explicit association. check-labels.mjs already proves each one
  // REACHES a labelable element, so matching on the value alone is sound here.
  const fors = new Set()
  const collectFors = (n) => {
    if (ts.isJsxAttribute(n) && (n.name.getText() === 'htmlFor' || n.name.getText() === 'for') && n.initializer) {
      const i = n.initializer
      fors.add((ts.isStringLiteral(i) ? i.text : i.getText()).replace(/\s+/g, ''))
    }
    ts.forEachChild(n, collectFors)
  }
  collectFors(sf)

  const violations = []
  const named = new Map()
  /** Every control whose ONLY name is its placeholder — the weak-name population MAX_PLACEHOLDER_ONLY
   *  ratchets. Collected as SITES, not just a tally, so a run that is OVER the ceiling can say where
   *  to go instead of printing a bare number the reader has to re-derive by hand. */
  const weak = []
  let judged = 0

  const walk = (node, stack) => {
    let next = stack
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = opening(node)
      const tag = tagOf(open)
      next = [...stack, tag]
      const role = attrText(open, 'role')

      const kind =
        INTRINSIC_CONTROLS.has(tag) ? tag
        : kitKinds.get(tag) ??
          (role && ROLE_CONTROLS.has(role) ? role : undefined)

      const inHiddenSubtree = stack.includes('\x00hidden')
      if (kind && !inHiddenSubtree) {
        const type = attrText(open, 'type')
        const skip =
          (kind === 'input' && type === 'hidden') ||
          (tag === 'a' && !attr(open, 'href')) ||
          isRemovedFromA11yTree(open)
        if (!skip) {
          judged++
          let via = null
          if (hasSpread(open)) via = 'spread (unknowable)'
          else if (attr(open, 'aria-label')) via = 'aria-label'
          else if (attr(open, 'aria-labelledby')) via = 'aria-labelledby'
          else if (attr(open, 'title')) via = 'title'
          else if (attr(open, 'alt')) via = 'alt'
          // `Checkbox`/`Field` name themselves from their own `label` prop.
          else if (attr(open, 'label') && !INTRINSIC_CONTROLS.has(tag)) via = 'label prop'
          else if (kind === 'input' && attr(open, 'value') && ['submit', 'button', 'reset'].includes(type ?? '')) via = 'value'
          if (!via) {
            const id = attrText(open, 'id')
            if (id != null && fors.has(id.replace(/\s+/g, ''))) via = 'htmlFor'
          }
          if (!via && LABELABLE.has(kind) && stack.some((t) => t === 'label' || wrapperNames.has(t))) {
            via = 'wrapping label'
          }
          if (!via && ts.isJsxElement(node) && node.children.some((c) => contributes(c, icons))) {
            via = 'contents'
          }
          // 🔴 PLACEHOLDER IS THE LAST RESORT, AND THE ORDER IS THE WHOLE MEASUREMENT (2026-08-24).
          // This test used to sit up in the `else if` chain above, ahead of `htmlFor`, `wrapping
          // label` and `contents` — so `<Label htmlFor="x" /><Input id="x" placeholder="e.g. …" />`
          // and `<Field label="Title"><Input placeholder="…" /></Field>` both scored
          // `placeholder (weak)`, and the 429 this gate printed was NOT "429 controls whose only
          // name is a placeholder". It was "429 controls that HAVE a placeholder", most of them
          // properly labelled. A ratchet seeded on that number would have been guarding a
          // population it had misidentified — coverage in name only (ADR-970). HTML-AAM agrees on
          // the order: aria-labelledby, aria-label, the native <label>, and only then placeholder.
          if (!via && (kind === 'input' || kind === 'textarea') && attr(open, 'placeholder')) {
            via = 'placeholder (weak)'
          }
          const site = () => ({
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            tag,
            snippet: open.getText().replace(/\s+/g, ' ').slice(0, 110),
          })
          if (via) {
            named.set(via, (named.get(via) ?? 0) + 1)
            if (via === 'placeholder (weak)') weak.push(site())
          } else {
            violations.push(site())
          }
        }
      }
      if (isRemovedFromA11yTree(open)) next = [...next, '\x00hidden']
    }
    ts.forEachChild(node, (c) => walk(c, next))
  }
  walk(sf, [])
  return { violations, judged, named, weak }
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Whole-tree run
// ───────────────────────────────────────────────────────────────────────────────────────────────

export function tsxFiles(dir) {
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

/** The whole verdict over the real tree. Exported so the sibling test asserts against the SAME
 *  numbers the CLI floors on, rather than a re-derived approximation of them. */
export function runAudit(roots = ROOTS) {
  const paths = roots.flatMap(tsxFiles)
  const files = new Map(paths.map((p) => [p, readFileSync(p, 'utf8')]))
  const wrappers = discoverWrappers(files)

  const violations = []
  const named = new Map()
  const weak = []
  let judged = 0
  for (const [file, src] of files) {
    const sf = parse(file, src)
    const wrapperNames = new Set()
    const kitKinds = new Map()
    for (const key of wrappers) {
      const [wf, wn] = key.split('::')
      if (wf === file) wrapperNames.add(wn)
    }
    for (const [local, info] of importMap(sf, file)) {
      if (!info.file) continue
      if (wrappers.has(`${info.file}::${info.orig}`)) wrapperNames.add(local)
      const kit = KIT_CONTROLS.get(`${info.file}::${info.orig}`)
      if (kit) kitKinds.set(local, kit)
    }
    const res = auditNames(src, { wrapperNames, kitKinds }, file)
    judged += res.judged
    for (const [k, v] of res.named) named.set(k, (named.get(k) ?? 0) + v)
    for (const v of res.violations) violations.push({ file, ...v })
    for (const w of res.weak) weak.push({ file, ...w })
  }
  return { files: paths.length, wrappers, violations, judged, named, weak }
}

function main() {
  const { files, wrappers, violations, judged, named, weak } = runAudit()

  if (files < MIN_FILES) {
    console.error(`✗ check:a11y-names — found ${files} .tsx file(s) under ${ROOTS.join(' + ')}, expected at least ${MIN_FILES}.`)
    console.error('    Run from the repo root. A gate cannot pass over nothing.')
    process.exit(1)
  }
  if (judged < MIN_JUDGED) {
    console.error(`✗ check:a11y-names — judged only ${judged} control(s), expected at least ${MIN_JUDGED}.`)
    console.error('    The JSX walk has stopped finding controls. Fix the parser; do not lower the floor.')
    process.exit(1)
  }
  if (wrappers.size < MIN_WRAPPERS) {
    console.error(`✗ check:a11y-names — resolved only ${wrappers.size} label-wrapping component(s), expected at least ${MIN_WRAPPERS}.`)
    console.error('    Wrapper discovery has broken. Every <Field>-wrapped control would now read as')
    console.error('    unnamed, which is the 143-false-positive failure this gate was built to avoid.')
    process.exit(1)
  }

  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`✗ ${v.file}:${v.line}  <${v.tag}> has no accessible name`)
      console.error(`    ${v.snippet}`)
    }
    console.error(`\n✖ Accessible-name contract: ${violations.length} control(s) with no name, of ${judged} judged.\n`)
    console.error('  A screen reader announces this control as "button" / "edit text" and nothing else.')
    console.error('  Give it exactly one name, in this order of preference:')
    console.error('    visible text     <button><X aria-hidden /> Remove</button>   (best: everyone sees it)')
    console.error('    a wrapping label <Field label="Name"><Input /></Field>       (components/ui/field.tsx)')
    console.error('    aria-label       <button aria-label="Close"><X aria-hidden /></button>  (icon-only)')
    console.error('    the kit          <IconButton label="Close" icon={X} />       — its label prop is required')
    console.error('\n  Copy names in sentence case, from docs/NAMING.md + docs/CONTENT-VOICE.md.')
    console.error('  See also scripts/check-labels.mjs (ADR-966, ADR-1057), which owns the other half:')
    console.error('  that every <label> reaches a control.')
    process.exit(1)
  }

  const tally = [...named].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(' · ')

  // ── The weak-name ratchet ────────────────────────────────────────────────────────────────────
  // Instrument check first, in the same spirit as MIN_JUDGED: the tally and the site list are two
  // derivations of the same fact, so if they ever disagree the collector has drifted from the
  // counter and the ceiling below is being applied to a number nobody can point at.
  const tallied = named.get('placeholder (weak)') ?? 0
  if (weak.length !== tallied) {
    console.error(
      `✗ check:a11y-names — instrument broken: ${tallied} placeholder-only control(s) tallied but ` +
        `${weak.length} site(s) collected. Fix the walk; do not touch the ceiling.`,
    )
    process.exit(1)
  }

  const ceiling = placeholderCeiling(weak.length)
  if (ceiling.over) {
    const byFile = new Map()
    for (const w of weak) byFile.set(w.file, (byFile.get(w.file) ?? 0) + 1)
    const worst = [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 10)
    console.error(
      `\n✗ check:a11y-names — ${ceiling.count} control(s) are named ONLY by their placeholder, ` +
        `${ceiling.delta} over the ceiling of ${ceiling.max}.\n`,
    )
    console.error('  A placeholder is a name that deletes itself: it is announced on an empty field and')
    console.error('  gone the moment there is a value, so a member tabbing back through a form they')
    console.error('  half-filled hears a row of unnamed text boxes. Where the count is now worst:\n')
    for (const [f, n] of worst) console.error(`    ${String(n).padStart(3)}  ${f}`)
    console.error('\n  Give the NEW ones a real name — a visible label first, an aria-label only where a')
    console.error('  visible one would put chrome on a surface that deliberately has none:')
    console.error('    <Field label="Street address"><Input … /></Field>     (components/ui/field.tsx)')
    console.error('    <Label htmlFor="city">City</Label><Input id="city" … />')
    console.error('    <Input aria-label="Journey title" variant="seamless" … />   (inline/seamless fields)')
    console.error('\n  Copy from docs/NAMING.md + docs/CONTENT-VOICE.md. Keep the placeholder when it is a')
    console.error('  genuine EXAMPLE ("e.g. Torus Co.") and drop it when it only repeats the label.')
    console.error('\n  🔴 Do NOT raise MAX_PLACEHOLDER_ONLY in scripts/check-a11y-names.mjs. It is a ratchet;')
    console.error('  raising it is how the five previous lists in this repo drifted.\n')
    process.exit(1)
  }

  console.log(
    `✓ Accessible names: all ${judged} control(s) across ${files} file(s) have one ` +
      `(${wrappers.size} label-wrapping components resolved).\n    named by: ${tally}` +
      `\n    weak names: ${ceiling.count} control(s) named only by a placeholder ` +
      `(ceiling ${ceiling.max}, may only shrink)` +
      (ceiling.delta < 0
        ? `\n      ${-ceiling.delta} below the ceiling — lower it in this change:` +
          `\n        export const MAX_PLACEHOLDER_ONLY = ${ceiling.count}`
        : ''),
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
