import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  accessModeOptions,
  CIRCLE_ACCESS_HINT,
  CIRCLE_ACCESS_LABEL,
  CIRCLE_ACCESS_LIMIT_NOTE,
  CIRCLE_ACCESS_MODES,
  SPACE_ONLY_ACCESS_MODES,
  SPACE_SELLING_PLANS,
  asCircleAccess,
  availableAccessModes,
  canEnterCircle,
  canJoinCircle,
  canSeeCircle,
  isListedCircle,
  type CircleViewerFacts,
} from './visibility'

// CIRCLE PRIVACY — TWO AXES (ADR-1015 · C1).
//
// The owner ruled that DISCOVERABILITY and ACCESS are independent, because a single ordered
// public/unlisted/private enum cannot express the cell they named: a LISTED CLOSED circle, found in
// the index by name so a stranger can join or buy, with the roster and posts shut. So the two
// headline cases below are:
//
//   LISTED + CLOSED    → can SEE (it is a lead funnel), cannot ENTER
//   UNLISTED + CLOSED  → can neither SEE nor ENTER
//
// Three halves, and the last two would have caught the bug this phase exists to fix:
//   1. THE PURE GATES — canSee / canEnter / canJoin across both axes.
//   2. THE READ-PATH RATCHET — every SERVICE-ROLE circle read that feeds a discovery surface must
//      carry an axis-1 filter IN ITS SOURCE. The service-role client holds BYPASSRLS, so the
//      RESTRICTIVE policy is invisible to all of them. Each assertion FAILS on the pre-C1 tree.
//   3. THE MIGRATION SHAPE — the policy is RESTRICTIVE, and each RPC asks the RIGHT question of
//      the two. Asserted against the migration text because the SQL half runs in pgTAP
//      (supabase/tests/circle_privacy.test.sql), which needs a database this suite does not have.

const root = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/** A stranger looking at a LISTED closed circle — the lead funnel. */
const LISTED_CLOSED: CircleViewerFacts = {
  unlisted: false,
  access: 'circle_members',
  hostId: 'host-1',
  viewerProfileId: 'stranger-1',
  isMember: false,
  isSpaceMember: false,
  isSpaceSteward: false,
  isPlatformStaff: false,
}

/** The same circle, taken out of discovery — the fully hidden one. */
const UNLISTED_CLOSED: CircleViewerFacts = { ...LISTED_CLOSED, unlisted: true }

describe('the two axes are independent', () => {
  it('LISTED + CLOSED: a stranger SEES it and cannot ENTER — this cell is the lead funnel', () => {
    expect(canSeeCircle(LISTED_CLOSED)).toBe(true)
    expect(canEnterCircle(LISTED_CLOSED)).toBe(false)
  })

  it('UNLISTED + CLOSED: a stranger sees neither that it exists nor what is in it', () => {
    expect(canSeeCircle(UNLISTED_CLOSED)).toBe(false)
    expect(canEnterCircle(UNLISTED_CLOSED)).toBe(false)
  })

  it('UNLISTED + OPEN keeps the 2026-11 direct-link contract: out of discovery, still resolves', () => {
    const unlistedOpen = { ...UNLISTED_CLOSED, access: 'open' as const }
    expect(canSeeCircle(unlistedOpen)).toBe(true)
    expect(canEnterCircle(unlistedOpen)).toBe(true)
    expect(isListedCircle(unlistedOpen.unlisted)).toBe(false)
  })

  it('LISTED + OPEN — today, unchanged, even signed out', () => {
    const open = { ...LISTED_CLOSED, access: 'open' as const, viewerProfileId: null }
    expect(canSeeCircle(open)).toBe(true)
    expect(canEnterCircle(open)).toBe(true)
  })

  it('every one of the four cells is reachable — the proof the axes did not collapse', () => {
    const cells = [
      [false, 'open'],
      [false, 'circle_members'],
      [true, 'open'],
      [true, 'circle_members'],
    ] as const
    const seen = cells.map(([unlisted, access]) =>
      canSeeCircle({ ...LISTED_CLOSED, unlisted, access }),
    )
    expect(seen).toEqual([true, true, true, false])
  })
})

