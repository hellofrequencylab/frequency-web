import 'server-only'
import { log } from '@/lib/log'
import { listAcceptedCollaborations } from '@/lib/spaces/collaborations'
import { listSpaceCalendarEvents } from '@/lib/events/store'
import { listPublicCollectiveMembers, loadCollectiveNetworkWindow } from '@/lib/collective/network-store'
import { collectiveNetworkOpen, type NetworkParent } from '@/lib/collective/network'
import { isNetworkPlan } from '@/lib/collective/member-spaces'
import { mapPlanShareRow, type PlanShareView } from './plan-shares'
import { listPlanShareRowsFor } from './plans-store'
import { monthGridWindow } from './month-window'
import { spaceEventRowsToItems } from './public-month'
import type { SharedSource } from './planner/adapters'

// THE SHARED WITH SPACES LAYER, loaded (P7). What the sixth Show tile draws beside this Space's own
// dates: its accepted collaborators' public calendars, and, when this Space is the parent of a Network
// or a Collective, its chapters' or member Spaces' events (the roll-up). Every source goes through the
// SAME public gate its own calendar tab reads through (listSpaceCalendarEvents, published and public or
// unlisted, never a draft), so a partner's private date can never appear here; an accepted
// collaboration decides WHICH Spaces contribute and never widens WHICH of their dates show.
//
// FAIL-SAFE, and loud about it: a source that cannot be read contributes nothing and logs
// `calendar.shared_layer.*_failed`, so an empty tile is something an operator can tell from a quiet one.

export interface SharedLayer {
  sources: SharedSource[]
  /** The accepted collaborators, for the invite picker in Details. */
  collaborators: { id: string; name: string }[]
  /** Every offer this Space made on its own Plans. */
  hostShares: PlanShareView[]
  /** What the roll-up of chapters is called in this Space's own words. */
  networkNoun: 'Chapters' | 'Member Spaces' | null
}

const EMPTY: SharedLayer = { sources: [], collaborators: [], hostShares: [], networkNoun: null }

function failed(op: string, err: unknown): void {
  log.error(`calendar.shared_layer.${op}_failed`, { error: err instanceof Error ? err.message : String(err) })
}

/** The next calendar month after 'YYYY-MM', as year and 1-based month. */
function nextMonth(year: number, month1: number): { year: number; month1: number } {
  return month1 === 12 ? { year: year + 1, month1: 1 } : { year, month1: month1 + 1 }
}

export async function loadSharedLayer(
  space: NetworkParent & { name: string; brandName?: string | null },
  opts: { planIds: readonly string[]; year: number; month1: number; fromDay: string; toDay: string },
): Promise<SharedLayer> {
  const ownName = space.brandName?.trim() || space.name
  try {
    const collabs = await listAcceptedCollaborations(space.id)
    const collaborators = collabs.map((c) => ({ id: c.partner.id, name: c.partner.name }))
    const names = new Map(collaborators.map((c) => [c.id, c.name]))

    const [shareRows, collabSources, network] = await Promise.all([
      listPlanShareRowsFor(opts.planIds),
      Promise.all(
        collaborators.map(async (c): Promise<SharedSource | null> => {
          try {
            const rows = await listSpaceCalendarEvents(c.id, { fromDay: opts.fromDay, limit: 200 })
            const inWindow = rows.filter((r) => r.starts_at.slice(0, 10) < opts.toDay)
            return { spaceId: c.id, name: c.name, via: 'collaborator', events: await spaceEventRowsToItems(inWindow) }
          } catch (err) {
            failed('collaborator', err)
            return null
          }
        }),
      ),
      loadNetwork(space, ownName, opts.year, opts.month1),
    ])

    return {
      sources: [...collabSources.filter((s): s is SharedSource => !!s && s.events.length > 0), ...network.sources],
      collaborators,
      hostShares: shareRows.map((row) => mapPlanShareRow(row, names.get(row.guest_space_id) ?? null)),
      networkNoun: network.noun,
    }
  } catch (err) {
    failed('load', err)
    return EMPTY
  }
}

/** The chapters' or member Spaces' events for the opening month and the one after it. The network
 *  reader is bounded to a 62-day window on purpose (it reads every member Space), so the roll-up covers
 *  these two month grids and says so rather than reading a year of every chapter. */
async function loadNetwork(
  parent: NetworkParent,
  ownName: string,
  year: number,
  month1: number,
): Promise<{ sources: SharedSource[]; noun: SharedLayer['networkNoun'] }> {
  if (!collectiveNetworkOpen(parent)) return { sources: [], noun: null }
  const noun = isNetworkPlan(parent.plan) ? 'Chapters' : 'Member Spaces'
  try {
    const second = nextMonth(year, month1)
    const windows = [monthGridWindow(year, month1), monthGridWindow(second.year, second.month1)]
    const [members, ...reads] = await Promise.all([
      listPublicCollectiveMembers(parent),
      ...windows.map((w) => loadCollectiveNetworkWindow(parent, ownName, w.fromDay, w.toDay)),
    ])
    const idByName = new Map(members.map((m) => [m.name, m.id]))
    const bySpace = new Map<string, SharedSource>()
    const seen = new Set<string>()
    for (const ev of reads.flat()) {
      const key = `${ev.slug}:${ev.dayKey}`
      if (seen.has(key)) continue
      seen.add(key)
      // The label is every Space that carries the date; the parent's own copy is not a roll-up entry.
      const from = (ev.sourceLabel ?? '').split(' · ').find((n) => n && n !== ownName)
      if (!from) continue
      const spaceId = idByName.get(from) ?? `network:${from}`
      const source = bySpace.get(spaceId) ?? { spaceId, name: from, via: 'network' as const, events: [] }
      bySpace.set(spaceId, { ...source, events: [...source.events, ev] })
    }
    return { sources: [...bySpace.values()], noun }
  } catch (err) {
    failed('network', err)
    return { sources: [], noun }
  }
}
