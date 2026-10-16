'use client'

import type { ReactNode } from 'react'
import { useMindless } from '@/components/on-air/mindless'

/** The provider loads this practice's authored mode and duration; never substitute a generic sit. */
export function AdoptedPracticeStart({ practiceId, title, className, children }: {
  practiceId: string
  title: string
  className?: string
  children: ReactNode
}) {
  const timer = useMindless()
  return <button type="button" className={className} aria-label={`Start ${title}`} onClick={() => timer.open({ practiceId, autoStart: true })}>{children}</button>
}
