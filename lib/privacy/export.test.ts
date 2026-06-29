import { describe, it, expect, vi, beforeEach } from 'vitest'

// The security contract for the member export: EVERY read is bound to the caller's own
// profile id, and the network child tables are bound to the caller's OWN contact ids. A
// recorder mock captures every filter the builder applies so we can prove no query is
// unscoped (the admin client bypasses RLS, so these in-code filters ARE the access control).

type Call = { table: string; method: string; col?: string; val?: unknown }
const { calls, createAdminClient } = vi.hoisted(() => {
  const calls: Call[] = []
  // network_contacts returns two owned rows so the child (.in) reads are exercised.
  const rowsFor = (table: string): Record<string, unknown>[] =>
    table === 'network_contacts' ? [{ id: 'c1' }, { id: 'c2' }] : []
  const singleFor = (table: string): Record<string, unknown> | null =>
    table === 'profiles' ? { id: 'me', handle: 'me' } : table === 'ai_member_context' ? { profile_id: 'me' } : null

  const createAdminClient = () => ({
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: unknown) {
              calls.push({ table, method: 'eq', col, val })
              const result = { data: rowsFor(table), error: null as unknown }
              return {
                ...result,
                then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
                maybeSingle: () => {
                  calls.push({ table, method: 'maybeSingle', col, val })
                  return Promise.resolve({ data: singleFor(table), error: null })
                },
              }
            },
            in(col: string, val: unknown) {
              calls.push({ table, method: 'in', col, val })
              return Promise.resolve({ data: rowsFor(table), error: null })
            },
          }
        },
      }
    },
  })
  return { calls, createAdminClient }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))

import { buildMemberExport, MEMBER_EXPORT_SECTIONS } from './export'

beforeEach(() => {
  calls.length = 0
})

describe('buildMemberExport — owner scoping', () => {
  it('binds every direct read to the caller id and nothing else', async () => {
    await buildMemberExport('me')
    const direct = calls.filter((c) => c.method === 'eq' || c.method === 'maybeSingle')
    expect(direct.length).toBeGreaterThan(0)
    // The whole safety contract: not one direct read filters on any value but the caller's id.
    for (const c of direct) expect(c.val).toBe('me')
  })

  it('scopes network child tables to the caller OWN contact ids (never unscoped)', async () => {
    await buildMemberExport('me')
    const childReads = calls.filter((c) => c.method === 'in')
    const tables = childReads.map((c) => c.table).sort()
    expect(tables).toEqual(['network_contact_notes', 'network_contact_tags'])
    for (const c of childReads) {
      expect(c.col).toBe('contact_id')
      expect(c.val).toEqual(['c1', 'c2'])
    }
  })
})

describe('buildMemberExport — assembled shape', () => {
  it('stamps provenance and the stable section set, and includes owned rows', async () => {
    const out = await buildMemberExport('me')
    expect(out.meta.format).toBe('frequency.member-export')
    expect(out.meta.profileId).toBe('me')
    expect(out.meta.sections).toEqual(MEMBER_EXPORT_SECTIONS)
    expect(out.data.profile).toEqual({ id: 'me', handle: 'me' })
    expect(out.data.networkContacts).toHaveLength(2)
  })
})
