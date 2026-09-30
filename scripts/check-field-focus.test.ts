import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { stripComments } from '@/test/source-shape'

// NO ORANGE ON FIELD FOCUS (LIVE-657 · ADR-1661). A SOURCE-reading guard, run under `pnpm test`.
//
// The owner ruled in the 2026-06-05 screenshot review (S8) that clicking into a field never glows
// the brand orange, site-wide. The kit already obeys: `fieldClasses` in components/ui/field.tsx
// focuses a field with the calm neutral halo (`focus:border-border-strong focus:ring-2
// focus:ring-border-strong/30`), and components/ui/field.test.tsx pins that string. What it could
// not reach was the hand-rolled control: fourteen files under app/ and components/ spelled out
// `focus:border-primary` or `focus:ring-primary` themselves, and three bordered wrappers around a
// seamless <Input> lit `focus-within:border-primary`. All of them now take the neutral halo.
//
// This walks app/, components/ and lib/ (tests excluded, comments blanked) and fails on any
// `focus:` or `focus-within:` border or ring in the primary colour, so the orange cannot come back
// one file at a time. It does NOT touch `focus-visible:`: the keyboard ring on actionable chrome is
// the global `--color-focus-ring` rule in app/globals.css (WCAG 2.4.7), which the ruling left alone.

const ROOT = path.resolve(__dirname, '..')
const SCAN = ['app', 'components', 'lib']
const ORANGE_FIELD_FOCUS = /\bfocus(?:-within)?:(?:border|ring)-primary\b/

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p)
  }
}

function offenders(): string[] {
  const files: string[] = []
  for (const r of SCAN) walk(path.join(ROOT, r), files)
  const hits: string[] = []
  for (const f of files) {
    const code = stripComments(readFileSync(f, 'utf8'))
    const lines = code.split('\n')
    lines.forEach((line, i) => {
      const m = line.match(ORANGE_FIELD_FOCUS)
      if (m) hits.push(`${path.relative(ROOT, f)}:${i + 1} ${m[0]}`)
    })
  }
  return hits
}

describe('no brand orange on field focus (S8, LIVE-657)', () => {
  it('the pattern catches every spelling the sweep removed, and not the keyboard ring', () => {
    for (const s of [
      'focus:border-primary',
      'focus:ring-primary',
      'focus:ring-primary/40',
      'focus-within:border-primary',
      'aria-[invalid=true]:focus:ring-primary/30',
      'focus:ring-primary-hover',
    ]) {
      expect(ORANGE_FIELD_FOCUS.test(s), s).toBe(true)
    }
    for (const s of [
      'focus:border-border-strong',
      'focus:ring-border-strong/30',
      'focus-visible:ring-primary/50',
      'focus:border-danger',
    ]) {
      expect(ORANGE_FIELD_FOCUS.test(s), s).toBe(false)
    }
  })

  it('no file under app/, components/ or lib/ focuses a control with the primary colour', () => {
    expect(offenders()).toEqual([])
  })
})
