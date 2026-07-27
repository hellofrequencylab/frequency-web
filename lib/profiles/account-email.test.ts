import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// `public.profiles` has NO `email` column — a member's address lives in `auth.users`, reached via
// profiles.auth_user_id. This is a REPO-WIDE guard rather than a unit test because of how the bug
// presents: PostgREST treats an unknown column as a request-level error (42703) and returns a null
// row, so every other column in the same select disappears too. The symptom is never "email was
// undefined" — it is "the profile does not exist", firing the caller's not-a-member branch.
//
// Five call sites had drifted onto it and were silently dead:
//   app/(main)/apply/actions.ts       — every signed-in member got "Only members can apply."
//   app/(main)/waitlist/actions.ts    — signed-in members fell through to the anonymous branch
//   lib/billing/space-plan-checkout.ts (x2) — the owner's saved stripe_customer_id was never reused
//   lib/founding/business-checkout.ts — same
//
// None of tsc, eslint, or the DB types caught it: the selects are untyped strings and the rows are
// cast by hand. A string check is the only thing that can.

const ROOTS = ['app', 'lib', 'components', 'scripts']
const EXT = /\.(ts|tsx|mts|mjs)$/
// A `.select(...)` list that names a bare `email` column while reading the profiles table. Matches
// 'email' at a field boundary so `email_signature` (a REAL column) never trips it.
const BARE_EMAIL = /(^|[,\s(])email([,\s)]|$)/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (EXT.test(e.name)) out.push(p)
  }
  return out
}

/** Every `.select('…')` string that belongs to a `.from('profiles')` chain, with its file:line. */
function profileSelects(): { file: string; line: number; select: string }[] {
  const hits: { file: string; line: number; select: string }[] = []
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, 'utf8')
      if (!src.includes("'profiles'")) continue
      const lines = src.split('\n')
      lines.forEach((line, i) => {
        // The chain may wrap, so look at a small window after each .from('profiles').
        if (!/\.from\(\s*['"]profiles['"]\s*\)/.test(line)) return
        const window = lines.slice(i, i + 6).join(' ')
        const m = /\.select\(\s*['"`]([^'"`]*)['"`]/.exec(window)
        if (m) hits.push({ file, line: i + 1, select: m[1]! })
      })
    }
  }
  return hits
}

describe('profiles has no email column', () => {
  it('no .from("profiles").select() names a bare `email`', () => {
    const offenders = profileSelects()
      .filter((h) => BARE_EMAIL.test(h.select))
      .map((h) => `${h.file}:${h.line} -> select('${h.select}')`)
    expect(offenders).toEqual([])
  })

  it('the guard actually discriminates: it flags `email` but allows `email_signature`', () => {
    expect(BARE_EMAIL.test('id, is_demo, email')).toBe(true)
    expect(BARE_EMAIL.test('email, stripe_customer_id')).toBe(true)
    expect(BARE_EMAIL.test('email')).toBe(true)
    expect(BARE_EMAIL.test('email_signature, display_name')).toBe(false)
    expect(BARE_EMAIL.test('id, email_signature')).toBe(false)
  })

  it('found some profiles selects at all (the walker is not silently matching nothing)', () => {
    expect(profileSelects().length).toBeGreaterThan(5)
  })
})
