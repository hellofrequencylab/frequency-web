import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DISCOVERABLE_CIRCLE_VISIBILITY,
  LINKABLE_CIRCLE_VISIBILITY,
  asCircleVisibility,
  canJoinCircle,
  canViewCircle,
  isDiscoverableCircle,
  isLinkableCircle,
  type CircleViewerFacts,
} from './visibility'

// CIRCLE PRIVACY (ADR-1015 · C1). Three halves, and the last two are the ones that would have
// caught the bug this phase exists to fix:
//
//   1. THE PURE GATE — who may read a private Circle, who may join one.
//   2. THE READ-PATH RATCHET — every SERVICE-ROLE circle read that feeds a discovery surface must
//      carry a visibility filter IN ITS SOURCE. The service-role client holds BYPASSRLS, so the
//      RESTRICTIVE policy is invisible to all of them; a policy that is correct while one admin
//      -client query leaks is not correct. Each of these assertions FAILS on the pre-C1 tree.
//   3. THE MIGRATION SHAPE — the policy is RESTRICTIVE and `public_circle_by_id` stops resolving a
//      private circle. Asserted against the migration text because the SQL half runs in pgTAP
//      (supabase/tests/circle_privacy.test.sql), which needs a database this suite does not have.

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

const BASE: CircleViewerFacts = {
  visibility: 'private',
  hostId: 'host-1',
  viewerProfileId: 'stranger-1',
  isMember: false,
  isSpaceSteward: false,
  isPlatformStaff: false,
}

describe('the pure gate', () => {
  it('a private circle is closed to a signed-out visitor, a stranger, and a member of another circle', () => {
    expect(canViewCircle({ ...BASE, viewerProfileId: null })).toBe(false)
    expect(canViewCircle(BASE)).toBe(false)
    // "member of a different circle" is the same shape: isMember is per-circle, not global.
    expect(canViewCircle({ ...BASE, isMember: false })).toBe(false)
  })

  it('opens for the four seats that must have it, and only those', () => {
    expect(canViewCircle({ ...BASE, isMember: true })).toBe(true)
    expect(canViewCircle({ ...BASE, viewerProfileId: 'host-1' })).toBe(true)
    expect(canViewCircle({ ...BASE, isSpaceSteward: true })).toBe(true)
    expect(canViewCircle({ ...BASE, isPlatformStaff: true })).toBe(true)
  })

  it('narrows nothing that was open before: public and unlisted read as they always did', () => {
    expect(canViewCircle({ ...BASE, visibility: 'public', viewerProfileId: null })).toBe(true)
    expect(canViewCircle({ ...BASE, visibility: 'unlisted', viewerProfileId: null })).toBe(true)
  })

  it('a null host_id can never match a null viewer — the classic null-equals-null hole', () => {
    expect(canViewCircle({ ...BASE, hostId: null, viewerProfileId: null })).toBe(false)
  })

  it('discovery admits ONLY public; a direct link admits public and unlisted, never private', () => {
    expect(DISCOVERABLE_CIRCLE_VISIBILITY).toEqual(['public'])
    expect(LINKABLE_CIRCLE_VISIBILITY).toEqual(['public', 'unlisted'])
    expect(isDiscoverableCircle('unlisted')).toBe(false)
    expect(isDiscoverableCircle('private')).toBe(false)
    expect(isLinkableCircle('unlisted')).toBe(true)
    expect(isLinkableCircle('private')).toBe(false)
  })

  it('an unrecognised visibility reads as PRIVATE — a schema drift hides a circle, never publishes one', () => {
    expect(asCircleVisibility('secret')).toBe('private')
    expect(asCircleVisibility(42)).toBe('private')
    // A row from before the column existed carries no value at all; that one is public.
    expect(asCircleVisibility(undefined)).toBe('public')
    expect(asCircleVisibility(null)).toBe('public')
  })

  it('joining a private circle is invite-only, and the invite must be passed explicitly', () => {
    expect(canJoinCircle(BASE)).toEqual({ ok: false, reason: 'invite-only' })
    expect(canJoinCircle({ ...BASE, invited: true })).toEqual({ ok: true })
    expect(canJoinCircle({ ...BASE, viewerProfileId: null })).toEqual({ ok: false, reason: 'signed-out' })
    // Already inside, or authoritative over it: joining is a no-op, not a refusal.
    expect(canJoinCircle({ ...BASE, isMember: true })).toEqual({ ok: true })
    expect(canJoinCircle({ ...BASE, viewerProfileId: 'host-1' })).toEqual({ ok: true })
    // A public circle stays self-serve.
    expect(canJoinCircle({ ...BASE, visibility: 'public' })).toEqual({ ok: true })
  })
})

