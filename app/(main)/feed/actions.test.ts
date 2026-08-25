import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// SCAN-210 · an announcement must land in a circle the author actually belongs to.
//
// THE DEFECT. `createPost` coerces an announcement to `cluster` visibility, then checked membership
// only for `group`. So the scope check that stops a crafted request naming someone else's circle
// never ran on the one post type that pins itself to the top and broadcasts beyond the circle. The
// host+ check above it proves the author may announce; it says nothing about WHERE.
//
// The database was not silent on this — `posts: insert (crew+ in scope)` requires, for `cluster`,
// `scope_id = ANY(private.get_my_circle_ids()) OR EXISTS (select 1 from circles c where
// c.id = posts.scope_id and c.host_id = private.get_my_profile_id())`. The action accepted exactly
// what the policy would refuse, and because it inserts through `createAdminClient()` the policy
// never ran to say so.
//
// SOURCE-SHAPE, per the house archetype, and for the reason that archetype exists: the failure is a
// missing branch, not a wrong value. Nothing observable changes when the check disappears — the post
// still saves — so no runtime test of a happy path would notice.

const ROOT = path.join(import.meta.dirname, '..', '..', '..')
const src = readFileSync(path.join(ROOT, 'app/(main)/feed/actions.ts'), 'utf8')

describe('createPost gates the circle scope', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(src.length).toBeGreaterThan(1000)
    expect(src).toContain('export async function createPost')
  })

  it('applies the scope check to cluster as well as group', () => {
    expect(
      /if \(visibility === 'group' \|\| visibility === 'cluster'\)/.test(src),
      'the scope check names only `group` again. Announcements are coerced to `cluster` at the top ' +
        'of createPost, so they fall straight past it and any host+ account can pin an announcement ' +
        'into any circle (SCAN-210).',
    ).toBe(true)
  })

  it('mirrors the policy: active membership OR hosting that circle', () => {
    expect(src).toContain(".eq('status', 'active')")
    expect(src).toMatch(/\.from\('circles'\)[\s\S]{0,120}\.eq\('host_id', profileId\)/)
    expect(src).toContain('if (!membership && !hosted)')
  })

  it('keeps the host+ check, which answers a different question', () => {
    // "May this account announce at all" and "may it announce HERE" are two gates, and collapsing
    // them back into one is how this reopens.
    expect(src).toContain('HOST_PLUS.includes')
    expect(src).toContain('Only hosts can post an announcement.')
  })

  it('still inserts through the admin client, which is why the check has to be here', () => {
    // If this ever became a caller-scoped client the policy would enforce the rule itself. It does
    // not, so the comment and the check are load-bearing.
    expect(src).toContain('createAdminClient()')
    expect(src).toContain('The admin client bypasses RLS')
  })
})
