// THE OWNER'S UPDATE ON A GUESTBOOK NOTE IS hidden_at, AND NOTHING ELSE (SCAN-758, migration
// 20270345011700).
//
// spotlight_guestbook_update is a ROW policy (owner or staff). A row policy cannot limit columns,
// and Supabase's default per-role grant (ADR-959) gave `authenticated` table-wide UPDATE, so a
// page owner could PATCH message and signer_profile_id and publish a note under another member's
// name. The fix is a column grant: UPDATE on hidden_at alone.
//
// This is a SOURCE-SHAPE test over the migration text, like its siblings in this directory. It
// replays every grant and revoke on the table in version order and asserts what the database is
// left holding. It cannot prove the grant applied; supabase/tests/spotlight_guestbook_update_columns
// .test.sql proves that on a real database. What this file can prove is that a later migration has
// not quietly handed table-wide UPDATE back.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join('supabase', 'migrations')
const TABLE = /(?:table\s+)?(?:public\.)?spotlight_guestbook\b/.source

/** Comment lines stripped, because the migration's header quotes the very statements under test. */
function codeOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toLowerCase()
}

type GrantState = { tableWideUpdate: Set<string>; columnUpdate: Map<string, Set<string>> }

/** The UPDATE privilege each role is left holding after every migration, in filename order.
 *  Starts from Supabase's default: anon and authenticated hold table-wide UPDATE on a new table. */
function replayUpdateGrants(): GrantState {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  const state: GrantState = {
    tableWideUpdate: new Set(['anon', 'authenticated']),
    columnUpdate: new Map(),
  }
  const roles = (list: string) => list.split(',').map((r) => r.trim().replace(/"/g, ''))

  for (const file of files) {
    const sql = codeOnly(readFileSync(join(DIR, file), 'utf8'))
    for (const stmt of sql.split(';')) {
      const revokeAll = stmt.match(new RegExp(`revoke\\s+all(?:\\s+privileges)?\\s+on\\s+${TABLE}\\s+from\\s+([^;]+)`))
      const revokeUpdate = stmt.match(new RegExp(`revoke\\s+update\\s+on\\s+${TABLE}\\s+from\\s+([^;]+)`))
      const grantUpdateCols = stmt.match(new RegExp(`grant\\s+update\\s*\\(([^)]+)\\)\\s+on\\s+${TABLE}\\s+to\\s+([^;]+)`))
      const grantUpdateAll = stmt.match(new RegExp(`grant\\s+(?:all(?:\\s+privileges)?|update)\\s+on\\s+${TABLE}\\s+to\\s+([^;]+)`))
      for (const r of roles((revokeAll ?? revokeUpdate)?.[1] ?? '')) {
        state.tableWideUpdate.delete(r)
        state.columnUpdate.delete(r)
      }
      if (grantUpdateCols) {
        for (const r of roles(grantUpdateCols[2])) {
          const cols = state.columnUpdate.get(r) ?? new Set<string>()
          for (const c of grantUpdateCols[1].split(',')) cols.add(c.trim())
          state.columnUpdate.set(r, cols)
        }
      } else if (grantUpdateAll) {
        for (const r of roles(grantUpdateAll[1])) state.tableWideUpdate.add(r)
      }
    }
  }
  return state
}

describe('spotlight_guestbook: the owner may only UPDATE hidden_at (SCAN-758)', () => {
  const state = replayUpdateGrants()

  it('authenticated holds no table-wide UPDATE', () => {
    expect([...state.tableWideUpdate]).not.toContain('authenticated')
  })

  it('anon holds no UPDATE at all', () => {
    expect([...state.tableWideUpdate]).not.toContain('anon')
    expect(state.columnUpdate.has('anon')).toBe(false)
  })

  it('authenticated holds column UPDATE on hidden_at and on no other column', () => {
    expect([...(state.columnUpdate.get('authenticated') ?? [])]).toEqual(['hidden_at'])
  })

  it('the revoke names the roles, not PUBLIC (ADR-959: a revoke from public removes nothing)', () => {
    const sql = codeOnly(
      readFileSync(join(DIR, '20270345011700_spotlight_guestbook_update_hidden_at_only.sql'), 'utf8'),
    )
    expect(sql).toMatch(/revoke\s+update\s+on\s+(?:table\s+)?public\.spotlight_guestbook\s+from\s+anon,\s*authenticated/)
    expect(sql).not.toMatch(/from\s+public\s*;/)
  })
})