describe('canEnterCircle — the content question', () => {
  it('opens for the member, the Host, a Space steward and platform staff', () => {
    expect(canEnterCircle({ ...UNLISTED_CLOSED, isMember: true })).toBe(true)
    expect(canEnterCircle({ ...UNLISTED_CLOSED, viewerProfileId: 'host-1' })).toBe(true)
    expect(canEnterCircle({ ...UNLISTED_CLOSED, isSpaceSteward: true })).toBe(true)
    expect(canEnterCircle({ ...UNLISTED_CLOSED, isPlatformStaff: true })).toBe(true)
  })

  it("the owner's own example: space_members lets a Space member in, and ONLY in that mode", () => {
    const spaceMember = { ...LISTED_CLOSED, isSpaceMember: true }
    expect(canEnterCircle({ ...spaceMember, access: 'space_members' })).toBe(true)
    // Space membership is NOT a general key to a Space's Circles.
    for (const access of ['circle_members', 'invite', 'tier'] as const) {
      expect(canEnterCircle({ ...spaceMember, access })).toBe(false)
    }
  })

  it('a null host_id can never match a null viewer — the classic null-equals-null hole', () => {
    expect(canEnterCircle({ ...UNLISTED_CLOSED, hostId: null, viewerProfileId: null })).toBe(false)
  })

  it('an unrecognised access mode reads CLOSED — a schema drift shuts a Circle, never opens one', () => {
    expect(asCircleAccess('whatever')).toBe('circle_members')
    expect(asCircleAccess(7)).toBe('circle_members')
    // A row from before the column existed has no value at all; that one behaved as open.
    expect(asCircleAccess(undefined)).toBe('open')
    expect(asCircleAccess(null)).toBe('open')
  })

  it('space_members and tier are the modes that need a real owning Space', () => {
    expect([...SPACE_ONLY_ACCESS_MODES]).toEqual(['space_members', 'tier'])
    expect(CIRCLE_ACCESS_MODES).toHaveLength(5)
  })
})

describe('canJoinCircle — each closed mode has its own door, and the default is deny', () => {
  it('open stays self-serve; signed out is refused before anything else', () => {
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'open' })).toEqual({ ok: true })
    expect(canJoinCircle({ ...LISTED_CLOSED, viewerProfileId: null })).toEqual({
      ok: false,
      reason: 'signed-out',
    })
  })

  it('a listed closed circle refuses a stranger with a reason the UI can act on', () => {
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'invite' })).toEqual({ ok: false, reason: 'invite-only' })
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'tier' })).toEqual({ ok: false, reason: 'paid' })
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'space_members' })).toEqual({
      ok: false,
      reason: 'space-members-only',
    })
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'circle_members' })).toEqual({ ok: false, reason: 'closed' })
  })

  it('the invite is passed explicitly, never inferred', () => {
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'invite', invited: true })).toEqual({ ok: true })
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'invite' })).toEqual({ ok: false, reason: 'invite-only' })
  })

  it('a Space member walks into a space_members circle; already-inside is a no-op, not a refusal', () => {
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'space_members', isSpaceMember: true })).toEqual({ ok: true })
    expect(canJoinCircle({ ...LISTED_CLOSED, isMember: true })).toEqual({ ok: true })
    expect(canJoinCircle({ ...LISTED_CLOSED, viewerProfileId: 'host-1' })).toEqual({ ok: true })
  })

  it('joining does NOT consult axis 1 — a listed closed circle refuses exactly like an unlisted one', () => {
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'invite' })).toEqual(
      canJoinCircle({ ...UNLISTED_CLOSED, access: 'invite' }),
    )
  })
})

