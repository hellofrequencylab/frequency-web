// THE GUEST'S KEY TO ONE SEAT (PROG-GD2, migration 20270345004200).
//
// A signed-out guest holds a seat and nothing else: no account, no bell, no "my events" page. The
// receipt email is their whole record, and until this module it offered no way to say "I can't
// make it", so a guest seat held capacity until the event ended and the waitlist behind it never
// moved. The receipt now carries ONE link, /events/<slug>/seat/<token>, and the token addresses
// exactly one event_rsvps row.
//
// ── WHERE THE AUTHORITY LIVES ────────────────────────────────────────────────────────────────────
// In the database, the way every guest door in this family is built (capture_guest_rsvp,
// claim_guest_rsvps, the guest ticket checkout). Three SECURITY DEFINER functions granted to anon
// take the token and decide everything: read_guest_seat, update_guest_seat, release_guest_seat.
// They are reachable over PostgREST directly, so nothing in this file, the page or the action is a
// security boundary; the SQL hashes the token, checks the event is live, and refuses a member row,
// a claimed row and a cleared token. This module is the parser and the URL builder beside them.
//
// ── THE GET IS A READ, BY CONSTRUCTION ──────────────────────────────────────────────────────────
// Mail scanners pre-click links. The page renders state on GET and waits for a submit; it must
// never act on arrival. read_guest_seat is declared STABLE, which Postgres enforces (a STABLE
// function cannot INSERT, UPDATE or DELETE), and the page reads through loadGuestSeat and nothing
// else. The source-shape test beside the page pins the second half.
//
// ── WHAT THE TOKEN NEVER UNLOCKS (ADR-854) ───────────────────────────────────────────────────────
// The view the SQL returns carries no location, venue, street, host or attendee field, so a
// hidden-address event (ADR-825) has nothing here to leak, and parseGuestSeat keeps only the named
// keys so a widened return cannot reach the page unnoticed. The token never becomes a session and
// never moves a seat INTO 'going'.

/** A seat token is a uuid minted by mint_guest_seat_token. Anything else never reaches the DB. */
const SEAT_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSeatToken(token: unknown): token is string {
  return typeof token === 'string' && SEAT_TOKEN_RE.test(token)
}

/** The member rule (setRsvpPlusOnes in app/(main)/events/actions.ts), and the SQL clamp. */
export const MAX_GUEST_PLUS_ONES = 5

export type GuestSeatQuestionType =
  | 'short_text'
  | 'long_text'
  | 'dropdown'
  | 'multi_select'
  | 'boolean'
  | 'number'

export interface GuestSeatQuestion {
  id: string
  prompt: string
  type: GuestSeatQuestionType
  options: string[]
  required: boolean
  /** This seat's saved answer, '' when there is none yet. */
  answer: string
}

/** Everything a bearer may be shown. Deliberately no location, venue, host or other attendee. */
export interface GuestSeatView {
  rsvpId: string
  eventId: string
  slug: string
  title: string
  startsAt: string
  endsAt: string | null
  timeZone: string | null
  status: 'going' | 'waitlist' | 'maybe' | 'not_going'
  approvalStatus: 'none' | 'pending' | 'approved'
  plusOnes: number
  guestName: string | null
  questions: GuestSeatQuestion[]
}

/** What the seat IS, in the guest's terms. Approval outranks status, exactly as the receipt
 *  composes it (lib/events/guest-rsvp-email.ts): a 'going' row with a pending approval is a
 *  request, not a spot. */
export type GuestSeatState = 'going' | 'waitlist' | 'pending' | 'not_going'

export function guestSeatState(view: Pick<GuestSeatView, 'status' | 'approvalStatus'>): GuestSeatState {
  if (view.approvalStatus === 'pending') return 'pending'
  if (view.status === 'going') return 'going'
  if (view.status === 'waitlist') return 'waitlist'
  return 'not_going'
}

const QUESTION_TYPES: ReadonlySet<string> = new Set([
  'short_text', 'long_text', 'dropdown', 'multi_select', 'boolean', 'number',
])

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function parseQuestion(raw: unknown): GuestSeatQuestion | null {
  if (!raw || typeof raw !== 'object') return null
  const q = raw as Record<string, unknown>
  const id = str(q.id)
  const prompt = str(q.prompt)
  const type = str(q.type)
  if (!id || !prompt || !type || !QUESTION_TYPES.has(type)) return null
  const options = Array.isArray(q.options)
    ? q.options.filter((o): o is string => typeof o === 'string')
    : []
  return {
    id,
    prompt,
    type: type as GuestSeatQuestionType,
    options,
    required: q.required === true,
    answer: str(q.answer) ?? '',
  }
}

