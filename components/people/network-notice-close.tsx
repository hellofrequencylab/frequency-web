'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { dismissNetworkNotice } from '@/app/(main)/network/notice-actions'
import '@/app/themes/active/members-community'
import { SITE_DESIGN } from '@/lib/theme/design'

// FREQUENCY (LIVE-1086): the kit's `.fa-notice` glass panel (the same notice the empty Feed sections use),
// with the close in its corner. DAWN keeps its soft bordered note. Inlined at build.
const FREQUENCY = SITE_DESIGN === 'frequency'

/** The close button of the Network how-to notice. The notice hides at once, then the server remembers. */
export function NetworkNoticeClose({ children }: { children: React.ReactNode }) {
  const [pending, start] = useTransition()
  const [closed, setClosed] = useState(false)
  if (closed) return null
  return (
    <div className={FREQUENCY ? 'fa-notice fqm-net-notice' : 'mu-notice soft relative mb-6 rounded-card border border-border px-5 py-4 pr-12'} role="note" aria-label="How Members, Friends and My Contacts work" data-pending={pending || undefined}>
      {children}
      <IconButton
        label="Close this notice"
        className={FREQUENCY ? 'fqm-net-x' : 'absolute right-3 top-3'}
        onClick={() => {
          setClosed(true)
          start(() => {
            void dismissNetworkNotice()
          })
        }}
      >
        <X className="h-4 w-4" aria-hidden />
      </IconButton>
    </div>
  )
}
