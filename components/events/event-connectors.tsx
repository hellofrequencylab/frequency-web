import { Users } from 'lucide-react'
import { suggestConnectorsForEvents } from '@/lib/events/connectors'
import { PulseAvatar } from '@/components/connections/pulse-avatar'
import { PulseConnectButton } from '@/components/connections/pulse-actions'

// "People to meet" — connector suggestions for the events library (Events B-4).
// Strangers going to the same upcoming events who share a Channel with the viewer
// and aren't connected yet. The shared Channel is the reason, said plainly; the
// "Connect" button reuses the existing friend-request island.
//
// Async server component: renders nothing unless there's a real suggestion, so it
// can sit behind its own <Suspense> in the library without blocking the shell.
// PRIVACY: only surfaces members who share a Channel and aren't in ghost mode
// (filtered in suggestConnectorsForEvents). No counts, no scores, no pressure.
export async function EventConnectors({
  viewerProfileId,
  eventIds,
}: {
  viewerProfileId: string
  eventIds: string[]
}) {
  const suggestions = await suggestConnectorsForEvents(viewerProfileId, eventIds, 6)
  if (suggestions.length === 0) return null

  return (
    <section className="rounded-2xl border border-border bg-surface-elevated p-5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary-strong" />
        <h2 className="text-sm font-bold tracking-tight text-text">People to meet</h2>
      </div>
      <p className="mt-1 text-2xs text-subtle">
        Going to the same things you are, into the same Channels. Say hi before the room does.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {suggestions.map((s) => (
          <div key={s.profileId} className="flex items-center gap-3">
            <PulseAvatar
              href={`/people/${s.handle}`}
              displayName={s.displayName}
              avatarUrl={s.avatarUrl}
            />
            <div className="min-w-0 flex-1">
              <a
                href={`/people/${s.handle}`}
                className="block truncate text-sm font-semibold text-text hover:text-primary-strong"
              >
                {s.displayName}
              </a>
              <p className="truncate text-2xs text-subtle">{sharedLine(s.sharedChannels)}</p>
            </div>
            <PulseConnectButton targetId={s.profileId} />
          </div>
        ))}
      </div>
    </section>
  )
}

// "Both into Movement and Creative" — the shared Channels are the common ground.
// Plain, factual, no em dashes (CONTENT-VOICE).
function sharedLine(channels: string[]): string {
  if (channels.length === 1) return `Both into ${channels[0]}`
  if (channels.length === 2) return `Both into ${channels[0]} and ${channels[1]}`
  const head = channels.slice(0, 2).join(', ')
  return `Both into ${head}, and more`
}