describe('the read-path ratchet — every service-role circle read that feeds a discovery surface', () => {
  // Each entry is a real leak on the pre-C1 tree: the file reads `circles` through the ADMIN
  // client (BYPASSRLS) and renders or returns the circle's NAME to somebody who is not a member.
  const DISCOVERY_READS: [file: string, why: string][] = [
    ['app/api/search-scopes/route.ts', 'the event-placement / collaborator picker'],
    ['components/sidebar/rail-panels.tsx', 'the "circles to explore" and "newest circles" rails'],
    ['components/widgets/top-circles.tsx', 'the "active circles" page module'],
    ['lib/ai/vera/read-tools.ts', 'Vera naming a circle and its host out loud'],
  ]

  for (const [file, why] of DISCOVERY_READS) {
    it(`${file} filters on visibility (${why})`, () => {
      const src = read(file)
      expect(src).toContain('CIRCLE_VISIBILITY')
      expect(src).toMatch(/\.in\('visibility',/)
    })
  }

  it('the circle detail shell gates PRIVATE circles itself, because it reads through the admin client', () => {
    const src = read('lib/circles/store.ts')
    expect(src).toContain('viewerMayReadPrivateCircle')
    expect(src).toMatch(/asCircleVisibility\(.*\) === 'private'/)
    // The gate is viewer-scoped, so a cross-request cache would poison it. React cache() only.
    expect(src).not.toMatch(/unstable_cache\s*\(/)
  })

  it('joinCircle refuses a private circle unless the caller was invited', () => {
    const src = read('app/(main)/circles/actions.ts')
    expect(src).toContain("asCircleVisibility(row.visibility) === 'private'")
    expect(src).toContain('opts?.invited !== true')
  })

  it('the QR route is the ONLY caller that passes invited: true', () => {
    const qr = read('app/q/[slug]/route.ts')
    expect(qr).toContain('{ invited: true }')
    for (const f of ['components/circles/join-circle-button.tsx', 'app/onboarding/vera-actions.ts']) {
      expect(read(f)).not.toContain('invited: true')
    }
  })

  it('the public stat surfaces stop counting private circles', () => {
    for (const f of ['app/llms.txt/route.ts', 'components/widgets/community-pulse.tsx']) {
      expect(read(f)).toContain('LINKABLE_CIRCLE_VISIBILITY')
    }
  })
})

describe('the migration shape', () => {
  const sql = read('supabase/migrations/20270227000000_circle_privacy.sql')

  it('the visibility policy is RESTRICTIVE — a PERMISSIVE one would OR against the identity-free legacy read policy', () => {
    expect(sql).toMatch(/create policy "circles_visibility_restrictive"[\s\S]*?as restrictive[\s\S]*?for select/)
  })

  it('public_circle_by_id stops resolving a PRIVATE circle while still resolving an unlisted one', () => {
    const start = sql.indexOf('FUNCTION public.public_circle_by_id')
    const body = sql.slice(start, sql.indexOf('CREATE OR REPLACE FUNCTION', start + 1))
    expect(body).toContain("c.visibility <> 'private'")
    // NOT `= 'public'`: an unlisted circle must keep resolving by direct link. That contract was
    // set deliberately by 20261157000000 and C1 does not revisit it.
    expect(body).not.toContain("c.visibility = 'public'")
  })

  it('every other circle-naming RPC carries the filter too', () => {
    for (const fn of ['public_circles', 'circles_near', 'public_active_circle_count', 'circle_momentum']) {
      expect(sql).toContain(fn)
    }
    expect(sql).toMatch(/circles_near[\s\S]*?c\.visibility = 'public'/)
    expect(sql).toMatch(/circle_momentum[\s\S]*?private\.can_view_circle/)
  })

  it('the nonsense cells are refused by the database, not by the UI', () => {
    expect(sql).toContain('circles_visibility_check')
    expect(sql).toContain('circles_visibility_unlisted_mirror_check')
    expect(sql).toContain('circle_link_cross_tenant')
    expect(sql).toContain('circle_link_plan_floor')
  })
})
