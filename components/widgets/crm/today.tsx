import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { buildTodayCards } from '@/lib/ai/vera/today'
import { TodayCards } from '@/app/(main)/admin/crm/today/today-cards'

// Vera "Today" layout module (LP7, ADR-270/294): the whole interior — the inbox-zero of the five
// person-plus-action cards the model says matter most, each one tap (do it / tweak / not now), plus the
// verdict line and the you-are-at-zero empty. A self-fetching, fail-safe RSC: buildTodayCards never
// throws (empty list on any error), and there is no searchParams facet, so the surface converts
// wholesale to one module. The page keeps its janitor gate; this renders only through it, never re-gating.
export async function CrmToday() {
  const { cards, laterCount } = await buildTodayCards()

  const verdict =
    cards.length === 0
      ? 'Nothing needs you right now. Vera will surface the next moves as the scores refresh.'
      : `${cards.length} ${cards.length === 1 ? 'member needs' : 'members need'} you today.${
          laterCount > 0 ? ` ${laterCount} more on the Later shelf.` : ''
        }`

  return (
    <AdminSection>
      {cards.length === 0 ? (
        <EmptyState
          variant="cleared"
          title="You are at zero"
          description="No cards right now. Come back after the next overnight refresh, or check the people you cleared in the timeline."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text">{verdict}</p>
          <TodayCards cards={cards} />
        </div>
      )}
    </AdminSection>
  )
}
