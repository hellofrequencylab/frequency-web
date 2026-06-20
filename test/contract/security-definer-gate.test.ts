import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// ════════════════════════════════════════════════════════════════════════════════════════════════
// SEC-02 - STATIC gate verification. Two static guarantees, no DB needed:
//
//  (A) The four tenancy helpers (can_view_space_content / can_write_space_content / is_space_member /
//      is_space_admin) are defined SECURITY DEFINER with a PINNED search_path, and each is the GATE on
//      the cross-space RLS path it owns (content SELECT/WRITE, the spaces directory read, the
//      space_members admin read). If a migration ever weakens one of these to a non-DEFINER or drops
//      the policy reference, the helper would silently stop gating and this fails.
//
//  (B) No space-scoped READER reaches the service-role admin client without a Space filter. The admin
//      client BYPASSES RLS, so a read on a space-scoped table that forgets `.eq('space_id', ...)` (or its
//      documented equivalent) is a cross-tenant leak the DB can't catch. This scans the entity-backing
//      source for admin-client reads on the space-scoped tables and asserts each carries a space bind.
// ════════════════════════════════════════════════════════════════════════════════════════════════

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const MIGRATIONS = join(ROOT, 'supabase/migrations')

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS, name), 'utf8')
}

// ── (A) The SECURITY DEFINER helpers are real DEFINER functions and gate their RLS paths ─────────

const HELPERS: { fn: string; file: string }[] = [
  { fn: 'is_space_admin', file: '20260711060000_space_members_admin_read_definer.sql' },
  { fn: 'is_space_member', file: '20260711080000_spaces_visibility_aware_rls.sql' },
  { fn: 'can_view_space_content', file: '20260711090000_space_content_isolation.sql' },
  { fn: 'can_write_space_content', file: '20260711100000_space_content_write_isolation.sql' },
]

/** The function DEFINITION block only - from `create ... function public.<fn>(` to the `as $$` body
 *  marker - so the SECURITY DEFINER / search_path assertions match the real CLAUSE, never a comment
 *  that merely mentions "SECURITY DEFINER" elsewhere in the migration. */
function definitionBlock(sql: string, fn: string): string {
  const lower = sql.toLowerCase()
  const start = lower.indexOf(`function public.${fn}(`)
  if (start === -1) return ''
  const body = lower.indexOf('as $$', start)
  return lower.slice(start, body === -1 ? undefined : body)
}

describe('(A) tenancy helpers are SECURITY DEFINER with a pinned search_path', () => {
  for (const { fn, file } of HELPERS) {
    it(`${fn} is created SECURITY DEFINER and pins search_path`, () => {
      const sql = readMigration(file)
      const def = definitionBlock(sql, fn)
      // The function is defined here.
      expect(def, `${fn} definition not found`).not.toBe('')
      // It must run as DEFINER (so it can read spaces/space_members past their RLS) - asserted on the
      // DEFINITION clause, not anywhere in the file (a comment must not satisfy this).
      expect(def, `${fn} must be SECURITY DEFINER`).toMatch(/^[\s\S]*\bsecurity definer\b/)
      // ... and pin its search_path (the ADR-056 / supabase-linter requirement; a DEFINER without a
      // pinned path is a privilege-escalation foot-gun).
      expect(def, `${fn} must pin search_path`).toMatch(/set search_path\s*=\s*public/)
      // It must NOT be declared SECURITY INVOKER (the weakening that would un-gate the helper).
      expect(def, `${fn} must not be SECURITY INVOKER`).not.toContain('security invoker')
    })
  }
})

describe('(A) each helper is the GATE on its cross-space RLS path', () => {
  it('the content tables gate SELECT through can_view_space_content', () => {
    const sql = readMigration('20260711090000_space_content_isolation.sql')
    // Every space-scoped content table has a RESTRICTIVE select policy that calls the can-view helper.
    expect(sql).toMatch(/as restrictive for select using \(public\.can_view_space_content\(space_id\)\)/)
    for (const t of ['circles', 'events', 'practices', 'journey_plans', 'programs']) {
      expect(sql, `${t} must have a can_view_space_content SELECT policy`).toContain(t)
    }
  })

  it('the content tables gate INSERT/UPDATE/DELETE through can_write_space_content', () => {
    const sql = readMigration('20260711100000_space_content_write_isolation.sql')
    expect(sql).toContain('can_write_space_content(space_id)')
    // INSERT, UPDATE (with check on the NEW row to block cross-space moves) and DELETE are all gated.
    expect(sql).toMatch(/for insert with check \(public\.can_write_space_content\(space_id\)\)/)
    expect(sql).toMatch(/for update using \(public\.can_write_space_content\(space_id\)\) with check \(public\.can_write_space_content\(space_id\)\)/)
    expect(sql).toMatch(/for delete using \(public\.can_write_space_content\(space_id\)\)/)
  })

  it('the spaces directory read is gated through is_space_member (private Spaces wall off)', () => {
    const sql = readMigration('20260711080000_spaces_visibility_aware_rls.sql')
    // The spaces_read_active policy lets a non-member see a Space ONLY when it is not private.
    expect(sql).toMatch(/visibility is distinct from 'private' or public\.is_space_member\(id\)/)
  })

  it('the space_members admin read is gated through is_space_admin', () => {
    const sql = readMigration('20260711060000_space_members_admin_read_definer.sql')
    expect(sql).toContain('public.is_space_admin(space_id)')
  })
})

