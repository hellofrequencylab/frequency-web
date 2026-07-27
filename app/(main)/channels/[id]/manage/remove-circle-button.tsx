'use client'

import { useTransition } from 'react'

// The one client island in the Circles section (ADR-871): removing a circle
// from the channel deserves a quiet confirm, and window.confirm needs the
// client. The bound server action re-checks channel.manage (ADR-274) and
// redirects back with the notice, so this only expresses intent.

export function RemoveCircleButton({
  circleName,
  action,
}: {
  circleName: string
  /** removeChannelCircleAction bound to (channelId, idOrSlug, circleId). */
  action: () => Promise<void>
}) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      onClick={() => {
        if (
          !window.confirm(
            `Remove ${circleName} from this Channel? It keeps its host, members, and events. It just stops practicing here.`,
          )
        ) {
          return
        }
        start(async () => {
          await action()
        })
      }}
      disabled={pending}
      className="rounded-lg px-2 py-1 text-2xs font-medium text-subtle transition-colors hover:text-danger disabled:opacity-40"
    >
      {pending ? 'Removing…' : 'Remove'}
    </button>
  )
}
