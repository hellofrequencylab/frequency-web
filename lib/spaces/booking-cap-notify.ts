// BOOK-015: the owner hears about it the first time a booker is turned away for the month. Called by
// checkSpaceBookingMeter when the bookings meter refuses. Best-effort: it never throws and never blocks
// the refusal the booker sees. Once per Space per calendar month (UTC, the meter's own window): the
// outbox dedupes on `booking_cap:<space>:<YYYY-MM>`, so every later turned-away booker that month is a
// no-op insert. Account mail about the Space's own plan, like the trial-ending notice: no unsubscribe.
import { emailButton, emailShell, EMAIL_P, escapeHtml, enqueueEmail, type EmailPayload } from '@/lib/email'
import { palette } from '@/lib/theme/palette'
import { getSpaceById } from '@/lib/spaces/store'
import { profileAccountEmail } from '@/lib/profiles/account-email'
import { appOrigin } from '@/lib/sites/host'

function buildBookingCapEmail(parts: {
  to: string
  spaceName: string
  /** The cap the Space hit this month (the effective allowance), or null when unknown. */
  cap: number | null
  /** The cap is the free plan's. */
  free: boolean
  billingUrl: string
}): EmailPayload {
  const howMany = parts.cap != null ? `its ${parts.cap}${parts.free ? ' free' : ''} bookings` : 'the bookings its plan includes'
  const body = [
    `${parts.spaceName} hit ${howMany} this month, so a booker was turned away. Business takes unlimited bookings.`,
    'Bookings open again on the first of next month. Everything already booked stays as it is.',
  ]
  const why = `You are receiving this because you run ${parts.spaceName} on Frequency. We send it once a month at most.`
  const html = emailShell(
    [
      ...body.map((p) => `<p data-fq="fq-p" style="${EMAIL_P}color:${palette.text};">${escapeHtml(p)}</p>`),
      emailButton('See Business', parts.billingUrl),
    ].join('\n'),
    { text: escapeHtml(why), unsubscribe: false },
  )
  const text = `${body.join('\n\n')}\n\nSee Business: ${parts.billingUrl}\n\n${why}\n`
  return { to: parts.to, subject: `A booker was turned away from ${parts.spaceName}`, html, text }
}

/** Tell the owner, once this month, that the bookings meter turned a booker away. FAIL-SOFT. */
export async function notifyBookingCapReached(
  spaceId: string,
  verdict: { effective?: number | null; plan?: string | null },
  now: Date = new Date(),
): Promise<void> {
  try {
    const space = await getSpaceById(spaceId)
    if (!space?.ownerProfileId) return
    const to = await profileAccountEmail(space.ownerProfileId)
    if (!to) return
    const month = now.toISOString().slice(0, 7)
    await enqueueEmail(
      buildBookingCapEmail({
        to,
        spaceName: space.brandName?.trim() || space.name,
        cap: typeof verdict.effective === 'number' ? verdict.effective : null,
        free: (verdict.plan ?? 'free') === 'free',
        billingUrl: `${appOrigin()}/spaces/${space.slug}/settings/billing`,
      }),
      { dedupeKey: `booking_cap:${spaceId}:${month}` },
    )
  } catch {
    /* best-effort: the booker's refusal never waits on the owner's notice */
  }
}
