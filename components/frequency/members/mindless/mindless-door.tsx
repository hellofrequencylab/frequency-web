'use client'

import { useMindless } from '@/components/on-air/mindless'
import { CompactSetup } from '@/components/on-air/compact-setup'
import type { OnAirSession } from '@/components/on-air/session'
import { useRouter } from 'next/navigation'

type SessionProps = Omit<React.ComponentProps<typeof OnAirSession>, 'autoStart' | 'minutesOverride'>

/** The route and global overlay share one setup; the provider owns every running/recovered timer. */
export function MindlessDoor({ session, initialPracticeId, rememberedMinutes }: {
  session: SessionProps
  initialPracticeId: string
  rememberedMinutes: number
}) {
  const timer = useMindless()
  const router = useRouter()
  const initial = session.practices.find((p) => p.id === initialPracticeId)
  return <CompactSetup practices={session.practices} initialPracticeId={initialPracticeId} initialMode={initial?.timerKind === 'movement' ? 'move' : 'still'} rememberedMinutes={rememberedMinutes}
    onStart={(choice) => timer.open({ practiceId: choice.practiceId, minutesOverride: choice.minutesOverride, autoStart: true })}
    onAdvanced={(choice) => timer.open({ practiceId: choice.practiceId, minutesOverride: choice.minutesOverride, advanced: true })}
    onClose={() => router.push('/feed')} />
}
