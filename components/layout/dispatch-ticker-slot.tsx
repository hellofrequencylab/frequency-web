import { getRecentDispatchesForProfile } from '@/lib/dispatches'
import { relativeTime } from '@/lib/utils'
import { DispatchTicker } from '@/components/layout/dispatch-ticker'

// Server slot for the community news ticker. Fetches the member's recent
// dispatches and formats the timestamps server-side (so the client component
// never recomputes relative time and risks a hydration mismatch). Renders
// nothing when there's no news yet. Streamed via Suspense from the app layout,
// so it never blocks the shell.
export async function DispatchTickerSlot({ profileId }: { profileId: string }) {
  const dispatches = await getRecentDispatchesForProfile(profileId, { limit: 8 })
  if (dispatches.length === 0) return null

  return (
    <DispatchTicker
      items={dispatches.map((d) => ({
        id: d.id,
        title: d.title,
        authorName: d.authorName,
        timeLabel: relativeTime(d.publishedAt),
        linked: !!d.linkedTaskId,
      }))}
    />
  )
}
