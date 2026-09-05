import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sourceWithoutComments } from '@/test/source-shape'
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
  isSpacePaidMember: false,
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

  it('space_members lets a TEAM seat in, and ONLY in that mode (OWN-034 ruling C: staff semantics)', () => {
    const teamSeat = { ...LISTED_CLOSED, isSpaceMember: true }
    expect(canEnterCircle({ ...teamSeat, access: 'space_members' })).toBe(true)
    // A seat is NOT a general key to a Space's Circles — and NOT a membership either.
    for (const access of ['circle_members', 'space_paid_members', 'invite', 'tier'] as const) {
      expect(canEnterCircle({ ...teamSeat, access })).toBe(false)
    }
  })

  it('space_paid_members lets a PAYING member in, and ONLY in that mode (OWN-034 ruling C: the added mode)', () => {
    const payer = { ...LISTED_CLOSED, isSpacePaidMember: true }
    expect(canEnterCircle({ ...payer, access: 'space_paid_members' })).toBe(true)
    // 🔴 THE RULING'S BOUNDARY: a paid membership does not open the team's room...
    expect(canEnterCircle({ ...payer, access: 'space_members' })).toBe(false)
    // ...and is not a general key to anything else the Space runs.
    for (const access of ['circle_members', 'invite', 'tier'] as const) {
      expect(canEnterCircle({ ...payer, access })).toBe(false)
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

  it('the two Space audiences and tier are the modes that need a real owning Space', () => {
    expect([...SPACE_ONLY_ACCESS_MODES]).toEqual(['space_members', 'space_paid_members', 'tier'])
    expect(CIRCLE_ACCESS_MODES).toHaveLength(6)
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
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'space_paid_members' })).toEqual({
      ok: false,
      reason: 'membership-only',
    })
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'circle_members' })).toEqual({ ok: false, reason: 'closed' })
  })

  it('the invite is passed explicitly, never inferred', () => {
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'invite', invited: true })).toEqual({ ok: true })
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'invite' })).toEqual({ ok: false, reason: 'invite-only' })
  })

  it('each Space audience walks into ITS mode; already-inside is a no-op, not a refusal', () => {
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'space_members', isSpaceMember: true })).toEqual({ ok: true })
    expect(
      canJoinCircle({ ...LISTED_CLOSED, access: 'space_paid_members', isSpacePaidMember: true }),
    ).toEqual({ ok: true })
    // And never into the OTHER one — the OWN-034 boundary, at the join door.
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'space_members', isSpacePaidMember: true })).toEqual({
      ok: false,
      reason: 'space-members-only',
    })
    expect(canJoinCircle({ ...LISTED_CLOSED, access: 'space_paid_members', isSpaceMember: true })).toEqual({
      ok: false,
      reason: 'membership-only',
    })
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
  // ⚠️ TWO ENTRIES LEFT THIS LIST on 2026-08-24, and the reason matters: components/widgets/
  // top-circles.tsx and components/widgets/community-pulse.tsx were DELETED (LIVE-067). Both were
  // page modules registered only under the global '*' key, which no page mounts — so each was a
  // service-role circle read that had been correctly filtered here and rendered to nobody. Removing
  // a row because its file is gone is the only safe reason to shrink this list; a row whose file
  // still exists must be fixed, never dropped.
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
    ['lib/ai/vera/read-tools.ts', 'Vera naming a circle and its host out loud'],
    ['app/(main)/channels/[id]/page.tsx', 'the Interest page listing the circles inside it'],
    ['components/widgets/channels/channels-list.tsx', 'the per-Interest circle count'],
    ['components/widgets/community/structure.tsx', 'the community structure totals'],
    ['app/llms.txt/route.ts', 'the machine-readable community stats'],
  ]

  for (const [file, why] of DISCOVERY_READS) {
    it(`${file} filters on the discoverability axis (${why})`, () => {
      const src = read(file)
      expect(src).toMatch(/\.eq\('unlisted', false\)/)
      // Doc-pin (scan2 L8-05): the ADR marker is a comment in the source, pinned on purpose.
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
    // The CALL, on comment- and import-free source (scan2 L8-04): the import line alone would
    // otherwise satisfy this with the filter deleted.
    expect(sourceWithoutComments(join(root, 'lib/feed/post-origin.ts'), { imports: true })).toContain(
      '!isListedCircle(c.unlisted)',
    )
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

// ── OWN-034 RULING C (ADR-1092): two Space audiences, two modes ────────────────────────────────
//
// The owner ruled that `space_members` KEEPS the staff ladder and the paying audience gets its
// own mode. ADR-1021 had (correctly, for its day) pointed the `space_members` DB arm at a
// staff-OR-paid union; the ruling retires the union. These assert the migration that carries the
// ruling, because the SQL half runs only in pgTAP (supabase/tests/circle_space_paid_members.
// test.sql), which needs a database this suite does not have.
describe('the space_paid_members migration shape (OWN-034 ruling C)', () => {
  const sql = read('supabase/migrations/20270319000000_circle_space_paid_members.sql')

  it('the access axis carries the sixth value, and the TS list matches it', () => {
    expect(sql).toMatch(
      /check \(access in \('open', 'circle_members', 'space_members', 'space_paid_members', 'invite', 'tier'\)\)/,
    )
    // One list per layer, same members: a value added to the CHECK must reach the UI and back.
    for (const mode of CIRCLE_ACCESS_MODES) {
      expect(sql).toContain(`'${mode}'`)
    }
  })

  it('space_members is back on the STAFF predicate, and the paid mode has its own', () => {
    const start = sql.indexOf('create or replace function private.can_enter_circle')
    expect(start).toBeGreaterThan(-1)
    const body = sql.slice(start, sql.indexOf('$$;', start))
    expect(body).toContain("= 'space_members' and private.is_space_member(p_space_id)")
    expect(body).toContain("= 'space_paid_members' and private.is_space_paid_member(p_space_id)")
    // The union predicate is not just unused, it is GONE — nothing can reach for it by accident.
    expect(body).not.toContain('is_space_audience')
    expect(sql).toContain('drop function if exists private.is_space_audience(uuid)')
  })

  it('the paid predicate reads ONLY the memberships table — a seat is not a membership', () => {
    const start = sql.indexOf('create or replace function private.is_space_paid_member')
    expect(start).toBeGreaterThan(-1)
    const body = sql.slice(start, sql.indexOf('$$;', start))
    expect(body).toContain('public.space_memberships')
    // Regex, not includes: 'space_memberships' CONTAINS 'space_members'.
    expect(body).not.toMatch(/space_members\b/)
    expect(body).toContain("sm.status = 'active'")
  })

  it('the shape trigger refuses the new mode on a personal Circle, with no plan floor', () => {
    const start = sql.indexOf('create or replace function public.enforce_circle_access_shape')
    expect(start).toBeGreaterThan(-1)
    const body = sql.slice(start, sql.indexOf('$$;', start))
    expect(body).toContain("in ('space_members', 'space_paid_members', 'tier')")
    // The plan floor stays tier-only: a free Space may run free tiers, so its members are
    // admittable — the floor belongs to SELLING.
    expect(body).toContain("new.access = 'tier' and not private.space_can_sell")
    expect(body).not.toContain("new.access = 'space_paid_members' and not private.space_can_sell")
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

  it('a FREE Space gets both Space audiences but NOT tier — it has rosters to admit from, and nothing to sell with', () => {
    expect(availableAccessModes(FREE_BIZ)).toContain('space_members')
    // A free Space may run free membership tiers, so its members are admittable without the
    // selling plan — the plan floor belongs to SELLING, not to having members.
    expect(availableAccessModes(FREE_BIZ)).toContain('space_paid_members')
    expect(availableAccessModes(FREE_BIZ)).not.toContain('tier')
  })

  it('a Space on a selling plan gets all six', () => {
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
