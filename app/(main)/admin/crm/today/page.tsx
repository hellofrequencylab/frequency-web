import { Sparkles } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buildTodayCards } from '@/lib/ai/vera/today'
import { TodayCards } from './today-cards'

// Vera "Today" - the minimal surface that makes the loop visible (Resonance Engine
// Phase 1 - ADR-382 - docs/NEXT-GEN-CRM.md). Inbox-zero of the five person-plus-action
// cards the model says matter most, each one tap: Do it / Tweak / Not now. This is the
// deliberately small Phase 1 surface; the full three-altitude dashboard is Phase 2.
//
// Staff-gated: a platform-wide member-prediction read is a sensitive operator view, so it
// sits on the staff floor (requireAdmin('janitor')). The /admin/* group mounts its own
// info rail, so no page-chrome registration is needed.
export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  await requireAdmin('janitor')

  // Fail-safe by design: buildTodayCards never throws (empty list on any error).
  const { cards, laterCount } = await buildTodayCards()

  const verdict =
    cards.length === 0
      ? 'Nothing needs you right now. Vera will surface the next moves as the scores refresh.'
      : `${cards.length} ${cards.length === 1 ? 'member needs' : 'members need'} you today.${
          laterCount > 0 ? ` ${laterCount} more on the Later shelf.` : ''
        }`

  return (
    <AdminTemplate
      title="Today"
      eyebrow="Vera"
      icon={Sparkles}
      description={verdict}
      width="default"
    >
      <AdminSection>
        {cards.length === 0 ? (
          <EmptyState
            variant="cleared"
            title="You are at zero"
            description="No cards right now. Come back after the next overnight refresh, or check the people you cleared in the timeline."
          />
        ) : (
          <TodayCards cards={cards} />
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
