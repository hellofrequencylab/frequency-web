'use server'

import { headers } from 'next/headers'
import { isSuppressed } from '@/lib/suppression'
import { resolveAcquisition } from '@/lib/attribution/server'
import { rateLimitOk } from '@/lib/rate-limit'
import { sendCoursePreviewEmail } from '@/lib/email'
import { requestOptin } from '@/lib/crm/optin/store'
import { buildOptinConfirmUrl } from '@/lib/crm/optin/tokens'
import { SITE_URL } from '@/lib/site'
import { getPublicJourney } from '@/lib/journey-plans'
import { isFrequencyCourse } from '@/lib/courses/library'
import { courseHref, offersCertified } from '@/lib/courses/tracks'
import { submitCommunityBook } from '@/lib/courses/credentials'
import { getMyProfileId } from '@/lib/auth'
import { getCourseContext } from '@/lib/courses/course-context'
import { runLabel, sessionTime } from '@/lib/courses/run-format'
import { log } from '@/lib/log'

export type CoursePreviewResult = { ok: true } | { ok: false; error: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const SLUG_RE = /^[a-z0-9-]{1,120}$/

/**
 * "Email me Week 1" on a course page (owner 2026-11-18, the Journeys lead funnel). A visitor enters their
 * own address and gets ONE transactional email: the Week 1 link and the next Run's dates. The contact is
 * found or created in the root Space with source `course_preview:<slug>` (attribution: which course
 * brought them in), and consent does NOT move: being on the notes list still takes the confirm link, which
 * the same email carries only when the address is not on the list yet.
 *
 * Same posture as /subscribe: one success for every outcome, so the form cannot enumerate addresses; a
 * suppressed address gets nothing; a per-IP rate limit.
 */
// authz-ok: anonymous by design, a person submitting their own address for public course content behind a
// per-IP rate limit. requestOptin only finds or creates the contact row and never flips consent; consent moves
// only through the HMAC confirm link mailed to that same address.
export async function requestCoursePreview(input: { email: string; slug: string }): Promise<CoursePreviewResult> {
  const email = (input.email || '').trim().toLowerCase()
  const slug = (input.slug || '').trim()
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Please enter a valid email address.' }
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'That course was not found.' }

  const hdrs = await headers()
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() || hdrs.get('x-real-ip') || 'unknown'
  if (!(await rateLimitOk('course-preview', ip, 5, '10 m'))) {
    return { ok: false, error: 'Too many tries. Give it a few minutes and try again.' }
  }

  const found = await getPublicJourney(slug)
  if (!found || !(await isFrequencyCourse(found.plan))) return { ok: false, error: 'That course was not found.' }
  const { plan } = found

  const suppressed = await isSuppressed(email)
  if (suppressed) return { ok: true }

  const outcome = await requestOptin({
    email,
    name: null,
    suppressed,
    source: `course_preview:${slug}`,
    acquisition: await resolveAcquisition(),
  })

  try {
    const base = SITE_URL.replace(/\/$/, '')
    const path = courseHref(slug)
    const ctx = await getCourseContext(plan)
    const label = runLabel(ctx.sessions)
    const first = ctx.sessions[0]
    await sendCoursePreviewEmail({
      to: email,
      courseTitle: plan.title,
      week1Url: `${base}/courses/${slug}/week-1`,
      courseUrl: `${base}${path}`,
      run: label && first ? { label, time: sessionTime(first), seatUrl: `${base}/events/${first.slug}` } : null,
      confirmUrl:
        outcome.action === 'send_confirm' && outcome.emailToConfirm ? buildOptinConfirmUrl(SITE_URL, outcome.emailToConfirm) : null,
    })
  } catch (err) {
    log.error('courses.preview_email_failed', { slug, error: err instanceof Error ? err.message : String(err) })
    return { ok: false, error: 'Something went wrong on our end. Please try again.' }
  }
  return { ok: true }
}

export type CertifyResult = { ok: true } | { ok: false; error: string }

/**
 * Send in a Community Book for Certified review (owner 2026-11-17: "Send in your Community Book, filled in
 * from real gatherings, and Frequency reviews it for Certified"). The signed-in holder only: the profile is
 * derived from the session, never taken from the form. One waiting submission per person per course.
 */
// authz-ok: the writer is the session's own profile (getMyProfileId), on a public Frequency course that offers
// Certified; the row is theirs alone and service-role only, so this action is the one door to it.
export async function submitCommunityBookAction(input: { slug: string; body: string }): Promise<CertifyResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return { ok: false, error: 'Sign in to send in your Community Book.' }
  const slug = (input.slug || '').trim()
  const body = (input.body || '').trim()
  if (!SLUG_RE.test(slug) || !offersCertified(slug)) return { ok: false, error: 'This course does not offer Certified.' }
  if (body.length < 40) return { ok: false, error: 'Add your four pages, or the links to them, before you send.' }
  if (body.length > 20000) return { ok: false, error: 'That is longer than we can take. Send links to the pages instead.' }
  const found = await getPublicJourney(slug)
  if (!found || !(await isFrequencyCourse(found.plan))) return { ok: false, error: 'That course was not found.' }
  const res = await submitCommunityBook(found.plan.id, profileId, body)
  if (res.ok) return { ok: true }
  return {
    ok: false,
    error: res.reason === 'open' ? 'Your Community Book is already waiting for review.' : 'That did not send. Please try again.',
  }
}
