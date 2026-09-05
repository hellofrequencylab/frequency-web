import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  canAdministerAchievements,
  canModeratePost,
  canReviewLibrarySubmission,
  isStaff,
} from './scope'

// L7-1..L7-4 · moderation reaches exactly as far as the policies say, and no further.
//
// Two halves. The UNIT half pins the pure decision: an author, platform staff, and a host inside a
// circle they host may act on a post; a host outside it may not, and neither may anyone who only
// holds a self-granted rung. The SOURCE-SHAPE half pins the three server actions to the helper,
// because the failure mode here is a missing branch: remove the scope check and every happy path
// still passes, the write still lands, and nothing observable changes except who was allowed.

const ME = 'caller-1'
const OTHER = 'author-2'
const MY_CIRCLE = 'circle-mine'
const THEIR_CIRCLE = 'circle-theirs'

const post = (author_id: string, scope_id: string | null) => ({ author_id, scope_id })

describe('canModeratePost · the three arms of the posts policies', () => {
  const asHost = { callerId: ME, communityRole: 'host' as const, webRole: 'none' as const, hostedCircleIds: [MY_CIRCLE] }

  it('the author, always, with no circle lookup needed', () => {
    expect(canModeratePost({ ...asHost, communityRole: 'member', hostedCircleIds: [], post: post(ME, THEIR_CIRCLE) })).toBe(true)
    expect(canModeratePost({ ...asHost, communityRole: 'member', hostedCircleIds: [], post: post(ME, null) })).toBe(true)
  })

  it('platform staff (web_role), anywhere, regardless of the community rung', () => {
    for (const webRole of ['admin', 'janitor'] as const) {
      expect(canModeratePost({ callerId: ME, communityRole: 'member', webRole, hostedCircleIds: [], post: post(OTHER, THEIR_CIRCLE) })).toBe(true)
      expect(canModeratePost({ callerId: ME, communityRole: 'member', webRole, hostedCircleIds: [], post: post(OTHER, null) })).toBe(true)
    }
  })

  it('a host INSIDE a circle they host', () => {
    expect(canModeratePost({ ...asHost, post: post(OTHER, MY_CIRCLE) })).toBe(true)
  })

  it('a host OUTSIDE their circles is refused (the L7-1 defect)', () => {
    expect(canModeratePost({ ...asHost, post: post(OTHER, THEIR_CIRCLE) })).toBe(false)
    expect(canModeratePost({ ...asHost, post: post(OTHER, null) })).toBe(false)
  })

  it('guide and mentor are hosts with more standing, not platform moderators', () => {
    for (const communityRole of ['guide', 'mentor'] as const) {
      expect(canModeratePost({ ...asHost, communityRole, post: post(OTHER, MY_CIRCLE) })).toBe(true)
      expect(canModeratePost({ ...asHost, communityRole, post: post(OTHER, THEIR_CIRCLE) })).toBe(false)
    }
  })

  it('the deprecated admin/janitor COMMUNITY rungs do not open the staff arm', () => {
    // ADR-208: staff lives on web_role. A community_role of 'janitor' with web_role 'none' is a
    // host+ on the ladder and gets the host arm only.
    for (const communityRole of ['admin', 'janitor'] as const) {
      expect(canModeratePost({ ...asHost, communityRole, post: post(OTHER, THEIR_CIRCLE) })).toBe(false)
      expect(canModeratePost({ ...asHost, communityRole, post: post(OTHER, MY_CIRCLE) })).toBe(true)
    }
  })

  it('a member with a hosted circle in the list but no host rung is still refused', () => {
    // The policy is host+ AND hosts the circle. The list alone is not a credential.
    expect(canModeratePost({ ...asHost, communityRole: 'member', post: post(OTHER, MY_CIRCLE) })).toBe(false)
  })

  it('a null or unknown role fails closed', () => {
    expect(canModeratePost({ ...asHost, communityRole: null, post: post(OTHER, MY_CIRCLE) })).toBe(false)
    expect(canModeratePost({ ...asHost, communityRole: undefined, webRole: undefined, post: post(OTHER, MY_CIRCLE) })).toBe(false)
  })
})

describe('canReviewLibrarySubmission · staff only, no creator arm', () => {
  it('admits platform staff', () => {
    expect(canReviewLibrarySubmission('admin')).toBe(true)
    expect(canReviewLibrarySubmission('janitor')).toBe(true)
  })
  it('refuses everyone else, including the absence of a role', () => {
    expect(canReviewLibrarySubmission('none')).toBe(false)
    expect(canReviewLibrarySubmission(null)).toBe(false)
    expect(canReviewLibrarySubmission(undefined)).toBe(false)
  })
})

describe('canAdministerAchievements · either staff axis, never the community ladder', () => {
  it('admits platform staff with no team_members row', () => {
    expect(canAdministerAchievements({ webRole: 'admin', staffRole: null })).toBe(true)
    expect(canAdministerAchievements({ webRole: 'janitor', staffRole: undefined })).toBe(true)
  })
  it('admits a team_members role that writes the community domain', () => {
    for (const staffRole of ['owner', 'admin', 'operations', 'support'] as const) {
      expect(canAdministerAchievements({ webRole: 'none', staffRole })).toBe(true)
    }
  })
  it('refuses a team_members role that only READS the community domain', () => {
    expect(canAdministerAchievements({ webRole: 'none', staffRole: 'analyst' })).toBe(false)
    expect(canAdministerAchievements({ webRole: 'none', staffRole: 'accounting' })).toBe(false)
  })
  it('honours the owner-editable override grid', () => {
    expect(canAdministerAchievements({ webRole: 'none', staffRole: 'support', overrides: { support: { community: 'read' } } })).toBe(false)
    expect(canAdministerAchievements({ webRole: 'none', staffRole: 'analyst', overrides: { analyst: { community: 'write' } } })).toBe(true)
  })
  it('refuses a non-staff caller outright (no community rung is consulted)', () => {
    expect(canAdministerAchievements({ webRole: 'none', staffRole: null })).toBe(false)
  })
})

