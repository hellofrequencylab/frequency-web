// Per-persona nurture builder (ADR-131, Entry Points Phase 3). In the /marketing
// workspace (layout gates admin/staff). One sequence per persona; timed email steps
// auto-sent to captured leads of that persona.

import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { StatCard } from '@/components/ui/stat-card'
import { Mail, Users, Send } from 'lucide-react'
import { listPersonas } from '@/lib/onboarding/personas'
import { listSequencesWithStats } from '@/lib/nurture/store'
import { NurtureManager, type PersonaRow } from './nurture-client'

export const dynamic = 'force-dynamic'

export default async function NurturePage() {
  const stats = await listSequencesWithStats()
  const byPersona = new Map(stats.map((s) => [s.sequence.persona, s]))

  const rows: PersonaRow[] = listPersonas().map((p) => {
    const s = byPersona.get(p.id)
    return {
      persona: p.id,
      label: p.label,
      emoji: p.emoji,
      pitch: p.pitch,
      sequence: s
        ? {
            id: s.sequence.id,
            enabled: s.sequence.enabled,
            active: s.activeEnrollments,
            completed: s.completedEnrollments,
            steps: s.steps.map((st) => ({
              id: st.id,
              order: st.order,
              delayHours: st.delayHours,
              subject: st.subject,
              body: st.body,
              enabled: st.enabled,
            })),
          }
        : null,
    }
  })

  const totalActive = stats.reduce((n, s) => n + s.activeEnrollments, 0)
  const liveSequences = stats.filter((s) => s.sequence.enabled).length

  return (
    <DashboardTemplate
      eyebrow="Nurture"
      title="Persona nurture"
      description="When a lead is captured with a persona, they're enrolled in that persona's nurture sequence — a few timed emails that warm them up. Consent-gated; every send carries an unsubscribe."
      stats={
        <>
          <StatCard label="Live sequences" value={liveSequences} icon={Mail} />
          <StatCard label="In a sequence now" value={totalActive} icon={Users} />
          <StatCard label="Personas" value={rows.length} icon={Send} />
        </>
      }
    >
      <NurtureManager rows={rows} />
    </DashboardTemplate>
  )
}
