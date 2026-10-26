import { Suspense } from 'react'
import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEventInviteToken } from '@/lib/qr/event-invite'
import { formatEventDateTime } from '@/lib/utils'
import { FnColumn, FnHero, FnOutcomePage, FnOutcomeSkeleton } from '@/components/frequency/site/pages/funnel/parts'
import { FrequencyRsvpForm } from '@/components/frequency/site/pages/funnel/rsvp-form'

// noindex: a per-invite capture surface reached only from a member's attributed QR. It is
// not a crawl target, and it carries a signed token (SEO check + CONTENT-VOICE §8).
export const metadata: Metadata = {
  title: 'RSVP',
  robots: { index: false },
}

export const dynamic = 'force-dynamic'

// ── HOW MUCH OF THE KIT THIS PAGE COMPOSES (Phase 6 Pass B judgement) ────────────────────────────
// Partly, deliberately, and the seam is the point.
//
//  · Its FAILURE states (dead link, cancelled event) are the same "one outcome, one CTA" lockup the
//    two confirm landings render, and they had already drifted from them in padding and CTA chrome.
//    Those now come from the kit's `Outcome` block. That is where the duplication lived.
//  · Its CAPTURE state stays bespoke. marketing-ui is an EDITORIAL block library (photo heroes,
//    zig-zags, pull quotes, statements) for pages a visitor browses. This is a noindex, single-
//    purpose, token-scoped form reached from one person's QR code: no hero, no nav intent, nothing
//    to browse. Forcing it through an editorial block would mean inventing a marketing block that
//    exists to hold a form, which is a worse abstraction than the twelve lines of layout it replaces.
//
// SPEED (PAGE-FRAMEWORK §5.3): this page is `force-dynamic` and its body needs two Supabase reads.
// The page function itself awaits nothing, so the marketing chrome streams straight away and only
// the invite panel waits, behind a dimension-matched skeleton.
// ────────────────────────────────────────────────────────────────────────────────────────────────

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

export default function EventRsvpPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<FnOutcomeSkeleton />}>
      <RsvpInvite params={params} />
    </Suspense>
  )
}

async function RsvpInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await loadInvite(token)

  if (!invite || invite.cancelled) {
    return (
      <FnOutcomePage
        tone="danger"
        icon="event"
        title={invite?.cancelled ? 'This event is off.' : 'This link didn’t work.'}
        action={{ href: '/', label: 'See what Frequency is' }}
      >
        {invite?.cancelled
          ? 'The host called this one off. Ask whoever invited you for the next one.'
          : 'It may have expired. Ask the person who invited you to share a fresh one.'}
      </FnOutcomePage>
    )
  }
  return (
    <>
      <FnHero
        center
        kicker={invite.inviterName ? `${invite.inviterName} invited you` : undefined}
        title={invite.eventTitle}
        lede={invite.eventWhen ?? undefined}
        meta={invite.eventLocation ?? undefined}
      />
      <FnColumn label="02 RSVP">
        <FrequencyRsvpForm token={token} />
      </FnColumn>
    </>
  )
}