describe('isStaff is the lib/core/roles definition, re-exported', () => {
  it('reads the web_role axis only', () => {
    expect(isStaff('admin')).toBe(true)
    expect(isStaff('janitor')).toBe(true)
    expect(isStaff('none')).toBe(false)
    expect(isStaff(null)).toBe(false)
  })
})

// ── The consumers ───────────────────────────────────────────────────────────────────────────
//
// Each action is pinned to the helper by shape. The greps below are the consequence probes: each
// fails if the scope check is removed, not merely if a word in a title changes.

const ROOT = path.join(import.meta.dirname, '..', '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

describe('the pure helper stays pure', () => {
  it('imports nothing from React, Next, or Supabase', () => {
    const src = read('lib/moderation/scope.ts')
    expect(src).not.toMatch(/from '(react|next\/|@supabase|@\/lib\/supabase)/)
  })
})

describe('feed/actions.ts · deletePost, pinPost, unpinPost ask canModeratePost', () => {
  const src = read('app/(main)/feed/actions.ts')

  it('imports the helper and reads the post before writing', () => {
    expect(src).toContain("import { canModeratePost } from '@/lib/moderation/scope'")
    expect(src).toMatch(/\.select\('author_id, scope_id'\)[\s\S]{0,80}\.eq\('id', postId\)/)
  })

  it('fetches the hosted circle ids by host_id, the column the policy reads', () => {
    expect(src).toMatch(/\.from\('circles'\)\.select\('id'\)\.eq\('host_id', profileId\)/)
  })

  it('every one of the three moderation writes is behind the gate', () => {
    for (const fn of ['deletePost', 'pinPost', 'unpinPost']) {
      const body = src.slice(src.indexOf(`export async function ${fn}(`))
      const gate = body.indexOf('canCallerModeratePost(admin, caller, postId)')
      const write = body.search(/\.from\('posts'\)\.(delete|update)\(/)
      expect(gate, `${fn} no longer asks canCallerModeratePost`).toBeGreaterThan(-1)
      expect(write, `${fn} lost its write`).toBeGreaterThan(-1)
      expect(gate, `${fn} writes before it asks`).toBeLessThan(write)
    }
  })

  it('no longer gates moderation on the self-granted ladder', () => {
    // HOST_PLUS still answers "may this account ANNOUNCE" in createPost (SCAN-210); it must not
    // answer "may this account moderate" anywhere else.
    // Count CODE uses only; the deletePost comment names the retired check for the record.
    const code = src.replace(/^\s*\/\/.*$/gm, '')
    const uses = code.split('HOST_PLUS.includes').length - 1
    expect(uses).toBe(1)
    const pinBlock = src.slice(src.indexOf('export async function pinPost('))
    expect(pinBlock).not.toContain('HOST_PLUS')
    expect(src).not.toContain("query = query.eq('author_id', caller.id)")
  })
})

describe('library/actions.ts · reviewContent is staff only', () => {
  const src = read('app/(main)/library/actions.ts')

  it('asks canReviewLibrarySubmission with the caller web_role', () => {
    expect(src).toContain("import { canReviewLibrarySubmission } from '@/lib/moderation/scope'")
    const body = src.slice(src.indexOf('export async function reviewContent('))
    expect(body).toContain('canReviewLibrarySubmission(caller.webRole)')
    expect(body.indexOf('canReviewLibrarySubmission')).toBeLessThan(body.indexOf(".from('practices').update("))
  })

  it('no longer admits the community ladder', () => {
    const body = src.slice(src.indexOf('export async function reviewContent('))
    expect(body).not.toMatch(/atLeastRole\(caller\.community_role, 'host'\)/)
  })
})

describe('crew/gamification-actions.ts · award/revoke are staff only', () => {
  const src = read('app/(main)/crew/gamification-actions.ts')

  it('asks canAdministerAchievements from one gate both actions call', () => {
    expect(src).toContain("import { canAdministerAchievements } from '@/lib/moderation/scope'")
    expect(src).toContain('canAdministerAchievements({ webRole: caller.webRole, staffRole: staff?.role })')
    for (const fn of ['awardAchievement', 'revokeAchievement']) {
      const body = src.slice(src.indexOf(`export async function ${fn}(`))
      const gate = body.indexOf('await requireAchievementAdmin()')
      const write = body.search(/\.from\('user_achievements'\)[\s\S]{0,40}\.(insert|delete)\(/)
      expect(gate, `${fn} no longer calls requireAchievementAdmin`).toBeGreaterThan(-1)
      expect(gate, `${fn} writes before it asks`).toBeLessThan(write)
    }
  })

  it('no longer lists community rungs as a credential', () => {
    expect(src).not.toMatch(/\[\s*'host',\s*'guide',\s*'mentor'/)
    expect(src).not.toMatch(/\.select\('community_role'\)/)
  })
})
