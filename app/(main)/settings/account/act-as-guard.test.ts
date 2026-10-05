import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// STAFF ACTING AS A MEMBER CANNOT DELETE THEM UNSEEN (SCAN-748).
//
// Act-as swaps the janitor's session for the member's, so every member-scoped action resolves as
// the member. ADR-426 said account delete was member-inaccessible and therefore out of reach; it is
// on Settings > Account. The delete action refuses while the act-as stash is present, and the data
// export attributes itself to the staff actor in the admin audit log. Read statically: the
// assertion is that both actions consult the stash at all, which is the thing that was missing.

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')

describe('settings account actions under act-as', () => {
  it('deleteAccountAction refuses while the act-as stash is present', () => {
    const src = read('./actions.ts')
    expect(src).toContain("import { readImpersonation } from '@/lib/impersonation'")
    const body = src.slice(src.indexOf('export async function deleteAccountAction'))
    expect(body).toMatch(/if \(await readImpersonation\(\)\) \{\s*return fail\(/)
    // The refusal sits BEFORE the delete.
    expect(body.indexOf('readImpersonation()')).toBeLessThan(body.indexOf('deleteMyAccount()'))
  })

  it('downloadMyData attributes an act-as export to the staff actor', () => {
    const src = read('./export-actions.ts')
    expect(src).toContain('readImpersonation')
    expect(src).toMatch(/action: 'impersonation\.export'/)
  })
})
