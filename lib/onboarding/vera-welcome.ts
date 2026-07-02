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

/** Which vector spot-illustration a slide shows (see components/onboarding/
 *  welcome-art.tsx). */
export type DeckArt = 'welcome' | 'feed' | 'circles' | 'practices' | 'events' | 'zaps' | 'vera'

export interface DeckSlide {
  eyebrow: string
  title: string
  body: string
  /** The illustration that sits above the copy. */
  art: DeckArt
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

/** The lightbox's welcome deck: a short, narrated walk-through Vera gives the moment
 *  a Founder lands. The first slide is personalized (it reflects their own words back);
 *  the rest are a calm tour of the site, one element per slide with its own
 *  illustration, ending on Vera's handoff into the chat. Natural, warm, her voice. */
export function buildWelcomeSlides(ctx: VeraWelcomeContext): DeckSlide[] {
  const first = clean(ctx.firstName, 40)
  const intent = clean(ctx.intent)
  const interests = clean(ctx.interests, 120)

  // Slide 1 — pick up the thread from induction, in her own warm voice. These are
  // Founders who just signed the Beta agreement, so she meets that moment: you're
  // here early to help shape the place, not just use it.
  const continuance: DeckSlide = {
    art: 'welcome',
    eyebrow: 'Welcome, Founder',
    title: first ? `You're in, ${first}.` : "You're in.",
    body: intent
      ? `Founder isn't just a label. You signed on to help build this place while it's still rough, and I don't take that lightly. You also told me what you came for: "${intent}." I've got it. Let me show you around first.`
      : interests
        ? `Founder isn't just a label. You signed on to help build this place while it's still rough. You also mentioned you're into ${interests}, and this whole place exists to connect you with the people who share it. Let me show you how it fits.`
        : "Founder isn't just a label. You signed on to help build this place while it's still rough, which puts you in early, before most. Let me give you the quick tour, then we'll find your people.",
  }

  // Slides 2-7 — the tour: one surface at a time, what it is and what it's for.
  const tour: DeckSlide[] = [
    {
      art: 'feed',
      eyebrow: 'Start here',
      title: 'This is home.',
      body: "Your feed is the first thing you land on. It's quiet right now, on purpose. The moment you join a circle it comes alive with what your people are posting, planning, and showing up for.",
    },
    {
      art: 'circles',
      eyebrow: 'The heart of it',
      title: 'Circles are your people.',
      body: 'A circle is a small group around one shared thing: a trail, a table, a quiet morning practice. Find one that feels like you, show up, and everything else here grows out of that.',
    },
    {
      art: 'practices',
      eyebrow: 'Something to keep',
      title: 'Practices keep you steady.',
      body: 'A practice is a small ritual you come back to: a walk, a sit, a single page. Claim one, log it day by day, and watch your streak build. Healthy living, made into a game you actually want to play.',
    },
    {
      art: 'events',
      eyebrow: 'Where it gets real',
      title: 'Events bring you together.',
      body: 'All of it leads somewhere with a door: a room, a beach, a kitchen table. RSVP to a gathering near you, turn up, and the faces on your screen become the people in your week.',
    },
    {
      art: 'zaps',
      eyebrow: 'The fun part',
      title: 'Showing up earns its keep.',
      body: 'You collect Zaps for the real things: turning up, keeping a practice, bringing a friend. Finish Journeys to climb the season ranks and fill the Vault. Gems are the lighter, everyday kind. Both reward the same thing, being here.',
    },
    {
      art: 'vera',
      eyebrow: 'And me?',
      title: "I'm Vera.",
      body: "I keep this place running, and right now I've got one job: getting you to people you'd actually want to know. Ask me anything, anytime. When you're ready, let's find your first circle.",
    },
  ]

  return [continuance, ...tour]
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
    message = `${greet} You just signed on to help build this place, so you're in early, while it's still taking shape. I remember what you came for too: "${intent}." My one job right now is getting you to people you'd actually want to know. Want me to point you at a circle?`
  } else if (interests) {
    message = `${greet} ${interests}, that's a good start. You're in early as a Founder, here to help shape this, not just use it. My job now is getting you to people you'd click with. Ready to find your circle?`
  } else {
    message = `${greet} You're in early as a Founder, here to help shape this place while it's still rough. I keep it running, and my job now is simple: get you to your people. Ready to find a circle?`
  }

  return {
    message,
    suggestions: ['Find my circle', 'How does this work?', 'What should I do first?'],
    stage: 'orient',
  }
}
