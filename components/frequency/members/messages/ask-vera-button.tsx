'use client'

import { FqIcon } from '@/components/frequency/icon'

// Opens the bottom-right Vera panel (the same `open-vera` event the rail orb sends).
export function AskVeraButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event('open-vera'))}>
      <FqIcon name="vera" />
      {children ?? 'Ask Vera'}
    </button>
  )
}
