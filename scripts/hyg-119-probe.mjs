#!/usr/bin/env node
// HYG-119 probe — "no operator-calendar selector names a button by a string that also names a
// DIFFERENT button on the same surface".
//
// ── THE DEFECT ──────────────────────────────────────────────────────────────────────────────────
// Playwright's `getByRole('button', { name })` defaults to `exact: false`, which its own types
// spell out as case-insensitive SUBSTRING matching. The saved entry drawer renders two buttons,
// one of whose names prefixes the other:
//
//     staff-calendar.tsx:599  "Cancel"            the footer control that dismisses the form
//     staff-calendar.tsx:344  "Cancel this date"  the Cancelled exit on the stage row (ADR-1504)
//
// so `{ name: 'Cancel' }` matched both and strict mode failed the test. It failed on `pr-compare`,
// which is a REQUIRED check, on pull requests that had nothing to do with the calendar.
//
// ── WHY IT SURFACED WHEN IT DID, WHICH IS THE PART WORTH REMEMBERING ───────────────────────────
// It did not regress. The whole describe was SKIPPING — `skipUnlessOperator` stands the suite
// down when the saved e2e member cannot manage PW_SPACE_SLUG's Space, and it could not. Granting
// that account `editor` on 2026-09-22 (OWN-081) made every test in the file run for the first
// time, and three latent selector bugs became real in one run. A skipped test banks defects at
// interest; this probe is what notices the next one without waiting for an account change.
//
// ── WHAT IT MEASURES ────────────────────────────────────────────────────────────────────────────
// Not "is `exact: true` present" — that is a spelling, and a new ambiguous selector would pass it
// by simply being new. It reads the SPEC's button-name selectors and the calendar components'
// actual button labels, and fails when a non-exact selector's name is a proper substring of some
// other label on those surfaces. Exact selectors are immune by construction and are skipped.
//
// Exit 0 = done, 1 = not done, 79 = could not look.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const SPEC = 'test/e2e/operator-calendar.spec.ts'
// The files that actually render the operator calendar the spec drives. Scoped on purpose: an
// earlier draft scanned all of components/spaces/ and reported "Cancel booking" and "Cancel Run"
// as collisions with the drawer's "Cancel". Neither is on this surface, and a probe that cries
// about buttons the test can never see is one people learn to ignore.
const SURFACE_DIRS = ['app/(main)/spaces/[slug]/settings/calendar']
const SURFACE_GLOBS = [{ dir: 'components/spaces', prefix: 'calendar-' }]

if (!existsSync(SPEC)) {
  console.error(`could not read ${SPEC}`)
  process.exit(79)
}

/** Remove `{…}` expressions and `<…>` tags repeatedly until nothing changes, then collapse space. */
function stripUntilStable(raw) {
  let out = raw
  for (;;) {
    const next = out.replace(/\{[^{}]*\}/g, '').replace(/<[^<>]*>/g, '')
    if (next === out) break
    out = next
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Every button label the calendar surfaces render, as text between a Button/button open and close. */
const labels = new Set()
const sources = [
  ...SURFACE_DIRS.flatMap((dir) => (existsSync(dir) ? readdirSync(dir).map((n) => [dir, n]) : [])),
  ...SURFACE_GLOBS.flatMap(({ dir, prefix }) =>
    existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith(prefix)).map((n) => [dir, n]) : [],
  ),
]
{
  for (const [dir, name] of sources) {
    if (!name.endsWith('.tsx') || name.includes('.test.')) continue
    const src = readFileSync(join(dir, name), 'utf8')
    // 🔴 NOT `[^>]*` for the attribute region. A JSX button's props routinely contain an arrow
    // function (`onClick={() => ...}`), whose `=>` a naive negated class stops at, so the match
    // ran on into the handler and "Pencil it in" came back as "openNew(today())}> Pencil it in".
    // This is the same `(?:[^>=]|=>|=(?!>))` shape check-adoption.mjs's raw-button-bg pattern uses,
    // and for the same reason.
    for (const m of src.matchAll(/<(Button|button)\b(?:[^>=]|=>|=(?!>))*?>([\s\S]*?)<\/\1>/g)) {
      // Strip JSX expressions and nested tags UNTIL STABLE, not in one pass. A single
      // `.replace(/<[^>]*>/g, '')` leaves `<scr<x>ipt>` as `<script>`: CodeQL's
      // js/incomplete-multi-character-sanitization, flagged on this line on #2857. This probe only
      // reads repo source and renders nothing, so nothing was exploitable — but the rule is right
      // that one pass is not a sanitizer, and a probe should not ship a pattern the scanner will
      // keep flagging in every PR that touches it.
      const text = stripUntilStable(m[2])
      // A residual brace means the strip could not flatten nested JSX, so what is left is not a
      // readable name and asserting on it would be noise.
      if (text && text.length < 60 && !/[{}]/.test(text)) labels.add(text)
    }
  }
}
if (labels.size === 0) {
  console.error('found no button labels on the calendar surfaces; the scan is not looking where it thinks it is')
  process.exit(79)
}

const spec = readFileSync(SPEC, 'utf8')
const offences = []
// Only NON-exact selectors can be ambiguous, so the exact ones are filtered out by the same regex
// that finds them rather than by a second pass.
for (const m of spec.matchAll(/getByRole\(\s*'button'\s*,\s*\{\s*name:\s*'([^']+)'\s*(\}|,\s*exact:\s*(true|false)\s*\})/g)) {
  const [, name, tail] = m
  if (/exact:\s*true/.test(tail)) continue
  const collisions = [...labels].filter((l) => l !== name && l.toLowerCase().includes(name.toLowerCase()))
  if (collisions.length) {
    offences.push({ name, collisions })
  }
}

if (offences.length) {
  for (const o of offences) {
    console.error(
      `HYG-119: getByRole('button', { name: '${o.name}' }) in ${SPEC} is not exact, and these other ` +
        `buttons on the same surfaces also contain that string: ${o.collisions.map((c) => `"${c}"`).join(', ')}. ` +
        `Playwright's name matching defaults to case-insensitive SUBSTRING, so strict mode fails the ` +
        `test with multiple matches. Add exact: true, or rename the copy.`,
    )
  }
  process.exit(1)
}

console.log(`✓ HYG-119: no non-exact button selector in ${SPEC} collides with another calendar button label (${labels.size} labels scanned).`)
