import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarX } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEventInviteToken } from '@/lib/qr/event-invite'
import { formatEventDateTime } from '@/lib/utils'
import { RsvpForm } from './form'

// noindex: a per-invite capture surface reached only from a member's attributed QR. It is
// not a crawl target, and it carries a signed token (SEO check + CONTENT-VOICE §8).
export const metadata: Metadata = {
  title: 'RSVP',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

// What the public page renders about the event + inviter. PUBLIC-SAFE ONLY: the event's
// own title/time and the inviter's display name. Never the inviter's contacts or any
// personal data (ADR-154 privacy invariant).
interface InvitePublic {
  inviterName: string | null
  eventTitle: string
  eventWhen: string | null
  eventLocation: string | null
  cancelled: boolean
}

async function loadInvite(token: string): Promise<InvitePublic | null> {
  const invite = verifyEventInviteToken(token)
  if (!invite) return null

  const admin = createAdminClient()
  const [{ data: event }, { data: inviter }] = await Promise.all([
    admin
      .from('events')
      .select('title, starts_at, ends_at, location, is_cancelled')
      .eq('id', invite.eventId)
      .maybeSingle(),
    admin.from('profiles').select('display_name, is_active, is_system').eq('id', invite.inviterProfileId).maybeSingle(),
  ])
  if (!event) return null

  const ev = event as { title: string; starts_at: string; ends_at: string | null; location: string | null; is_cancelled: boolean | null }
  const inv = inviter as { display_name: string | null; is_active: boolean | null; is_system: boolean | null } | null

  return {
    inviterName: inv && inv.is_active !== false && !inv.is_system ? inv.display_name : null,
    eventTitle: ev.title,
    eventWhen: (() => {
      try {
        return formatEventDateTime(ev.starts_at)
      } catch {
        return null
      }
    })(),
    eventLocation: ev.location,
    cancelled: ev.is_cancelled === true,
  }
}

export default async function EventRsvpPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await loadInvite(token)

  return (
    <section className="px-6 py-24 sm:py-28">
      <div className="max-w-md mx-auto">
        {!invite || invite.cancelled ? (
          <div className="text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-danger-bg text-danger flex items-center justify-center mb-6">
              <CalendarX className="w-7 h-7" strokeWidth={2.5} aria-hidden />
            </div>
            <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-4">
              {invite?.cancelled ? 'This event is off.' : 'This link didn’t work.'}
            </h1>
            <p className="text-lg text-muted leading-relaxed mb-8">
              {invite?.cancelled
                ? 'The host called this one off. Ask whoever invited you for the next one.'
                : 'It may have expired. Ask the person who invited you to share a fresh one.'}
            </p>
            <Link
              href="/"
              className="inline-flex rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors"
            >
              See what Frequency is
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              {invite.inviterName && (
                <p className="text-sm font-bold uppercase tracking-wide text-primary mb-3">
                  {invite.inviterName} invited you
                </p>
              )}
              <h1 className="font-display uppercase text-text text-4xl sm:text-5xl mb-3">{invite.eventTitle}</h1>
              {invite.eventWhen && <p className="text-lg text-muted leading-relaxed">{invite.eventWhen}</p>}
              {invite.eventLocation && <p className="text-base text-muted leading-relaxed">{invite.eventLocation}</p>}
            </div>
            <RsvpForm token={token} />
          </>
        )}
      </div>
    </section>
  )
}
