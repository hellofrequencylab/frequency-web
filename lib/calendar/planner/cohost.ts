import type { AdaptedCalendar } from './adapters'
import { isShared } from './day-items'
import type { PlannerItem, PlannerPlan } from './types'

// CO-HOSTING AND THE SHARED WITH SPACES TILE, as pure functions over the adapted calendar (P7). The
// handshake itself lives in lib/calendar/plan-shares.ts and its three server doors; this is what the
// calendar shows between a press and the page coming back with the truth, and the words the Details
// block and the rail print. Nothing here writes, and nothing here reads a clock.

/** What a guest answers an invite with. */
export type InviteAnswer = 'accepted' | 'declined'

/** The calendar as THIS Space sees it once it has answered an invite. A yes marks this Space as a
 *  co-host. A no takes the Plan, its dates and its to-dos off THIS Space's calendar and nothing else:
 *  the host's Plan, and every other Space on it, is untouched, because the Plan was never ours to
 *  delete (the prototype deleted it outright; that is the defect this replaces). */
export function answerInvite(data: AdaptedCalendar, planId: string, ownSpaceId: string, answer: InviteAnswer): AdaptedCalendar {
  if (answer === 'accepted') {
    return {
      ...data,
      plans: data.plans.map((p) =>
        p.id === planId ? { ...p, spaces: p.spaces.map((s) => (s.id === ownSpaceId ? { ...s, status: 'accepted' as const } : s)) } : p,
      ),
    }
  }
  return {
    ...data,
    plans: data.plans.filter((p) => p.id !== planId),
    items: data.items.filter((i) => i.plan !== planId),
    tasks: data.tasks.filter((t) => t.plan !== planId),
  }
}

/** The Plan with one more Space invited to co-host it. */
export function addInvited(data: AdaptedCalendar, planId: string, space: { id: string; name: string }, shareId: string): AdaptedCalendar {
  return {
    ...data,
    spaceNames: { ...data.spaceNames, [space.id]: space.name },
    plans: data.plans.map((p) =>
      p.id === planId && !p.spaces.some((s) => s.id === space.id)
        ? { ...p, spaces: [...p.spaces, { id: space.id, role: 'Co-host' as const, status: 'pending' as const, shareId }] }
        : p,
    ),
  }
}

/** The Plan with an invite taken back: that Space leaves its list and the Plan stays. */
export function dropInvited(data: AdaptedCalendar, planId: string, spaceId: string): AdaptedCalendar {
  return {
    ...data,
    plans: data.plans.map((p) => (p.id === planId ? { ...p, spaces: p.spaces.filter((s) => s.id !== spaceId) } : p)),
  }
}

type CohostLabel = 'Host' | 'Co-host' | 'Invited'

interface CohostRow {
  id: string
  name: string
  label: CohostLabel
  /** The Space looking at the calendar. */
  you: boolean
  /** The share an invited Space's row can be taken back through. */
  shareId: string | null
}

/** The Spaces on a Plan as the Details block lists them: the host first, then those working it, then
 *  those still invited. */
export function cohostRows(plan: PlannerPlan, ownSpaceId: string, ownName: string, names: Readonly<Record<string, string>>): CohostRow[] {
  const rank: Record<CohostLabel, number> = { Host: 0, 'Co-host': 1, Invited: 2 }
  return plan.spaces
    .map((s): CohostRow => ({
      id: s.id,
      name: s.id === ownSpaceId ? ownName : (names[s.id] ?? 'Another Space'),
      label: s.role === 'Host' ? 'Host' : s.status === 'pending' ? 'Invited' : 'Co-host',
      you: s.id === ownSpaceId,
      shareId: s.shareId ?? null,
    }))
    .sort((a, b) => rank[a.label] - rank[b.label])
}

/** The Spaces this one may still invite to a Plan: its collaborators, minus any already on it. */
export function inviteChoices(collaborators: readonly { id: string; name: string }[], plan: PlannerPlan): { id: string; name: string }[] {
  const taken = new Set(plan.spaces.map((s) => s.id))
  return collaborators.filter((c) => !taken.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
}

/** True when this Space hosts the Plan, which is the only Space that may invite or take an invite back. */
export function hostsPlan(plan: PlannerPlan, ownSpaceId: string): boolean {
  return plan.spaces.some((s) => s.id === ownSpaceId && s.role === 'Host')
}

type SharedTier = 'partner' | 'collaborator' | 'network'

export interface SharedRollupRow {
  tier: SharedTier
  /** How many dates the tier holds in the month. */
  count: number
  /** The Spaces behind those dates, by name, most dates first. */
  spaces: string[]
}

/** What the Shared with Spaces tile holds in one month, by where it came from: Plans worked with a
 *  partner Space, dates on a collaborator's calendar, and the Network's or Collective's roll-up. Tiers
 *  with nothing in the month are left out. */
export function sharedRollup(
  items: readonly PlannerItem[],
  plans: readonly PlannerPlan[],
  names: Readonly<Record<string, string>>,
  ownSpaceId: string,
  ym: string,
): SharedRollupRow[] {
  const byTier = new Map<SharedTier, Map<string, number>>()
  const add = (tier: SharedTier, space: string) => {
    const spaces = byTier.get(tier) ?? new Map<string, number>()
    spaces.set(space, (spaces.get(space) ?? 0) + 1)
    byTier.set(tier, spaces)
  }
  const planById = new Map(plans.map((p) => [p.id, p]))
  for (const it of items) {
    if (it.date.slice(0, 7) !== ym) continue
    if (it.from) {
      add(it.from.via, names[it.from.space] ?? 'Another Space')
      continue
    }
    const plan = planById.get(it.plan ?? '')
    if (!it.shared && !isShared(plan, ownSpaceId)) continue
    const other = plan?.spaces.find((s) => s.id !== ownSpaceId)?.id
    add('partner', (other && names[other]) || 'Another Space')
  }
  return (['partner', 'collaborator', 'network'] as const).flatMap((tier) => {
    const spaces = byTier.get(tier)
    if (!spaces) return []
    const ordered = [...spaces.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    return [{ tier, count: ordered.reduce((n, [, c]) => n + c, 0), spaces: ordered.map(([name]) => name) }]
  })
}
