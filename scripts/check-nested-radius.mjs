#!/usr/bin/env node
// check:nested-radius — a corner nested inside another corner is not the same corner.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
//
// The radius ladder in docs/DESIGN.md is authored BY ROLE — control = 14px, card = 24px — which is
// right for SIBLINGS and wrong for NESTING. Two rounded rectangles look concentric only when the
// inner radius equals the outer radius minus the gap between them. A `rounded-control` (14px) row
// inside a `rounded-card` (24px) panel separated by `p-1` should be 24 − 4.25 = 19.75px, so the old
// pairing rendered every inner corner 5.75px too square. At this app's root (--density-root 106.25%,
// so 1rem = 17px) `p-1` is 4.25px, not 4px — which is exactly why the correct value is a token,
// `--radius-control-nested: calc(var(--radius-card) - 0.25rem)`, and not a hand-picked number: it
// tracks both the skin's card radius and the generation's density.
//
// The owner spotted it on the event page's RSVP picker. It was in eight places.
//
// ── WHAT IT ENFORCES ──────────────────────────────────────────────────────────────────────────
//
// An element carrying BOTH `rounded-card` and `p-1` is a nesting container: it rounds at the card
// radius and insets its children by one step. If a bare `rounded-control` appears in its subtree,
// that is the 5.75px mismatch, and the fix is `rounded-control-nested`.
//
// The subtree is approximated by INDENTATION rather than parsed, deliberately. A real JSX parse
// would also have to resolve `cn()` calls, template literals, conditional class strings and child
// components that take a className prop — and the payoff would be the same finding. What the
// approximation must get right is where the container ENDS: a fixed line window does not, and the
// first version of this guard proved it by flagging components/quest/board-controls.tsx over a
// `rounded-control` toggle that is the segmented control's SIBLING, twenty lines below its close.
// So the window runs from the END of the container's opening tag to the first line indented no
// deeper than that tag — its closing tag — because a JSX child is always indented past its parent.
// The line cap remains only as a backstop against a file that does not indent.
//
// One arm is not enough, because a container's child is often a LOCAL HELPER COMPONENT rather than
// a tag: `<div className="…rounded-card…p-1"><TabBtn/><TabBtn/></div>` puts the offending class in
// a `function TabBtn` four hundred lines away. So arm B resolves any capitalised child tag against
// a definition in the SAME FILE and scans its body too. A helper imported from another module is
// the remaining blind spot, and it is declared rather than papered over — see the note on
// `resolveLocalComponent`.
//
// ⚠️ THE `END OF` IN THAT SENTENCE IS LOAD-BEARING, and it cost a mutation run to learn. A
// multi-line tag closes its own `>` at the SAME indent as its `<`, so a window that starts at the
// class-string line terminates on that `>` before it has seen a single child. The first version
// did, and 8 of 11 seeded regressions walked straight past it while the guard printed ✓. That is
// the whole reason this file ships with scripts/check-nested-radius.test.ts driving it against
// broken fixtures: a detector nobody has watched go red is not evidence of anything.
//
// ── WHAT IT DELIBERATELY DOES NOT FLAG ────────────────────────────────────────────────────────
//
// A `rounded-control` that is a SIBLING of a card — a dropdown's trigger button, a segmented
// control's neighbouring toggle — is correct at 14px and stays. Those outnumber the nested ones,
// which is why a flat grep for `rounded-control` (or for the padding string that happens to sit
// beside it) is not a probe for this: it fires on the controls that are already right. Nesting is
// the whole claim, so nesting is what is measured.

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/** Backstop only — the container's closing tag normally ends the window first. */
export const SUBTREE_WINDOW = 60