/**
 * Parse the jsonb read_guest_seat returns. Strict and key-by-key: a null, a non-object, or a
 * shape without the fields the page needs all read as "no seat", and any key the SQL might grow
 * later is dropped here rather than reaching the page.
 */
export function parseGuestSeat(raw: unknown): GuestSeatView | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const rsvpId = str(r.rsvp_id)
  const eventId = str(r.event_id)
  const slug = str(r.slug)
  const title = str(r.title)
  const startsAt = str(r.starts_at)
  const status = str(r.status)
  const approval = str(r.approval_status) ?? 'none'
  if (!rsvpId || !eventId || !slug || !title || !startsAt || !status) return null
  if (!['going', 'waitlist', 'maybe', 'not_going'].includes(status)) return null
  if (!['none', 'pending', 'approved'].includes(approval)) return null
  const plusRaw = typeof r.plus_ones === 'number' ? r.plus_ones : 0
  const questions = Array.isArray(r.questions)
    ? r.questions.map(parseQuestion).filter((q): q is GuestSeatQuestion => q !== null)
    : []
  return {
    rsvpId,
    eventId,
    slug,
    title,
    startsAt,
    endsAt: str(r.ends_at),
    timeZone: str(r.time_zone),
    status: status as GuestSeatView['status'],
    approvalStatus: approval as GuestSeatView['approvalStatus'],
    plusOnes: Math.max(0, Math.min(MAX_GUEST_PLUS_ONES, Math.trunc(plusRaw))),
    guestName: str(r.guest_name),
    questions,
  }
}

/** The narrow RPC surface this module needs from either Supabase client (ADR-246). */
export type SeatRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * The seat a token addresses on THIS event's page, or null. Null for a malformed token (no DB
 * call is made), a wrong, expired, released or claimed token, an RPC error, and a token whose
 * seat belongs to a different event than the page's slug says. All of those render the same
 * neutral page: the token is 122 bits of randomness, and the page never says which it was.
 */
export async function loadGuestSeat(
  client: SeatRpcClient,
  token: unknown,
  slug: string,
): Promise<GuestSeatView | null> {
  if (!isSeatToken(token)) return null
  try {
    const { data, error } = await client.rpc('read_guest_seat', { p_token: token })
    if (error) {
      console.error('[guest seat] read_guest_seat failed', { error: error.message })
      return null
    }
    const view = parseGuestSeat(data)
    if (!view || view.slug !== slug) return null
    return view
  } catch (e) {
    console.error('[guest seat] read_guest_seat threw', { error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/** The path the receipt links to. */
export function guestSeatPath(slug: string, token: string): string {
  return `/events/${encodeURIComponent(slug)}/seat/${encodeURIComponent(token)}`
}

/**
 * Mint (rotate) the seat token for one guest seat and return the full URL the receipt carries,
 * or null when the row is not a live guest seat. `client` must be the ADMIN client: the mint
 * function is granted to service_role only, and this helper takes the client as an argument so
 * the callers that already hold one (the receipt senders) mint without this module importing it.
 * The plaintext exists here once, on its way into an email addressed to the seat's own address.
 */
// authz-ok: the write is scoped to one rsvp id the caller read moments earlier by (event, email),
// and the SQL refuses any row that is not an unclaimed guest seat.
export async function mintGuestSeatUrl(
  client: SeatRpcClient,
  rsvpId: string,
  slug: string,
  appUrl: string,
): Promise<string | null> {
  try {
    const { data, error } = await client.rpc('mint_guest_seat_token', { p_rsvp_id: rsvpId })
    if (error) {
      console.error('[guest seat] mint_guest_seat_token failed', { rsvpId, error: error.message })
      return null
    }
    if (!isSeatToken(data)) return null
    return `${appUrl}${guestSeatPath(slug, data)}`
  } catch (e) {
    console.error('[guest seat] mint_guest_seat_token threw', { rsvpId, error: e instanceof Error ? e.message : String(e) })
    return null
  }
}
