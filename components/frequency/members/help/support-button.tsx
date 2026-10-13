'use client'

import { openSupport } from '@/components/support/support-launcher'

// "Message support" as the kit's primary button. It opens the app-wide report dialog (SupportLauncher,
// mounted once by the member layout) on a question, the same dialog every "Report" control opens.
export function SupportButton({ label = 'Message support' }: { label?: string }) {
  return (
    <button type="button" className="btn pa" onClick={() => openSupport('question')}>
      {label}
    </button>
  )
}