/** An element that both rounds at the card radius AND insets its children by one step. */
const CONTAINER = /rounded-card/
const INSET = /(^|[\s`'"])p-1([\s`'"]|$)/
/** Bare `rounded-control` — the negative lookahead is what lets `rounded-control-nested` pass. */
const NESTED_DEFECT = /rounded-control(?![-\w])/

/**
 * Pure detector. Takes `[path, source]` pairs so the test can drive it with fixtures rather than
 * with the repo, and returns one `path:line` per offending CONTAINER (not per child, so a menu
 * with nine rows reports once).
 */
export function findNestedRadiusDefects(files) {
  const bad = []
  for (const [path, source] of files) {
    const lines = source.split('\n')
    lines.forEach((line, i) => {
      if (!CONTAINER.test(line) || !INSET.test(line)) return
      const open = openingTagIndent(lines, i)
      if (open === null) return
      const subtree = childLines(lines, i, open)
      const reachable = [subtree.join('\n'), ...localChildBodies(lines, subtree)]
      if (reachable.some((body) => NESTED_DEFECT.test(body))) bad.push(`${path}:${i + 1}`)
    })
  }
  return bad
}

/**
 * Indentation of the JSX tag the matched class string belongs to. The class may live on the tag's
 * own line (`<nav className="…p-1">`) or on a continuation line of a multi-line tag, so we walk up
 * to the nearest tag open. Returns null when there is none in sight — that is a class string in a
 * variable, which has no subtree to speak of.
 */
export function openingTagIndent(lines, i) {
  for (let j = i; j >= 0 && i - j <= 12; j--) {
    const m = lines[j].match(/^(\s*)<[A-Za-z]/)
    if (m) return m[1].length
  }
  return null
}

/**
 * Lines strictly inside the container: from just past the opening tag's `>` down to the closing
 * tag, or the backstop, whichever comes first. A self-closing tag has no children at all.
 */
export function childLines(lines, i, openIndent) {
  let j = i
  while (j < lines.length && !lines[j].trimEnd().endsWith('>')) j++
  if (j >= lines.length) return []
  if (lines[j].trimEnd().endsWith('/>')) return []

  const out = []
  for (let k = j + 1; k < lines.length && k - j <= SUBTREE_WINDOW; k++) {
    const line = lines[k]
    if (line.trim() === '') continue
    const indent = line.length - line.trimStart().length
    if (indent <= openIndent) break
    out.push(line)
  }
  return out
}

/** Every .tsx under app/ and components/ that mentions the container radius at all. */
export function candidateFiles() {
  const out = execSync("grep -rl 'rounded-card' --include=*.tsx app components || true").toString()
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((p) => [p, readFileSync(p, 'utf8')])
}

/** Capitalised JSX tags used as children — the local-helper candidates for arm B. */
export function childComponentNames(subtree) {
  const names = new Set()
  for (const m of subtree.join('\n').matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) names.add(m[1])
  return [...names]
}

/**
 * Body of a component DEFINED IN THIS FILE, from its declaration to the next top-level one.
 *
 * Deliberately same-file only. Following an import would mean resolving module paths, re-entering
 * this walk on a shared component and deciding what a `className` PROP passed from a caller means
 * — at which point the guard is a type checker. A shared component that hardcodes an inner radius
 * is the blind spot this leaves, and the reason the RSVP picker's own fix went in by hand rather
 * than by grep.
 */
export function resolveLocalComponent(lines, name) {
  const decl = new RegExp(`^(?:export\\s+)?(?:function\\s+${name}\\b|const\\s+${name}\\s*[=:])`)
  const start = lines.findIndex((l) => decl.test(l))
  if (start === -1) return null
  let end = lines.length
  for (let j = start + 1; j < lines.length; j++) {
    if (/^(?:export\s+)?(?:function |const |class )/.test(lines[j])) { end = j; break }
  }
  return lines.slice(start, end).join('\n')
}

/** Arm B: the bodies of every same-file helper the container renders. */
export function localChildBodies(lines, subtree) {
  return childComponentNames(subtree)
    .map((n) => resolveLocalComponent(lines, n))
    .filter(Boolean)
}

export function report(bad) {
  if (bad.length === 0) {
    console.log('✓ check:nested-radius — no 14px corner nested inside a 24px p-1 container')
    return 0
  }
  console.error('✗ check:nested-radius — a 14px corner is nested inside a 24px p-1 container.')
  console.error('  Use `rounded-control-nested` (24px − 4.25px) for a child inset by `p-1`:')
  for (const b of bad) console.error(`    ${b}`)
  return 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(report(findNestedRadiusDefects(candidateFiles())))
}
