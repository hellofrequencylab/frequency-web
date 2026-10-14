'use client'

import { openSupport } from '@/components/support/support-launcher'
import type { TicketType } from '@/lib/support/types'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'

// "Message support" as the kit's primary button. It opens the app-wide report dialog (SupportLauncher,
// mounted once by the member layout) on a question, the same dialog every "Report" control opens.
// `type: 'bug'` is the Report a bug door: the same dialog, opened on a bug.
export function SupportButton({
  label = 'Message support',
  type = 'question',
  icon = 'message',
  className = 'btn pa',
}: {
  label?: string
  type?: TicketType
  icon?: FqIconName
  className?: string
}) {
  return (
    <button type="button" className={className} onClick={() => openSupport(type)}>
      <FqIcon name={icon} />
      {label}
    </button>
  )
}
