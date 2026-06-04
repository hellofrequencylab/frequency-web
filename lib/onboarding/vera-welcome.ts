// Vera's onboarding welcome — the warm continuance (ADR-066 Phase D).
//
// By the time a Founder lands on the feed, induction already gathered who they
// are, where they are, and what they came for (profiles.meta.beta). So Vera must
// NOT open cold with "what brought you here?" — she picks up the thread. These
// pure builders turn that induction context into the lightbox's inspirational
// deck + Vera's first line. Deterministic and dark-safe: they work whether or not
// the AI kernel is live, and they're unit-tested. No em dashes in member-visible
// copy (house style).

export interface VeraWelcomeContext {
  firstName: string | null
  /** Their answer to "what are you hoping to find here?" (verbatim). */
  intent: string | null
  /** Comma-separated interests they typed at induction. */
  interests: string | null
  /** City label, e.g. "Encinitas, CA". */
  location: string | null
}

export interface DeckSlide {
  eyebrow: string
  title: string
  body: string
}

export interface VeraOpening {
  message: string
  suggestions: string[]
  /** We already learned them at induction, so the chat resumes mid-arc. */
  stage: 'orient'
}

/** Tidy a free-text field for inline quoting: trim, unwrap stray quotes, collapse
 *  whitespace, drop a trailing period, and cap length. Returns '' if empty. */
function clean(v: string | null | undefined, max = 180): string {
  if (!v) return ''
  return v
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .slice(0, max)
    .trim()
}

/** The lightbox's short, personalized "slide deck": one continuance slide that
 *  reflects their own words back, then one instructional slide. */
export function buildWelcomeSlides(ctx: VeraWelcomeContext): DeckSlide[] {
  const first = clean(ctx.firstName, 40)
  const intent = clean(ctx.intent)
  const interests = clean(ctx.interests, 120)

  const continuance: DeckSlide = {
    eyebrow: 'Welcome, Founder',
    title: first ? `You're in, ${first}.` : "You're in.",
    body: intent
      ? `Before you came through the door, you told us what you're after: "${intent}." We were listening. Now let's make it real.`
      : interests
        ? `You said you're into ${interests}. Good. The whole point here is finding the people who share it.`
        : "You're one of the very first through the door. Let's get you to your people.",
  }

  const instructional: DeckSlide = {
    eyebrow: 'How this works',
    title: 'Circles are your people.',
    body: 'Find one. Show up. That is the whole thing. The events, the practices, the feed, all of it grows out of showing up to a circle near you.',
  }

  return [continuance, instructional]
}

/** Vera's opening line in the chat — a continuance, not a cold greeting. She
 *  references what they already told her, then points at the one next action that
 *  matters: a real circle. */
export function buildVeraOpening(ctx: VeraWelcomeContext): VeraOpening {
  const first = clean(ctx.firstName, 40)
  const intent = clean(ctx.intent)
  const interests = clean(ctx.interests, 120)
  const greet = first ? `Welcome in, ${first}.` : 'Welcome in.'

  let message: string
  if (intent) {
    message = `${greet} I remember what you came for: "${intent}." I keep that kind of thing in mind. My one job right now is getting you to people you'd actually want to know. Want me to point you at a circle?`
  } else if (interests) {
    message = `${greet} ${interests}, that's a good start. I keep this place running, and my job now is getting you to people you'd click with. Ready to find your circle?`
  } else {
    message = `${greet} You made it through the oath, so you're serious. I keep this place running. My job now is simple: get you to your people. Ready to find a circle?`
  }

  return {
    message,
    suggestions: ['Find my circle', 'How does this work?', 'What should I do first?'],
    stage: 'orient',
  }
}
