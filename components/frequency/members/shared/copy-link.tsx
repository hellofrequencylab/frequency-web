'use client'

import { fqToast } from '@/components/frequency/members/shell/toast'

// The reference's `data-toast="Invite link copied"` buttons (Bring a friend, Invite), made real: the
// page's own URL goes on the clipboard and the shell's toast says so. A `path` overrides the page.
export function FqCopyLink({
  label,
  done = 'Invite link copied',
  path,
  className = 'btn sm',
}: {
  label: string
  done?: string
  path?: string
  className?: string
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const url = path ? new URL(path, window.location.origin).toString() : window.location.href
        try {
          await navigator.clipboard.writeText(url)
          fqToast(done)
        } catch {
          fqToast('Copy did not work here. Copy the address bar instead.')
        }
      }}
    >
      {label}
    </button>
  )
}
