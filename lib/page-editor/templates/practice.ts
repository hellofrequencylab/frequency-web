import type { Data } from '@measured/puck'

// /practice. The participant landing, authored from the standardized block library
// so the editor mirrors the live page (ADR-055 / "editor = live"). Audience: the
// Seeker (CONTENT-VOICE §2a). Promise: start where you are, today. Surfaces:
// Journeys, Practices, the Mindless timer, all virtual and solo-first. First
// action: do one practice today. Names follow NAMING.md (Journey, Practice,
// Mindless tagline "Get out of your head, and into your life"). Voice: plain
// sentences, no narrated feelings, no surface wellness jargon, no em or en dashes.
const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    {
      type: 'Hero',
      props: {
        id: 'practice-hero', variant: 'split',
        eyebrow: 'For right now',
        title: 'Start where you are, today.', titleAccent: 'today.',
        subtitle: 'No Circle near you yet. That is fine. The Practices, the Journeys, and the Mindless timer all work from your couch, on your own, in five minutes before your coffee.',
        image: '/images/site/36d99363-e483-40a0-b173-7e7ee6c1b379.jpg', focal: 'center',
        minHeight: 'auto',
        ctaPrimaryLabel: 'Do one practice today', ctaPrimaryHref: '/onboarding/beta',
        ctaSecondaryLabel: 'Browse Journeys', ctaSecondaryHref: '/discover/journeys', note: '',
        tone: 'ink', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Manifesto',
      props: {
        id: 'practice-manifesto',
        text: 'You do not have to feel ready. You just have to do the first one.',
        accent: 'do the first one.',
        tone: 'ink', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'practice-why-h', eyebrow: 'The honest version',
        title: 'Five minutes counts. That is the whole idea.', titleAccent: '',
        kicker: 'Small acts, done often, beat a big plan you never start.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'practice-why-b',
        body: "A Practice is one small real-world act: a short sit, a walk, thirty seconds of cold water, a note to a friend you have been meaning to text. You log it, and it counts toward your season. No room to show up to, no schedule to clear.\n\nString Practices together and you have a Journey: a guided track for the mind, the body, or the spirit that you walk over a few weeks. Yes, it is a game. We just made it a game so you would actually do it.",
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'practice-f1', illustration: 'practice', side: 'left',
        eyebrow: 'Practices', title: 'One small act, logged.', titleAccent: 'logged.',
        body: 'Pick a Practice and do it. Five minutes before coffee, a walk on the drive home, a breath before the meeting. Log it and earn your first Zap. The point is the doing, and the log is just the record that you showed up for yourself.',
        ctaLabel: 'Do one practice today', ctaHref: '/onboarding/beta',
        tone: 'surface', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'practice-f2', illustration: 'mindless', side: 'right',
        eyebrow: 'Mindless', title: 'Get out of your head, and into your life.', titleAccent: 'into your life.',
        body: "Mindless is the timer for when everything is too loud. Open it, pick Be Still for a quiet sit or Get Moving for a walk, and set the minutes. A soft mark on the screen, a count down, and you are done. No streak guilt, no feed waiting at the end.",
        ctaLabel: '', ctaHref: '',
        tone: 'canvas', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'practice-f3', illustration: 'journey', side: 'left',
        eyebrow: 'Journeys', title: 'A track you can walk over a season.', titleAccent: 'over a season.',
        body: 'Each season of the Quest has three Journeys: one for the mind, one for the body, one for the spirit. Walk one at your own pace, on your own, and finish it to earn a Trophy. You can do every step of it virtually, long before there is a Circle on your street.',
        ctaLabel: 'Browse Journeys', ctaHref: '/discover/journeys',
        tone: 'surface', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'practice-stmt', text: 'Day one is just five minutes. Then it is day two.', accent: 'five minutes.', tone: 'ink', layout: L },
    },
    {
      type: 'Heading',
      props: {
        id: 'practice-steps-h', eyebrow: 'How to start', title: 'Three steps, starting now.', titleAccent: '',
        kicker: 'No room to find, no plans to clear. Open the app and do the first one.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'practice-steps', eyebrow: '', title: '', titleAccent: '', style: 'number', columns: '3',
        items: [
          { icon: 'Compass', image: '', title: 'Pick a Practice', body: 'Choose one small act from the library. Sort by the time you have, not the mood you are in. Five minutes is a real choice.', href: '' },
          { icon: 'Heart', image: '', title: 'Do it today', body: 'Set the Mindless timer, or just do the act, and log it. That is the whole thing. You earn your first Zap the moment you finish.', href: '' },
          { icon: 'Flame', image: '', title: 'Come back tomorrow', body: 'Do one more. A streak is just two days, then three. The season is long, and every day you show up adds up.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Accordion',
      props: {
        id: 'practice-faq', eyebrow: 'Questions', title: 'What practicing solo looks like.', titleAccent: '',
        items: [
          { q: 'Do I need to join a Circle?', a: 'No. Practices, Journeys, and the Mindless timer all work on your own, virtually. A Circle is one way to go deeper later, never the price of getting started today.' },
          { q: 'How long does a Practice take?', a: 'The short version of any Practice is under five minutes. You can always give it more time, but the first step is always small on purpose.' },
          { q: 'Is this meditation?', a: 'Some of it is, yes. Mindless can be a quiet sit or a walk. We made it a game so you would actually keep doing it, and we are happy to say so.' },
          { q: 'Will I get streak-guilt notifications?', a: 'No. We do not do guilt or fake urgency. A notification here carries a fact or a five-minute invitation, never a shaming push to keep a streak alive.' },
          { q: 'What does it cost?', a: 'Nothing to start. The community is free, and you can practice, log, and walk a Journey without paying. Membership keeps the wider rooms open, but the first practice is always on the house.' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'CallToAction',
      props: {
        id: 'practice-cta', eyebrow: '', heading: 'Do one practice today.', headingAccent: '',
        body: 'Pick something small, set the timer, and log it. Five minutes before your coffee is a real place to start.',
        ctaPrimaryLabel: 'Do one practice today', ctaPrimaryHref: '/onboarding/beta',
        ctaSecondaryLabel: 'Browse Journeys', ctaSecondaryHref: '/discover/journeys',
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
