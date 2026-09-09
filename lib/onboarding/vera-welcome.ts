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
export type DeckArt = 'welcome' | 'feed' | 'circles' | 'practices' | 'events' | 'spaces' | 'vera'

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

  // Slides 2-7 — the tour, told in the four nouns (LIVE-258). Space, Circle, Event and
  // Practice are what this place is made of, and Circles are the heart, so the deck opens on
  // home, spends its weight on Circles, then Events, then the Practice you keep between them,
  // and closes the tour on the Space that hosts it all (hosting is free, which is the whole
  // shape of the model). The Quest — Zaps, Journeys, season ranks — had a slide of its own here
  // until 2026-09-09, teaching a member to collect points before they had met a single person.
  // It is now one line inside the Practice slide: a side thing we all do together, not the centre.
  const tour: DeckSlide[] = [
    {
      art: 'feed',
      eyebrow: 'Start here',
      title: 'This is home.',
      body: "Your feed is the first thing you land on. It's quiet right now, on purpose. The moment you join a Circle it comes alive with what your people are posting, planning, and showing up for.",
    },
    {
      art: 'circles',
      eyebrow: 'The heart of it',
      title: 'Circles are your people.',
      body: 'A Circle is a small group around one shared thing: a trail, a table, a quiet morning practice. Find one that feels like you, show up, and everything else here grows out of that.',
    },
    {
      art: 'events',
      eyebrow: 'Where it gets real',
      title: 'Events bring you together.',
      body: 'An Event is a Circle with a door on it: a room, a beach, a kitchen table. Say you are coming to one near you, turn up, and the faces on your screen become the people in your week.',
    },
    {
      art: 'practices',
      eyebrow: 'Between the gatherings',
      title: 'Practices are what you keep.',
      body: 'A Practice is one small thing you come back to: a walk, a sit, a single page. Keep one and you will find there is a Quest running alongside it, points and seasons and all. Play it or ignore it. The walk is the point.',
    },
    {
      art: 'spaces',
      eyebrow: 'Who hosts',
      title: 'Spaces are the hosts.',
      body: 'A Space is the home a studio, a shop or a nonprofit keeps here. Hosting is free, so the people who run things in your town put their Circles and Events where you will actually find them. Open one yourself whenever you want.',
    },
    {
      art: 'vera',
      eyebrow: 'And me?',
      title: "I'm Vera.",
      body: "I keep this place running, and right now I've got one job: getting you to people you'd actually want to know. Ask me anything, anytime. When you're ready, let's find your first Circle.",
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
