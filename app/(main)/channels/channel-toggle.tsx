'use client'

import { tuneInChannel, tuneOutChannel } from './actions'

// "Tune in" — submits the form and the server action redirects to the channel.
export function TuneInButton({
  channelId,
  slug,
  size = 'sm',
}: {
  channelId: string
  slug: string
  size?: 'sm' | 'md'
}) {
  const cls =
    size === 'md'
      ? 'rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors'
      : 'rounded-2xl bg-primary px-3 py-1.5 text-[11px] font-semibold text-on-primary hover:bg-primary-hover transition-colors'

  return (
    <form action={tuneInChannel.bind(null, channelId, slug)}>
      <button type="submit" className={`shrink-0 ${cls}`}>
        Tune in
      </button>
    </form>
  )
}

// "Tuned in" — guarded with a native confirm so a stray tap doesn't drop
// the viewer out of a channel they care about. Friction by design.
export function TunedInButton({
  channelId,
  size = 'sm',
}: {
  channelId: string
  size?: 'sm' | 'md'
}) {
  const cls =
    size === 'md'
      ? 'rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:text-danger hover:border-danger transition-colors'
      : 'rounded-2xl border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-text hover:text-danger hover:border-danger transition-colors'

  return (
    <form
      action={tuneOutChannel.bind(null, channelId)}
      onSubmit={(e) => {
        if (!window.confirm('Are you sure you want to leave this channel?')) {
          e.preventDefault()
        }
      }}
    >
      <button type="submit" className={`shrink-0 ${cls}`}>
        Tuned in
      </button>
    </form>
  )
}
