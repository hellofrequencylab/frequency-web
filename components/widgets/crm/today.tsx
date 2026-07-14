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
          description="No cards right now. Come back after the next overnight refresh, or check the people you cleared in the timeline. Vera also emails you a brief each morning when there are moves to make."
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text">{verdict}</p>
          <TodayCards cards={cards} />
        </div>
      )}
      <OwnerBriefGuidance />
    </AdminSection>
  )
}

// The daily owner brief (CRM Master Build Plan · Phase 7). Today is pull-only on its own; the brief
// is the push. This panel tells the operator it exists, how to opt in or out, and how to change the
// cadence, so the feature is discoverable from the surface it mirrors. Guidance only: the brief is
// sent by the vera-owner-brief cron, never from this screen. Semantic tokens only, copy in voice.
function OwnerBriefGuidance() {
  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface/50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Your daily brief</p>
      <p className="mt-1.5 text-sm text-text">
        Each morning Vera emails you these same moves, so you do not have to remember to check. She
        drafts the note, never sends on your behalf, and never touches a member. Every move is still
        a one-tap here.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm text-muted">
        <li>
          <span className="font-medium text-text">Turn it on or off:</span> it rides your lifecycle
          email preference. Manage it under{' '}
          <a href="/settings/notifications" className="font-medium text-text underline underline-offset-2">
            email settings
          </a>
          . Off there means no brief.
        </li>
        <li>
          <span className="font-medium text-text">Cadence:</span> once a day, only when there are
          moves to make. Quiet days send nothing, so it never turns into noise.
        </li>
        <li>
          <span className="font-medium text-text">What is in it:</span> the same people and next
          moves you see here, with Vera&rsquo;s plain reason for each.
        </li>
      </ul>
    </div>
  )
}
