import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// ── 🔴 The claim token must never be reachable by a browser client ────────────────────────
//
// THE BUG THIS GUARDS (20270127000000). `spaces.claim_token` is a one-time secret that
// transfers ownership of an unclaimed Business Space to whoever presents it. It lived as a
// plain column on `public.spaces`, which is deliberately anon-readable at the ROW level so the
// public directory works. RLS is row-level, so the policy returned the row and handed over the
// secret with it. Executing as `role anon` on production returned every live token in one
// query, each one a one-tap takeover of a real business's page.
//
// WHY THIS IS A SOURCE-TEXT GUARD. The failure is silent in both directions: nothing throws if
// someone re-grants the column, and nothing throws if someone adds `claim_token` to a select
// list on the user client. The only signal is a secret going out over the wire. There is no
// live database in CI, so the grant itself cannot be asserted here — what CAN be pinned is the
// migration's SHAPE and the app-side rules that keep it true.

const MIGRATIONS = 'supabase/migrations'
// Both sibling migrations: spaces (20270127000000) and events (20270128000000). Asserting the
// shape of BOTH matters, because the events one only exists because the guard below found it.
const revokeFiles = readdirSync(MIGRATIONS).filter((f) => /revoke_.*claim_token_from_anon/.test(f))

describe('the claim-token revoke migration exists and has the ONLY shape that works', () => {
  it('both the spaces and the events revoke migrations are present', () => {
    expect(revokeFiles.length).toBe(2)
    expect(revokeFiles.some((f) => /event/.test(f))).toBe(true)
  })

  const sql = revokeFiles.map((f) => readFileSync(`${MIGRATIONS}/${f}`, 'utf8')).join('\n')
  // Strip `--` comments: the header explains the no-op trap by writing it out, and an assertion
  // that trips on the documentation for the thing it guards is an assertion that gets deleted.
  const code = sql.replace(/^\s*--.*$/gm, '')

  it('revokes the TABLE-level select, not just the column', () => {
    // 🔴 THE WHOLE POINT. `revoke select (claim_token) ... from anon` is a silent NO-OP against
    // a table-wide grant — it returns success and changes nothing. That exact form was applied
    // first and the exploit still worked; only re-running it as `anon` caught it. Anyone
    // "simplifying" this migration back to a column revoke reintroduces the hole.
    expect(code).toMatch(/revoke\s+select\s+on\s+public\.spaces\s+from\s+anon,\s*authenticated/i)
    expect(code).toMatch(/revoke\s+select\s+on\s+public\.events\s+from\s+anon,\s*authenticated/i)
    expect(code).not.toMatch(/revoke\s+select\s*\(\s*claim_token\s*\)/i)
  })

  it('re-grants the public columns explicitly, and NEVER the two secret ones', () => {
    const grants = [...code.matchAll(/grant select \(([\s\S]*?)\)\s*on\s+public\.(\w+)/g)]
    expect(grants.length).toBe(2)
    for (const [, cols, table] of grants) {
      expect(cols).toContain('slug')
      expect(cols).toContain('visibility')
      expect(cols).toContain('claimed_at') // public state the UI branches on
      expect(cols).not.toContain('claim_token')
      if (table === 'spaces') expect(cols).not.toContain('claimed_by')
    }
  })

  it('locks writes to the claim columns as well', () => {
    expect(code.match(/revoke\s+insert\s*\(\s*claim_token/gi)?.length).toBe(2)
    expect(code.match(/revoke\s+update\s*\(\s*claim_token/gi)?.length).toBe(2)
  })
})

describe('no app code can reach the claim token from a browser client', () => {
  const sources = (dir: string): string[] => {
    const out: string[] = []
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) out.push(...sources(p))
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p)
    }
    return out
  }
  const files = [...sources('lib'), ...sources('app'), ...sources('components')]

  it('no `select(\'*\')` and no embedded `spaces(*)` against the spaces table', () => {
    // With partial column grants, `select *` ERRORS with "permission denied for column" — it
    // does not silently omit. A star-select on spaces would take the page down, not leak.
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (!src.includes("from('spaces')") && !src.includes("from('events')")) continue
      // Each from('spaces'|'events') call and the select that follows within a few lines.
      for (const m of src.matchAll(/from\('(?:spaces|events)'\)([\s\S]{0,200})/g)) {
        if (/\.select\(\s*['"`]\s*\*/.test(m[1])) offenders.push(f)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the only module reading claim_token uses the ADMIN (service_role) client', () => {
    const claim = readFileSync('lib/spaces/claim.ts', 'utf8')
    expect(claim).toContain('createAdminClient')
    // The user-scoped client must never appear here: service_role is unaffected by the revoke,
    // the anon/authenticated clients now get "permission denied" — which would surface as a
    // broken claim flow rather than a leak, but is still a bug worth failing on.
    expect(claim).not.toContain("from '@/lib/supabase/server'")
  })

  // EVERY module that selects a claim_token — for spaces OR events — must do it on the admin
  // (service_role) client, because that is the only role the revokes leave able to read it.
  // This assertion is how the EVENT hole (20270128000000) was found: it was written for the
  // Space fix, flagged two event readers, and checking the sibling table showed the identical
  // defect with 21 live tokens exposed. Keep it table-agnostic for exactly that reason.
  it('every module selecting a claim_token uses the ADMIN client', () => {
    const readers = files.filter((f) => /\.select\([^)]*claim_token/.test(readFileSync(f, 'utf8')))
    // Guard the guard: if this list ever empties, the regex has drifted and the test is vacuous.
    expect(readers.length).toBeGreaterThan(0)
    const onUserClient = readers.filter((f) => !readFileSync(f, 'utf8').includes('createAdminClient'))
    expect(onUserClient).toEqual([])
  })

  it('the token is never rendered without an ownership check', () => {
    // The event page embeds the claim URL in the DOM. It must stay behind the posted-by check,
    // or the revoke is undone at the template layer for every visitor.
    const page = readFileSync('app/(main)/events/[slug]/page.tsx', 'utf8')
    // Anchor on the URL CONSTRUCTION, not the string '/events/claim/' — that also appears in the
    // ClaimButton import at the top of the file, and matching it there made this assertion read
    // 400 characters of import statements and pass/fail for the wrong reason.
    const idx = page.indexOf('/events/claim/${')
    expect(idx).toBeGreaterThan(-1)
    // The ownership check sits in the same ternary that builds the URL.
    expect(page.slice(Math.max(0, idx - 400), idx)).toContain('myProfileId === postedById')
  })
})
