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

// ── THE SAME BUG CAME BACK THROUGH THE GUARD'S TWO BLIND SPOTS (2026-09-04) ──────────────────────
//
// `lib/billing/connect.ts` carried `…, email, display_name` for months and this file never saw it,
// because the guard above has exactly two limits and the defect walked through both:
//
//   1. IT ONLY MATCHES AN INLINE STRING. connect.ts selected through a constant — `.select(COLS)` —
//      and the regex above needs a quote right after `.select(`. Constant indirection was invisible.
//   2. IT ONLY LOOKS FOR `email`. Any OTHER wrong column reads as fine.
//
// What it cost: payouts. `getConnectStatus` reported "no Stripe account" for a profile that had one,
// so the settings card offered "Set up payouts" to an operator already onboarded; and
// `getOrCreateConnectedAccount` took the create branch on every click, trying to mint a duplicate
// Express account each time. The production log for the failing click read "You must complete your
// platform profile to use Connect and create live connected accounts" — an error about a call that
// should never have been made.
//
// So the guard now checks EVERY named column against the generated schema types, which is the real
// invariant ("this select names a column that exists") rather than a blocklist of one known-bad
// name. connect.ts additionally pins its list with `satisfies readonly ProfileColumn[]`, making a
// repeat a COMPILE error; this is the net under the files that cannot do that.
//
// ⚠️ TEST FILES ARE EXCLUDED ON PURPOSE, and the reason is not laziness. `scripts/check-authz-guards
// .test.ts` embeds fake route source in template literals — `select('id, contact_email, …')` — as
// FIXTURES for the authz scanner to analyse. That string is never sent to PostgREST, so flagging it
// would be a false positive, and a guard that cries wolf on its own fixtures is the guard people
// start ignoring.

/** Every column on `public.profiles`, read out of the generated schema types. */
function knownProfileColumns(): Set<string> {
  const types = readFileSync(join(process.cwd(), 'lib/database.types.ts'), 'utf8')
  const profiles = types.slice(types.indexOf('      profiles: {'))
  const row = profiles.slice(profiles.indexOf('Row: {'), profiles.indexOf('Insert: {'))
  return new Set([...row.matchAll(/^\s{10,}(\w+):/gm)].map((m) => m[1]!))
}

/** The plain column names in a PostgREST select list. Skips the syntax this guard cannot judge:
 *  `*`, embedded relations `table!fk(cols)`, aliases `alias:col`, and casts `col::text`. */
function plainColumns(select: string): string[] {
  if (select.includes('(')) return [] // an embedded relation; the inner list is another table's
  return select
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== '*' && !c.includes(':') && !c.includes('!') && /^[a-z_][a-z0-9_]*$/.test(c))
}

describe('every profiles select names columns that exist', () => {
  it('the column set was read from the generated types, not guessed', () => {
    const cols = knownProfileColumns()
    expect(cols.size).toBeGreaterThan(40)
    expect(cols.has('display_name')).toBe(true)
    expect(cols.has('stripe_account_id')).toBe(true)
    expect(cols.has('email')).toBe(false) // the whole reason this file exists
  })

  it('no shipped select names a column profiles does not have', () => {
    const known = knownProfileColumns()
    const offenders = profileSelects()
      .filter((h) => !/\.test\.tsx?$/.test(h.file)) // fixtures, see the note above
      .flatMap((h) =>
        plainColumns(h.select)
          .filter((c) => !known.has(c))
          .map((c) => `${h.file}:${h.line} -> '${c}' in select('${h.select}')`),
      )
    expect(offenders).toEqual([])
  })

  it('the column check discriminates rather than passing everything', () => {
    const known = knownProfileColumns()
    expect(plainColumns('id, display_name').every((c) => known.has(c))).toBe(true)
    expect(plainColumns('id, email').filter((c) => !known.has(c))).toEqual(['email'])
    expect(plainColumns('id, contact_email').filter((c) => !known.has(c))).toEqual(['contact_email'])
    // Syntax it must decline to judge rather than false-positive on.
    expect(plainColumns('*')).toEqual([])
    expect(plainColumns('id, nexus_regions!nexus_region_id ( name )')).toEqual([])
    expect(plainColumns('alias:display_name')).toEqual([])
  })
})

describe('a profiles select made through a constant is not invisible', () => {
  // Blind spot 1. connect.ts hid behind `.select(COLS)` for months. A constant is fine — it is the
  // repo's own pattern for a shared column list — but it has to carry its own proof, and the only
  // one that works without a live database is binding it to the generated types.
  it('lib/billing/connect.ts binds its column constant to the schema types', () => {
    const src = readFileSync(join(process.cwd(), 'lib/billing/connect.ts'), 'utf8')
    expect(src).toContain('satisfies readonly ProfileColumn[]')
  })

  it('finds the indirect selects this file used to miss, so the gap is measured', () => {
    // Not an assertion about how many there are — an assertion that the SCAN can see them at all.
    // If this ever returns zero the detector has broken, not the codebase.
    const indirect: string[] = []
    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (/\.test\.tsx?$/.test(file)) continue
        const src = readFileSync(file, 'utf8')
        if (!/\.from\(\s*['"]profiles['"]\s*\)/.test(src)) continue
        if (/\.select\(\s*[A-Z_][A-Za-z0-9_]*\s*\)/.test(src)) indirect.push(file)
      }
    }
    expect(indirect.length).toBeGreaterThan(0)
    expect(indirect).toContain('lib/billing/connect.ts')
  })
})