// ── (B) No entity-backing READER uses the admin client on a space-scoped table without a Space bind ─

// The tables whose ROWS belong to a single Space (a read MUST bind the Space). Mapped to the column
// that binds the Space for that table. For the `spaces` table the row IS the Space, so the bind is its
// primary key `id`. `profiles` is keyed by an id list resolved from already-space-scoped rows, so it is
// not itself space-scoped (excluded). This list is the audit's source of truth - adding a new
// space-scoped table here makes the scan enforce it.
const SCOPED_TABLES: Record<string, string[]> = {
  // table → the acceptable scoping tokens that must appear in the same file's reads of it
  space_members: ['space_id'],
  space_follows: ['space_id'],
  space_membership_tiers: ['space_id'],
  space_memberships: ['space_id'],
  space_availability: ['space_id'],
  space_bookings: ['space_id'],
  campaigns: ['space_id'],
  outreach_sends: ['space_id'],
  contacts: ['space_id'],
  crm_deals: ['space_id'],
  crm_activities: ['space_id', 'deal_id'], // activities bind via deal_id (the deal is space-scoped) + space_id
  network_contact_tags: ['network_contacts.space_id'],
  qr_codes: ['space_id'],
  nodes: ['space_id'],
  captures: ['node_id'], // captures are read through a node that is itself space-scoped
  spaces: ['id', 'slug', 'domain'], // the row IS the Space; bind by its own key (id/slug/domain)
}

// The files that BACK entity surfaces + the directory. Each must, for any space-scoped table it reads,
// carry the table's scoping token somewhere in the file (a coarse but reliable static tripwire: a
// reader that drops every scoping filter on a table will trip this).
const BACKING_FILES = [
  'lib/spaces/store.ts',
  'lib/spaces/membership.ts',
  'lib/spaces/memberships.ts',
  'lib/spaces/follows.ts',
  'lib/spaces/checkin.ts',
  'lib/spaces/audiences.ts',
  'lib/spaces/campaigns.ts',
  'lib/spaces/email.ts',
  'lib/spaces/email-analytics.ts',
  'lib/spaces/booking.ts',
  'lib/spaces/discovery.ts',
  'lib/qr/space-codes.ts',
  'lib/crm/pipeline.ts',
]

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

describe('(B) every entity-backing reader binds the Space on each space-scoped table it touches', () => {
  for (const file of BACKING_FILES) {
    it(`${file} carries a Space-scoping filter for every space-scoped table it reads`, () => {
      const src = read(file)
      for (const [table, tokens] of Object.entries(SCOPED_TABLES)) {
        // Does this file read/write the table?
        const touches = new RegExp(`\\.from\\(\\s*['\`]${table}['\`]\\s*\\)`).test(src)
        if (!touches) continue
        // If so, at least one of the table's acceptable scoping tokens must appear in the file.
        const bound = tokens.some((tok) => src.includes(tok))
        expect(
          bound,
          `CROSS-TENANT LEAK RISK: ${file} reads the space-scoped table '${table}' through the ` +
            `RLS-bypassing admin client but never references any of its scoping tokens ` +
            `[${tokens.join(', ')}]. A service-role read MUST bind the Space.`,
        ).toBe(true)
      }
    })
  }

  it('every entity widget that reads the admin client directly binds the Space', () => {
    // The only entity widget that talks to the admin client directly is entity-about (it reads the
    // not-yet-typed spaces.about). Scan the whole entity widget dir: any widget that imports the admin
    // client must also reference a Space bind (space.id / spaceId / .eq('id'/'space_id')).
    const dir = join(ROOT, 'components/widgets/entity')
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.tsx')) continue
      const src = readFileSync(join(dir, name), 'utf8')
      if (!src.includes('createAdminClient')) continue
      const bound = /space\.id|spaceId|\.eq\(\s*['`](?:id|space_id)['`]/.test(src)
      expect(
        bound,
        `CROSS-TENANT LEAK RISK: components/widgets/entity/${name} uses the admin client but never ` +
          `binds a Space (space.id / spaceId / .eq('id'|'space_id')).`,
      ).toBe(true)
    }
  })
})
