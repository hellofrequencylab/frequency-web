/** Deterministic coaching over observed facts. No model, private messages or inferred traits. */
export interface ProfileCoachingEvidence {
  windowDays: number
  observedFrom: string
  observedThrough: string
  profileViews: number | null
  ctaClicks: number | null
  attendance?: { checkins: number; people: number; returnPeople: number | null } | null
}

/** Count verified check-ins in the same window. A repeat means distinct events, not duplicate rows. */
export function summarizeCoachingAttendance(rows: readonly { profileId: string; at: number; eventId?: string }[] | null, from: number, through: number): ProfileCoachingEvidence['attendance'] {
  if (rows === null) return null
  const people = new Map<string, Set<string>>()
  let checkins = 0
  let completeEventIds = true
  for (const row of rows) {
    if (!row.profileId || !Number.isFinite(row.at) || row.at < from || row.at >= through) continue
    checkins += 1
    const events = people.get(row.profileId) ?? new Set<string>()
    if (row.eventId) events.add(row.eventId)
    else completeEventIds = false
    people.set(row.profileId, events)
  }
  return { checkins, people: people.size, returnPeople: completeEventIds ? [...people.values()].filter((events) => events.size > 1).length : null }
}

export interface SpaceCoachingIdentity {
  name: string | null
  tagline: string | null
  about: string | null
}

interface CoachingTask {
  id: 'name' | 'tagline' | 'about' | 'attendance' | 'measurement' | 'preview' | 'action' | 'outcome'
  priority: number
  title: string
  question: string
  destination: 'identity' | 'profile' | 'mode' | 'coach'
  action: string
  confidence: 'confirmed gap' | 'observed signal' | 'unavailable'
  evidence: string[]
  missingData: string[]
  rationale: string
}

const filled = (value: string | null) => Boolean(value?.trim())
const validCount = (value: number | null) => value !== null && Number.isInteger(value) && value >= 0

/** Return ONE ranked task, never a speculative conversion rate or a claim that marketing caused it. */
export function rankSpaceCoachingTask(identity: SpaceCoachingIdentity | null, observed: ProfileCoachingEvidence): CoachingTask {
  const evidence: string[] = []
  const missingData = ['Completed bookings and campaign attribution are not measured here. Check-ins and clicks do not establish what caused a visit.']
  if (observed.attendance) {
    evidence.push(`${observed.attendance.checkins} verified check-in ${observed.attendance.checkins === 1 ? 'record' : 'records'} from ${observed.attendance.people} distinct ${observed.attendance.people === 1 ? 'attendee' : 'attendees'} in the loaded history for the last ${observed.windowDays} days.`)
    if (observed.attendance.returnPeople !== null) evidence.push(`${observed.attendance.returnPeople} ${observed.attendance.returnPeople === 1 ? 'attendee' : 'attendees'} checked into more than one distinct event in that window.`)
    else missingData.push('Some check-in records have no event reference. Return attendance is unavailable.')
  } else missingData.push('Verified attendance measurement is unavailable. It is not zero.')
  if (identity === null) missingData.push('Space identity could not be loaded. Missing fields cannot be assessed.')
  if (validCount(observed.profileViews)) evidence.push(`${observed.profileViews} recorded profile-view buckets in the last ${observed.windowDays} days.`)
  else missingData.push('Profile-view measurement is unavailable. It is not zero.')
  if (validCount(observed.ctaClicks)) evidence.push(`${observed.ctaClicks} recorded primary-button clicks in the last ${observed.windowDays} days.`)
  else missingData.push('Primary-button measurement is unavailable. It is not zero.')

  const base = { evidence, missingData, rationale: 'This is a practical next step from the facts available, not a prediction or proof of cause.' }
  if (identity) {
    const fields = [
      { id: 'name' as const, value: identity.name, priority: 100, title: 'Make your Space easy to recognize', question: 'What name do people already know you by?', fact: 'The Space display name is blank.' },
      { id: 'tagline' as const, value: identity.tagline, priority: 90, title: 'Say what people can do here', question: 'In your own words, what can someone join or do with you?', fact: 'The Space tagline is blank.' },
      { id: 'about' as const, value: identity.about, priority: 80, title: 'Give first-time visitors a little context', question: 'What would you tell someone who has never visited before?', fact: 'The Space About field is blank.' },
    ]
    for (const field of fields) {
      if (!filled(field.value)) return { ...base, id: field.id, priority: field.priority, title: field.title, question: field.question, destination: 'identity', action: 'Write it in your profile', confidence: 'confirmed gap', evidence: [field.fact, ...evidence] }
    }
  }
  if (observed.attendance && observed.attendance.people > 0) return {
    ...base, id: 'attendance', priority: 75, title: 'Make room for the next visit', question: 'What would make the next gathering useful for someone who has already attended?', destination: 'coach', action: 'Review your coaching goal', confidence: 'observed signal',
  }
  if (!validCount(observed.profileViews) || !validCount(observed.ctaClicks)) return {
    ...base, id: 'measurement', priority: 70, title: 'Check the evidence before changing your plan', question: 'Which real-world outcome do you want to review when measurement is available?', destination: 'coach', action: 'Set your coaching goal', confidence: 'unavailable',
  }
  if (observed.profileViews === 0) return {
    ...base, id: 'preview', priority: 60, title: 'Walk through your profile as a first-time visitor', question: 'Can someone find what you offer and understand the next step?', destination: 'profile', action: 'Preview your profile', confidence: 'observed signal',
  }
  if (observed.ctaClicks === 0) return {
    ...base, id: 'action', priority: 50, title: 'Check the next step on your profile', question: 'Does your main button lead to the action you want someone to take?', destination: 'mode', action: 'Review your main button', confidence: 'observed signal',
  }
  return {
    ...base, id: 'outcome', priority: 40, title: 'Look beyond the click', question: 'How will you check whether a profile visit led to attendance, a completed booking or a return visit?', destination: 'coach', action: 'Set your coaching goal', confidence: 'observed signal',
  }
}
