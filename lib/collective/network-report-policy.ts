export interface ReportSpace { id: string; name: string; slug: string; parent_id: string | null; owner_profile_id: string | null; status: string; plan: string | null; type: string }
export interface ReportEarnings { grossCents: number; feeCents: number; netCents: number; refundedCents: number; orderCount: number; networkGrossCents: number; networkFeeCents: number; networkOrderCount: number }
export type NetworkReport = { status: 'denied' } | { status: 'unavailable' } | {
  status: 'complete'; spaces: { id: string; name: string; slug: string }[]; members: number; events: number; earnings: ReportEarnings
}
export function ownerCollective(parent: ReportSpace | null, caller: string | null): parent is ReportSpace {
  return !!parent && !!caller && parent.owner_profile_id === caller && parent.status === 'active'
    && parent.type !== 'root' && ['collective', 'nonprofit_collective'].includes(parent.plan ?? '')
}
export function attachedReportSpaces(parent: ReportSpace, rows: readonly ReportSpace[]): ReportSpace[] {
  const seen = new Set([parent.id])
  return [parent, ...rows.filter(row => {
    if (seen.has(row.id) || row.parent_id !== parent.id || row.owner_profile_id !== parent.owner_profile_id || row.status !== 'active' || row.type === 'root') return false
    seen.add(row.id); return true
  })]
}
export interface ReportDeps {
  space: (id: string) => Promise<ReportSpace | null>;
  children: (parent: string) => Promise<ReportSpace[]>;
  members: (ids: string[]) => Promise<{ member_profile_id: string; status: string }[]>;
  events: (ids: string[]) => Promise<{ id: string; space_id: string | null; host_space_id: string | null }[]>;
  earnings: (id: string) => Promise<ReportEarnings>;
}
export async function buildNetworkReport(parentId: string, caller: string | null, deps: ReportDeps): Promise<NetworkReport> {
  if (!caller) return { status: 'denied' }
  try {
    const parent = await deps.space(parentId)
    if (!ownerCollective(parent, caller)) return { status: 'denied' }
    const candidates = attachedReportSpaces(parent, await deps.children(parent.id))
    const current: ReportSpace[] = []
    for (const candidate of candidates) {
      const row = await deps.space(candidate.id)
      if (candidate.id === parent.id) {
        if (!ownerCollective(row, caller)) return { status: 'denied' }
        current.push(row)
      } else if (row && attachedReportSpaces(parent, [row]).length === 2) current.push(row)
    }
    const ids = current.map(row => row.id)
    const members = await deps.members(ids)
    const events = await deps.events(ids)
    const earnings: ReportEarnings = { grossCents: 0, feeCents: 0, netCents: 0, refundedCents: 0, orderCount: 0, networkGrossCents: 0, networkFeeCents: 0, networkOrderCount: 0 }
    for (const source of current) {
      // Revalidate the parent and source immediately before every finance read.
      if (!ownerCollective(await deps.space(parent.id), caller)) return { status: 'denied' }
      const fresh = await deps.space(source.id)
      if (!fresh || (source.id !== parent.id && attachedReportSpaces(parent, [fresh]).length !== 2)) return { status: 'unavailable' }
      const part = await deps.earnings(source.id)
      for (const key of Object.keys(earnings) as (keyof ReportEarnings)[]) {
        if (!Number.isSafeInteger(part[key]) || part[key] < 0) throw new Error('invalid earnings total')
        earnings[key] += part[key]
        if (!Number.isSafeInteger(earnings[key])) throw new Error('earnings total overflow')
      }
    }
    return { status: 'complete', spaces: current.map(({ id, name, slug }) => ({ id, name, slug })),
      members: new Set(members.filter(row => row.status === 'active' && !!row.member_profile_id).map(row => row.member_profile_id)).size,
      events: new Set(events.filter(row => ids.includes(row.host_space_id ?? row.space_id ?? '')).map(row => row.id)).size, earnings }
  } catch { return { status: 'unavailable' } }
}
