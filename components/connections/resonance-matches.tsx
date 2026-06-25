import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, ArrowRight } from 'lucide-react'
import { getMyProfileId } from '@/lib/auth'
import { getMatchingConsent } from '@/lib/resonance/matches'
import { getResonanceMatchesForPerson, matchWhyLine, matchStrengthLabel } from '@/lib/resonance/surface'
import { AcceptIntroButton } from './accept-intro-button'

// The member's own Resonance Engine matches (ADR-385): the few people they would most click with,
// from the Circles, Journeys, practices, and Pillars they already share. CONSENT-FIRST and fail-safe:
// a member who has not opted in sees the opt-in invite (never anyone's data); an opted-in member with
// no edges yet sees a calm empty state; otherwise the strongest matches, each with the member-side
// "introduce us" tap (records consent only — no message is sent here). Self-fetching server component;
// returns null only when there is no viewer so it can be dropped onto any signed-in surface.
export async function ResonanceMatches() {
  const profileId = await getMyProfileId()
  if (!profileId) return null
  const consent = await getMatchingConsent(profileId)

  if (!consent.optedIn) {
    return (
      <section className="rounded-2xl border border-primary/30 bg-primary-bg/40 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text">
          <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden /> People you would click with
        </h2>
        <p className="mt-1 text-sm text-muted">
          Turn on Resonance matching and Frequency will quietly find the few people you would most
          enjoy meeting, from what you already share. You decide before anyone is introduced.
        </p>
        <Link
          href="/settings/connections"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover"
        >
          Turn on matching <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    )
  }

  const matches = await getResonanceMatchesForPerson(profileId)
  if (matches.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text">
          <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden /> People you would click with
        </h2>
        <p className="mt-1 text-sm text-muted">
          No matches yet. As you show up in Circles and practices, we will find the people you resonate
          with. Matches are private to you.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-text">
        <Sparkles className="h-4 w-4 text-primary-strong" aria-hidden /> People you would click with
      </h2>
      <p className="mt-1 text-sm text-muted">
        The few people you most resonate with, by what you share. Tap to ask for an intro. No one is
        introduced until you both say yes, and a human sends the hello.
      </p>
      <ul className="mt-4 space-y-3">
        {matches.map((m) => (
          <li key={m.profileId} className="flex items-center gap-3 rounded-xl border border-border bg-surface-elevated/40 p-3">
            {m.avatarUrl ? (
              <Image
                src={m.avatarUrl}
                alt=""
                width={44}
                height={44}
                sizes="44px"
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong" aria-hidden>
                {m.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{m.name}</p>
              <p className="truncate text-xs text-muted">
                {matchStrengthLabel(m.score)} · {matchWhyLine(m.reasons)}
              </p>
            </div>
            <AcceptIntroButton otherProfileId={m.profileId} />
          </li>
        ))}
      </ul>
    </section>
  )
}
