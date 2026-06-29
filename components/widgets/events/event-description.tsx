import { getEventContext } from '@/lib/events/active-event'
import { InlineText } from '@/components/admin/inline/inline-text'
import { StartEditingLink } from '@/components/admin/inline/edit-mode-button'
import { updateEventField } from '@/app/(main)/events/admin-actions'

// The event DESCRIPTION block — open prose (not a card) for the event detail page's
// arrangeable body, mirroring the circle text/feed modules: a zero-prop self-fetching
// RSC that reads the request-scoped event context (lib/events/active-event.ts) and
// renders nothing off-route. For operators (canManage) the prose is click-to-edit via
// the inline tuning layer (ADR-138) — InlineText patches the allowlisted `description`
// field server-side. For everyone else it's plain read-only prose. Renders nothing when
// there's no description and the viewer can't add one, so an empty slot never shows.
export const EventDescription = async () => {
  const ctx = getEventContext()
  if (!ctx) return null
  const { event, canManage } = ctx

  if (!canManage && !event.description) return null

  if (canManage) {
    return (
      <div className="max-w-2xl">
        <InlineText
          value={event.description}
          multiline
          placeholder="Add a description…"
          save={updateEventField.bind(null, event.id, event.slug, 'description')}
        >
          {event.description ? (
            <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{event.description}</p>
          ) : (
            <StartEditingLink label="+ Add a description" />
          )}
        </InlineText>
      </div>
    )
  }

  return (
    <p className="max-w-2xl text-sm text-text leading-relaxed whitespace-pre-wrap">{event.description}</p>
  )
}
