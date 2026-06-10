// Server section: the Poster quality panel of /admin/events. Every member with
// at least one posted event (top 50 by volume), scored by the honesty metric and
// sorted so the attention queue (throttled, then watch) sits on top. Read-only:
// the band is computed, never set by hand; the lever an operator pulls is the
// Remove action in the table above. Rendered behind its own <Suspense>.

import { Users } from 'lucide-react'
import { getPostedAdminData } from './load-posted'
import { BandChip } from './band-chip'

const thCls = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-subtle'
const numTh = 'px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-subtle'
const tdCls = 'px-3 py-2.5 text-sm'

export async function PosterQualitySection() {
  const { posters } = await getPostedAdminData()

  if (posters.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-surface/50 px-4 py-6 text-center text-sm text-muted">
        Nobody has posted an event yet. Posters appear here with their band after their first publish.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className={thCls}>Poster</th>
            <th className={thCls}>Band</th>
            <th className={numTh}>Posted</th>
            <th className={numTh}>Engaged</th>
            <th className={numTh}>Claimed</th>
            <th className={numTh}>Removed</th>
            <th className={numTh}>Engagement rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {posters.map((p) => (
            <tr key={p.profileId}>
              <td className={tdCls}>
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 shrink-0 text-subtle" />
                  <span className="font-medium text-text">{p.name}</span>
                  {p.handle && <span className="text-xs text-subtle">@{p.handle}</span>}
                </span>
              </td>
              <td className={tdCls}>
                <BandChip band={p.band} />
              </td>
              <td className={`${tdCls} text-right tabular-nums text-text`}>{p.posted}</td>
              <td className={`${tdCls} text-right tabular-nums text-text`}>{p.engaged}</td>
              <td className={`${tdCls} text-right tabular-nums text-text`}>{p.claimed}</td>
              <td className={`${tdCls} text-right tabular-nums ${p.removed > 0 ? 'font-semibold text-danger' : 'text-text'}`}>
                {p.removed}
              </td>
              <td className={`${tdCls} text-right tabular-nums text-muted`}>
                {Math.round(p.engagementRate * 100)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