describe('the read-path ratchet — every service-role circle read that feeds a discovery surface', () => {
  // Each entry is a real leak on the pre-C1 tree: the file reads `circles` through the ADMIN
  // client (BYPASSRLS) and renders or returns the circle's NAME to somebody who is not a member.
  // They key on AXIS 1: a LISTED closed circle SHOULD appear (the funnel), an unlisted one never.
  const DISCOVERY_READS: [file: string, why: string][] = [
    ['app/api/search-scopes/route.ts', 'the event-placement / collaborator picker'],
    // ⚠️ MISSED BY C1's OWN SWEEP, found 2026-08-12 while scoping the map page. The list above was
    // assembled by searching for circle reads in components and lib; this one is inline in a PAGE,
    // in a Promise.all beside four unrelated queries, which is exactly the shape a grep for
    // "circles" in the usual places walks past. 2 of the 7 circles in production are unlisted and
    // this list takes the 5 newest with no filter at all, so it was leaking today, not latently.
    ['app/(main)/nearby/page.tsx', 'the "new circles to join" list and the circle count tile'],
    // The map layer added beside that list. It reads `circles` through the same service-role
    // client, and a pin says MORE than a list row does: it publishes the circle's PLACE. It joins
    // the ratchet on the day it is written rather than on the day somebody notices, which is the
    // whole lesson of the entry above it.
    ['lib/nearby/map-pins.ts', 'the Around You map circle pins'],
    ['components/sidebar/rail-panels.tsx', 'the "circles to explore" and "newest circles" rails'],
    ['components/widgets/top-circles.tsx', 'the "active circles" page module'],
    ['lib/ai/vera/read-tools.ts', 'Vera naming a circle and its host out loud'],
    ['app/(main)/channels/[id]/page.tsx', 'the Interest page listing the circles inside it'],
    ['components/widgets/channels/channels-list.tsx', 'the per-Interest circle count'],
    ['components/widgets/community/structure.tsx', 'the community structure totals'],
    ['app/llms.txt/route.ts', 'the machine-readable community stats'],
    ['components/widgets/community-pulse.tsx', 'the community pulse count'],
  ]

  for (const [file, why] of DISCOVERY_READS) {
    it(`${file} filters on the discoverability axis (${why})`, () => {
      const src = read(file)
      expect(src).toMatch(/\.eq\('unlisted', false\)/)
      expect(src).toContain('ADR-1015')
    })
  }

  it('the circle detail shell answers BOTH questions, because it reads through the admin client', () => {
    const src = read('lib/circles/store.ts')
    expect(src).toContain('resolveCircleViewer')
    // Existence → null → the caller's existing 404.
    expect(src).toContain('if (!verdict.canSee) return null')
    // Content → the roster is redacted, not the whole page. This IS the funnel.
    expect(src).toContain('members: canEnter ? members : []')
    expect(src).toContain('canEnter: boolean')
    // The gate is viewer-scoped, so a cross-request cache would poison it. React cache() only.
    expect(src).not.toMatch(/unstable_cache\s*\(/)
  })

  it('the feed origin chip drops a hidden circle it would otherwise name', () => {
    const src = read('lib/feed/post-origin.ts')
    expect(src).toContain('isListedCircle')
    expect(src).toContain('myHiddenIds')
  })

  it('joinCircle gates on ACCESS, and refuses every closed mode with one identical string', () => {
    const src = read('app/(main)/circles/actions.ts')
    expect(src).toContain('canJoinCircle')
    expect(src).toContain("if (access !== 'open')")
    // Exactly one refusal string in the access gate — a per-mode message would confirm the circle
    // exists and hint at its shape.
    const gate = src.slice(src.indexOf("if (access !== 'open')"), src.indexOf('member_count >= circle.member_cap'))
    expect(gate.match(/return fail\(/g) ?? []).toHaveLength(1)
  })

  it('the QR route is the ONLY caller that passes invited: true', () => {
    expect(read('app/q/[slug]/route.ts')).toContain('{ invited: true }')
    for (const f of ['components/circles/join-circle-button.tsx', 'app/onboarding/vera-actions.ts']) {
      expect(read(f)).not.toContain('invited: true')
    }
  })

  it('the /circles index keeps LISTED closed circles — filtering them out would delete the funnel', () => {
    const src = read('lib/circles/index-data.ts')
    expect(src).toContain('isListedCircle(c.unlisted)')
    // It must NOT consult access: that would drop the lead funnel from the index.
    expect(src).not.toContain('canEnterCircle')
  })
})

describe('the migration shape', () => {
  const sql = read('supabase/migrations/20270227000000_circle_privacy.sql')

  it('the access policy is RESTRICTIVE — a PERMISSIVE one would OR against the identity-free legacy read policy', () => {
    expect(sql).toMatch(/create policy "circles_access_restrictive"[\s\S]*?as restrictive[\s\S]*?for select/)
  })

  it('it introduces exactly ONE new column, and it is the access axis — `unlisted` is untouched', () => {
    expect(sql).toMatch(/add column if not exists access text not null default 'open'/)
    expect(sql).not.toMatch(/add column if not exists (unlisted|visibility)/)
  })

  it('each RPC asks the right one of the two questions', () => {
    const between = (fn: string) => {
      const start = sql.indexOf(`FUNCTION public.${fn}(`)
      expect(start).toBeGreaterThan(-1)
      return sql.slice(start, sql.indexOf('$$;', start))
    }
    // Discovery lists key on AXIS 1, so a LISTED closed circle still appears (the funnel).
    expect(between('public_circles')).toContain('NOT c.unlisted')
    expect(between('circles_near')).toContain('not c.unlisted')
    expect(between('public_active_circle_count')).toContain('NOT unlisted')
    // The landing page asks EXISTENCE, so a listed closed circle resolves and a hidden one does not.
    expect(between('public_circle_by_id')).toContain('private.can_see_circle')
    // Momentum is roster-shaped intelligence, so it asks CONTENT.
    expect(between('circle_momentum')).toContain('private.can_enter_circle')
  })

  it('the feed keys on EXISTENCE, not entry — a listed closed circle keeps its public posts', () => {
    expect(sql).toContain('private.post_scope_discoverable')
    expect(sql).toMatch(/post_scope_discoverable[\s\S]*?not private\.can_see_circle/)
    for (const fn of ['feed_for_viewer', 'scoped_feed_for_viewer']) {
      const start = sql.indexOf(`FUNCTION public.${fn}(`)
      expect(sql.slice(start, start + 6000)).toContain('private.post_scope_discoverable(p.scope_id)')
    }
  })

  it('the nonsense cells are refused by the database, not by the UI', () => {
    expect(sql).toContain('circles_access_check')
    expect(sql).toContain('circle_access_needs_space')
    expect(sql).toContain('circle_access_plan_floor')
    expect(sql).toContain('circle_link_cross_tenant')
    expect(sql).toContain('circle_link_plan_floor')
  })

  it('nothing ties price to discoverability in either direction — the owner chooses per Circle', () => {
    // The strong form: the trigger that governs selling never reads the discoverability axis at
    // all, so it cannot force a paid Circle to be listed OR to be unlisted.
    const start = sql.indexOf('create or replace function public.enforce_membership_tier_circle_link()')
    expect(start).toBeGreaterThan(-1)
    const body = sql.slice(start, sql.indexOf('$$;', start))
    expect(body).not.toContain('unlisted')
    expect(sql).toContain('a paid Circle may be a listed shopfront or an unlisted room')
  })
})

// ── WHAT THE FORM MAY OFFER ────────────────────────────────────────────────────────────────────
//
// C1 shipped the enforcement and no control, so every Circle sat on the backfilled `open` and the
// owner's verdict was "I see ZERO changes and can't find the settings". That was correct: the
// access axis had no UI anywhere. These cover the helper that decides what the settings form is
// allowed to offer.
//
// The rule this encodes: NEVER OFFER A CHOICE THE DATABASE WILL REFUSE. `trg_circles_access_shape`
// raises on two combinations, and to an operator a raised trigger reads as a broken save button,
// not as a rule. So the form narrows, the trigger enforces, and the two lists come from one place.
describe('availableAccessModes — the form offers only what the trigger will accept', () => {
  const ROOT = { type: 'root', plan: null }
  const FREE_BIZ = { type: 'business', plan: 'free' }
  const PAID_BIZ = { type: 'business', plan: 'business' }

  it('a PERSONAL circle gets the three modes that need no Space', () => {
    expect(availableAccessModes(ROOT)).toEqual(['open', 'circle_members', 'invite'])
  })

  it('a circle with no Space row at all is treated as personal, not as an error', () => {
    expect(availableAccessModes(null)).toEqual(['open', 'circle_members', 'invite'])
  })

  it('a FREE Space gets space_members but NOT tier — it has a roster to admit from, and nothing to sell with', () => {
    expect(availableAccessModes(FREE_BIZ)).toContain('space_members')
    expect(availableAccessModes(FREE_BIZ)).not.toContain('tier')
  })

  it('a Space on a selling plan gets all five', () => {
    expect(availableAccessModes(PAID_BIZ)).toEqual([...CIRCLE_ACCESS_MODES])
  })

  it('every offered mode has a label and a hint, so the control can never render a bare enum', () => {
    for (const mode of CIRCLE_ACCESS_MODES) {
      expect(CIRCLE_ACCESS_LABEL[mode]?.length).toBeGreaterThan(0)
      expect(CIRCLE_ACCESS_HINT[mode]?.length).toBeGreaterThan(0)
      // docs/CONTENT-VOICE.md: no em dashes in anything a member reads.
      expect(CIRCLE_ACCESS_LABEL[mode]).not.toContain('—')
      expect(CIRCLE_ACCESS_HINT[mode]).not.toContain('—')
    }
  })

  it('the TS plan list matches private.space_can_sell, because two lists of plan names drift silently', () => {
    const sql = read('supabase/migrations/20270227000000_circle_privacy.sql')
    const start = sql.indexOf('function private.space_can_sell')
    const body = sql.slice(start, sql.indexOf('$$;', start))
    for (const plan of SPACE_SELLING_PLANS) {
      expect(body).toContain(`'${plan}'`)
    }
    // And the other direction: a plan added to the SQL must reach the UI, or the form quietly
    // stops offering `tier` to a Space that is paying for it. Scoped to the plan IN-list rather
    // than the whole body, which also contains 'public'/'private'/'pg_temp' from the search_path
    // and 'root' from the type check.
    const listStart = body.indexOf("coalesce(s.plan, 'free') in (")
    expect(listStart).toBeGreaterThan(-1)
    // Start INSIDE the IN-list's paren: slicing from `listStart` stops at the close paren of
    // `coalesce(...)`, which lands before the plans and matches nothing.
    const open = body.indexOf('in (', listStart) + 'in ('.length
    const planList = body.slice(open, body.indexOf(')', open))
    const inSql = [...planList.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).filter((p) => p !== 'free')
    expect(inSql.length).toBeGreaterThan(0)
    for (const plan of new Set(inSql)) {
      expect(SPACE_SELLING_PLANS).toContain(plan)
    }
  })
})

// accessModeOptions — what a PICKER lists, which is not quite what may be SET.
describe('accessModeOptions — the list a picker renders', () => {
  const ROOT = { type: 'root', plan: null }
  const FREE_BIZ = { type: 'business', plan: 'free' }
  const PAID_BIZ = { type: 'business', plan: 'business' }

  it('matches availableAccessModes when the circle already sits on an available mode', () => {
    expect(accessModeOptions(ROOT, 'open')).toEqual([...availableAccessModes(ROOT)])
    expect(accessModeOptions(PAID_BIZ, 'tier')).toEqual([...availableAccessModes(PAID_BIZ)])
  })

  it('keeps a mode the circle is ALREADY on, even once the Space may no longer choose it', () => {
    // A Space that drops off a selling plan keeps its `tier` circles as they stand. Hiding the
    // current mode would make the select claim the circle is something it is not, and the next
    // save would change access nobody asked to change.
    expect(availableAccessModes(FREE_BIZ)).not.toContain('tier')
    expect(accessModeOptions(FREE_BIZ, 'tier')).toContain('tier')
  })

  it('lists in the canonical order, so an added mode never lands in a different slot per Space', () => {
    const listed = accessModeOptions(FREE_BIZ, 'tier')
    expect(listed).toEqual(CIRCLE_ACCESS_MODES.filter((m) => listed.includes(m)))
  })

  it('still never offers a Space mode to a personal circle', () => {
    expect(accessModeOptions(ROOT, 'circle_members')).toEqual(['open', 'circle_members', 'invite'])
  })

  it('the limit note is member-facing copy, not a schema sentence', () => {
    expect(CIRCLE_ACCESS_LIMIT_NOTE.length).toBeGreaterThan(0)
    expect(CIRCLE_ACCESS_LIMIT_NOTE).not.toContain('—')
    expect(CIRCLE_ACCESS_LIMIT_NOTE).not.toContain('_')
  })
})
