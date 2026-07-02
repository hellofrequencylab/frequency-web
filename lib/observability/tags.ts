// Sentry scope tagging helpers (H0-4).
//
// Centralises the tag vocabulary so events are filterable in Sentry by the
// dimensions this app cares about: the `route` (which handler), the `entity`
// (Foundation vs Labs partition — see lib/entities), and `space_id` when a write
// is scoped to a Space. All helpers are SAFE NO-OPS when Sentry is unconfigured:
// `Sentry.setTag` / `Sentry.setContext` resolve against a disabled client and do
// nothing, so callers never have to guard on `sentryEnabled` themselves.

import * as Sentry from '@sentry/nextjs'

/** The dimensions we tag events by. All optional — only set tags that are known. */
export type ObservabilityTags = {
  /** Logical route or job identifier, e.g. `cron.process-queue`, `action.rsvp`. */
  route?: string
  /** Money/data partition when known: 'foundation' | 'labs' (lib/entities). */
  entity?: string
  /** The Space the operation is scoped to, when applicable. */
  space_id?: string
}

/**
 * Set observability tags on the current Sentry scope. No-op when Sentry is off or
 * when no fields are provided. Use inside a request/action/cron context so any
 * error captured afterwards carries these tags.
 */
export function setObservabilityTags(tags: ObservabilityTags): void {
  if (tags.route) Sentry.setTag('route', tags.route)
  if (tags.entity) Sentry.setTag('entity', tags.entity)
  if (tags.space_id) Sentry.setTag('space_id', tags.space_id)
}

