// Starter Circles — one-click event tie-ins. Generates the standing rhythm (the
// midweek Circle Meetup + the Weekend Gathering) as dated Events scoped to the
// Circle, mirroring lib/journeys/runs.ts setPhaseEvent. Single events for now;
// the Host can set them to recur in the event editor. Server-only (admin client;
// the action layer checks Host ownership).

import { createAdminClient } from '@/lib/supabase/admin'

/** A sensible default start for a generated event when the Host gives no date:
 *  N days out at a fixed hour (Meetup midweek evening, Gathering weekend late
 *  morning). The Host edits these in the event editor. */
function defaultDate(daysOut: number, hour: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysOut)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

function eventSlug(kind: string, circleId: string): string {
  return `${kind}-${circleId.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}`
}

export interface GenerateEventsInput {
  circleId: string
  hostId: string
  circleName: string
  /** ISO start for the first Meetup; defaults to ~7 days out, 6pm. */
  meetupAt?: string
  /** ISO start for the first Gathering; defaults to ~9 days out, 11am. */
  gatheringAt?: string
  meetupNote?: string
  gatheringNote?: string
}

export interface GeneratedEvents {
  meetupId: string | null
  gatheringId: string | null
}

export async function generateCircleEvents(input: GenerateEventsInput): Promise<GeneratedEvents> {
  const admin = createAdminClient()

  const make = async (kind: 'meetup' | 'gathering', title: string, startsAt: string, description: string): Promise<string | null> => {
    const { data, error } = await admin
      .from('events')
      .insert({
        title,
        description,
        scope_id: input.circleId,
        scope_type: 'circle',
        starts_at: new Date(startsAt).toISOString(),
        host_id: input.hostId,
        slug: eventSlug(kind, input.circleId),
        // space_id is trigger-defaulted and reads as required in the generated
        // types (ADR-246); cast past it like the other circle/event writes.
      } as never)
      .select('id')
      .maybeSingle()
    if (error || !data) return null
    return String((data as { id: string }).id)
  }

  const meetupId = await make(
    'meetup',
    `${input.circleName}: Circle Meetup`,
    input.meetupAt ?? defaultDate(7, 18),
    input.meetupNote || 'The standing midweek Circle Meetup. Get known, check in, do the thing.',
  )
  const gatheringId = await make(
    'gathering',
    `${input.circleName}: Weekend Gathering`,
    input.gatheringAt ?? defaultDate(9, 11),
    input.gatheringNote || 'The standing Weekend Gathering. The main event, in person.',
  )

  return { meetupId, gatheringId }
}
