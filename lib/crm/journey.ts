// Build "the path a person took through the system" — one chronological, grouped
// timeline assembled from every record that describes them (ADR-130). Pure: it
// takes already-fetched slices and returns a sorted, phase-grouped event list, so
// the assembly logic is unit-tested and the page just renders.
//
// The phases read as a funnel a non-engineer can follow:
//   Arrival      — first touch, captured by a steward, became a CRM lead, joined
//   Outreach     — the one-time intro/invite we sent them
//   In the app   — QR scans, engagement-ledger actions once they're a member
//   CRM work     — operator notes / calls / tasks and pipeline deals

export type JourneyKind =
  | 'first_touch'
  | 'captured'
  | 'crm_lead'
  | 'invited'
  | 'joined'
  | 'scan'
  | 'engagement'
  | 'activity'
  | 'deal'

export type JourneyPhase = 'arrival' | 'outreach' | 'in_app' | 'crm'

export type JourneyEvent = {
  /** ISO timestamp. */
  at: string
  kind: JourneyKind
  phase: JourneyPhase
  title: string
  detail?: string
  /** Channel / source / medium label (e.g. 'card_scan', 'qr', 'referral'). */
  channel?: string
}

const PHASE_OF: Record<JourneyKind, JourneyPhase> = {
  first_touch: 'arrival',
  captured: 'arrival',
  crm_lead: 'arrival',
  joined: 'arrival',
  invited: 'outreach',
  scan: 'in_app',
  engagement: 'in_app',
  activity: 'crm',
  deal: 'crm',
}

export const PHASE_LABEL: Record<JourneyPhase, string> = {
  arrival: 'How they arrived',
  outreach: 'Outreach',
  in_app: 'In the app',
  crm: 'CRM activity',
}

export const PHASE_ORDER: JourneyPhase[] = ['arrival', 'outreach', 'in_app', 'crm']

export function phaseFor(kind: JourneyKind): JourneyPhase {
  return PHASE_OF[kind]
}

/** Minimal, framework-free slices the page already has from the person resolver. */
export type JourneyInput = {
  contact: {
    source: string | null
    firstSeenAt: string | null
    createdAt: string | null
    /** First-touch acquisition snapshot (contacts.meta.acquisition / profile). */
    acquisition?: { channel?: string; source?: string; campaign?: string; code?: string } | null
  }
  member?: {
    createdAt: string | null
    referred?: boolean
  } | null
  captures: {
    source: string
    ownerName: string | null
    invitedAt: string | null
    createdAt: string | null
  }[]
  scans: { codeTitle: string | null; scannedAt: string }[]
  events: { eventType: string; source: string; createdAt: string }[]
  activities: { kind: string; body: string; createdAt: string }[]
  deals: { title: string; status: string; createdAt: string }[]
}

const make = (
  at: string | null | undefined,
  kind: JourneyKind,
  title: string,
  extra: Partial<Pick<JourneyEvent, 'detail' | 'channel'>> = {},
): JourneyEvent | null => (at ? { at, kind, phase: phaseFor(kind), title, ...extra } : null)

/** Humanize an engagement ledger event_type, e.g. 'qr.referral_signup' → 'Referral signup'. */
export function humanizeEventType(eventType: string): string {
  const s = eventType.replace(/[._:]/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function buildJourney(input: JourneyInput): JourneyEvent[] {
  const out: (JourneyEvent | null)[] = []

  // Arrival — first touch.
  const acq = input.contact.acquisition
  if (acq && (acq.channel || acq.source)) {
    out.push(
      make(input.contact.firstSeenAt ?? input.contact.createdAt, 'first_touch', 'First touch', {
        detail: [acq.source, acq.campaign].filter(Boolean).join(' · ') || undefined,
        channel: acq.channel ?? acq.source ?? undefined,
      }),
    )
  }

  // Arrival — captured by a steward (one per private capture).
  for (const c of input.captures) {
    out.push(
      make(c.createdAt, 'captured', c.ownerName ? `Captured by ${c.ownerName}` : 'Captured by a steward', {
        channel: c.source,
      }),
    )
    out.push(make(c.invitedAt, 'invited', 'Intro / invite email sent', { channel: 'email' }))
  }

  // Arrival — became a CRM lead, then a member.
  out.push(
    make(input.contact.firstSeenAt ?? input.contact.createdAt, 'crm_lead', 'Added to the CRM', {
      channel: input.contact.source ?? undefined,
    }),
  )
  if (input.member) {
    out.push(
      make(input.member.createdAt, 'joined', 'Became a member', {
        detail: input.member.referred ? 'Referred by another member' : undefined,
      }),
    )
  }

  // In the app — QR scans + engagement ledger.
  for (const s of input.scans) {
    out.push(make(s.scannedAt, 'scan', s.codeTitle ? `Scanned “${s.codeTitle}”` : 'Scanned a QR code', { channel: 'qr' }))
  }
  for (const e of input.events) {
    if (e.eventType === 'qr_scan') continue // already represented by the scan row
    out.push(make(e.createdAt, 'engagement', humanizeEventType(e.eventType), { channel: e.source }))
  }

  // CRM activity — operator notes/tasks + pipeline deals.
  for (const a of input.activities) {
    const label = a.kind.charAt(0).toUpperCase() + a.kind.slice(1)
    out.push(make(a.createdAt, 'activity', label, { detail: a.body || undefined }))
  }
  for (const d of input.deals) {
    out.push(make(d.createdAt, 'deal', `Deal: ${d.title}`, { detail: d.status }))
  }

  // Newest first.
  return out
    .filter((e): e is JourneyEvent => e !== null)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

/** Group a built journey by phase, preserving phase order and dropping empties. */
export function groupByPhase(events: JourneyEvent[]): { phase: JourneyPhase; label: string; events: JourneyEvent[] }[] {
  return PHASE_ORDER.map((phase) => ({
    phase,
    label: PHASE_LABEL[phase],
    events: events.filter((e) => e.phase === phase),
  })).filter((g) => g.events.length > 0)
}
