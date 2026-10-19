'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { dismissNetworkNotice } from '@/app/(main)/network/notice-actions'

/** The close button of the Network how-to notice. The notice hides at once, then the server remembers. */
export function NetworkNoticeClose({ children }: { children: React.ReactNode }) {
  const [pending, start] = useTransition()
  const [closed, setClosed] = useState(false)
  if (closed) return null
  return (
    <div className="mu-notice soft relative mb-6 rounded-card border border-border px-5 py-4 pr-12" role="note" aria-label="How Members, Friends and My Contacts work" data-pending={pending || undefined}>
      {children}
      <button
        type="button"
        aria-label="Close this notice"
        className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-text"
        onClick={() => {
          setClosed(true)
          start(() => {
            void dismissNetworkNotice()
          })
        }}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
