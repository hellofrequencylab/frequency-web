import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The `pages` table (the Puck micro-site store) is keyed by (space_id, slug) in the app and,
// as of 20270209000000, in the database too. Those two halves must not drift: an upsert whose
// onConflict names a column set with no backing UNIQUE key either errors at runtime (Postgres
// 42P10) or — the failure ADR-927 flagged — resolves against another Space's row and overwrites
// its published document. Neither half is reachable from a unit test (server action + service-role
// client), so this guards the contract at the source level, the same way lib/listings/housing.test.ts
// guards the housing vocabularies against their CHECK constraints.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

const migration = read('supabase/migrations/20270209000000_pages_space_slug_unique.sql')
const editActions = read('app/(main)/edit/actions.ts')
const dataLayer = read('lib/page-editor/data.ts')

/** Source with `//` comments stripped — a prose mention of the old key must not satisfy (or trip)
 *  a guard that is about what the code actually does. */
const code = (src: string) =>
  src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

const editActionsCode = code(editActions)

describe('pages is keyed by (space_id, slug) in the database', () => {
  it('adds the composite unique constraint', () => {
    expect(migration).toMatch(
      /add constraint pages_space_id_slug_key unique nulls not distinct \(space_id, slug\)/,
    )
  })

  it('treats NULL space_id as one tenant, since space_id is still nullable', () => {
    // Under the default NULLS DISTINCT rule, two untenanted rows could both claim slug 'about'
    // and reopen the hole. Drop this only when space_id becomes NOT NULL.
    expect(migration).toContain('unique nulls not distinct')
  })

  it('drops the global unique on slug that made two Spaces collide', () => {
    expect(migration).toMatch(/alter table public\.pages drop constraint pages_slug_key/)
  })

  it('adds the new key BEFORE dropping the old one, so slugs are never unprotected', () => {
    expect(migration.indexOf('add constraint pages_space_id_slug_key')).toBeLessThan(
      migration.indexOf('drop constraint pages_slug_key'),
    )
  })

  it('ships a pre-flight duplicate check and no dedupe, so it aborts rather than destroys data', () => {
    expect(migration).toMatch(/group by space_id, slug\s*\n--\s*having count\(\*\) > 1;/)
    // A tightening migration must never quietly delete a page to make room for the constraint.
    expect(migration).not.toMatch(/^\s*delete from public\.pages/im)
  })

  it('is idempotent — every DDL step is existence-guarded', () => {
    expect(migration).toContain('if not exists (')
    expect(migration).toContain('if exists (')
    expect(migration).toContain('drop index if exists public.pages_space_slug_idx')
  })
})

describe('the app writes pages on the same key', () => {
  it('publishPage upserts onConflict space_id,slug', () => {
    expect(editActionsCode).toContain("onConflict: 'space_id,slug'")
  })

  it('never falls back to the single-tenant onConflict slug', () => {
    expect(editActionsCode).not.toMatch(/onConflict:\s*'slug'/)
  })

  it('publishPage sends space_id in the upsert payload', () => {
    // onConflict can only resolve on a column the payload actually carries.
    expect(editActionsCode).toMatch(/space_id: sid/)
  })

  it('unpublishPage scopes its update by BOTH columns', () => {
    expect(editActionsCode).toMatch(/\.eq\('slug', slug\)\.eq\('space_id', sid\)/)
  })
})

describe('the app reads pages on the same key', () => {
  it('getPage filters by space_id and slug', () => {
    expect(dataLayer).toMatch(/\.eq\('space_id', sid\)\.eq\('slug', slug\)/)
  })

  it('listPages filters by space_id', () => {
    expect(dataLayer).toMatch(/\.eq\('space_id', sid\)/)
  })

  it('every read resolves a tenant first and fails safe when there is none', () => {
    expect(dataLayer).toContain('const sid = await resolveSpaceId(spaceId)')
    expect(dataLayer).toMatch(/if \(!sid\) return/)
  })
})
