import type { Data } from '@/lib/page-editor/types'

// /build. The builder landing, authored from the standardized block library so the
// editor mirrors the live page (ADR-055 / "editor = live"). Audience: the Latent
// Leader (CONTENT-VOICE §2b). Promise: host one Circle, we hand you the format,
// you are not alone. First action: start one Circle. Voice rules: plain sentences,
// proper nouns carry the magic, no em or en dashes, DAWN tokens only.
const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    {
      type: 'Hero',
      props: {
        id: 'lead-hero', variant: 'split',
        eyebrow: 'For builders',
        title: 'Be the reason your people have somewhere to go.', titleAccent: 'somewhere to go.',
        subtitle: 'You do not have to build a community from scratch. Host one Circle. We hand you the format, the first-night script, and the rails. You are not doing this alone.',
        image: '/images/site/PHOTO-2020-10-07-14-38-02.jpeg', focal: 'center',
        minHeight: 'auto',
        ctaPrimaryLabel: 'Start one Circle', ctaPrimaryHref: '/onboarding/beta',
        ctaSecondaryLabel: 'See how it works', ctaSecondaryHref: '/the-community', note: '',
        tone: 'ink', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Manifesto',
      props: {
        id: 'lead-manifesto',
        text: 'A community needs one person to set out the chairs. This time, it can be you.',
        accent: 'set out the chairs.',
        tone: 'ink', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'lead-why-h', eyebrow: 'Why it falls to you',
        title: 'The third place is gone. Somebody has to start the next one.', titleAccent: '',
        kicker: 'It does not take a big personality. It takes a standing time and a door someone holds open.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'lead-why-b',
        body: "Most people who want to bring others together never do. Not because they lack the heart, but because the blank page is brutal. What do you do? Who do you invite? What if nobody comes back?\n\nThat is the part we solve. A Circle is a small group that meets on a standing rhythm, week after week. You pick the time. We give you the rest: the first-night plan, the simple structure that keeps a group alive past week three, and people who have done it before when you get stuck.",
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'lead-f1', illustration: 'lead', side: 'left',
        eyebrow: 'What you start', title: 'One Circle, not a movement.', titleAccent: 'One Circle,',
        body: 'You are not signing up to run an organization. You are setting a time and a place and inviting a handful of people. A walk on Thursday. A sauna night. A morning sit before work. Small enough to actually happen, regular enough that people start to count on it.',
        ctaLabel: 'Start one Circle', ctaHref: '/onboarding/beta',
        tone: 'surface', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'lead-f2', illustration: 'quest', side: 'right',
        eyebrow: 'What we hand you', title: 'The format, ready to run.', titleAccent: 'ready to run.',
        body: "You get the first-night script, a Journey your Circle can walk together over a season, and the structure that keeps a group from fizzling. Groups die from no plan, not from no charisma. We hand you the plan so you can just be a good host.",
        ctaLabel: '', ctaHref: '',
        tone: 'canvas', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'lead-f3', illustration: 'community', side: 'left',
        eyebrow: 'You are not alone', title: 'A bench of people who have done this.', titleAccent: 'done this.',
        body: 'When you host, you join Crew: the people learning to lead alongside you. Bring a question to the group, borrow what works, and lean on the founding hosts when week three gets quiet. The whole point is that nobody builds in a vacuum.',
        ctaLabel: '', ctaHref: '',
        tone: 'surface', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'lead-stmt', text: 'You hold the door. We will get the chairs.', accent: 'hold the door.', tone: 'ink', layout: L },
    },
    {
      type: 'Heading',
      props: {
        id: 'lead-steps-h', eyebrow: 'How it starts', title: 'Three steps to your first night.', titleAccent: '',
        kicker: 'No experience required. Just a standing time and a few people you would want in the room.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'lead-steps', eyebrow: '', title: '', titleAccent: '', style: 'number', columns: '3',
        items: [
          { icon: 'CalendarDays', image: '', title: 'Pick a time', body: 'Choose a standing slot you can actually keep. The same day, the same hour, every week. Rhythm is what turns strangers into regulars.', href: '' },
          { icon: 'Users', image: '', title: 'Invite a few', body: 'Three or four people is plenty for a first night. Share your code, send the message we draft for you, and open the door.', href: '' },
          { icon: 'Compass', image: '', title: 'Run the format', body: 'Open the first-night script and follow it. We built it so the awkward first five minutes take care of themselves.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Accordion',
      props: {
        id: 'lead-faq', eyebrow: 'Questions', title: 'What hosting a Circle actually means.', titleAccent: '',
        items: [
          { q: 'Do I need experience to host?', a: 'No. If you can pick a time and send a few invites, you can host a Circle. The format does the heavy lifting, and the founding hosts are there when you get stuck.' },
          { q: 'How many people do I need?', a: 'Three or four for a first night is plenty. A Circle is meant to stay small. Small is what makes people feel seen, and seen is what makes them come back.' },
          { q: 'What if nobody comes back?', a: "Most groups fizzle from no structure, not no charisma. The format is built to keep a group alive past week three, and you can bring the quiet weeks to Crew for help. You will not be guessing alone." },
          { q: 'How much time does it take?', a: 'A standing slot you keep each week, plus a little setup. You are hosting one gathering, not running a nonprofit. Keep it small enough to actually happen.' },
          { q: 'Does it cost anything to host?', a: 'No. The community is free to join. Hosting a Circle is something you do, not something you buy. Leadership here is earned, never sold.' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'CallToAction',
      props: {
        id: 'lead-cta', eyebrow: '', heading: 'Set out the chairs.', headingAccent: '',
        body: 'Pick a time, invite a few people, and run the format we hand you. Your first Circle is one standing night away.',
        ctaPrimaryLabel: 'Start one Circle', ctaPrimaryHref: '/onboarding/beta',
        ctaSecondaryLabel: 'Explore the Community', ctaSecondaryHref: '/the-community',
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
