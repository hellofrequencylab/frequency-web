import type { Data } from '@measured/puck'

// /spread. The everyone landing, authored from the standardized block library so
// the editor mirrors the live page (ADR-055 / "editor = live"). Audience: everyone
// who is not yet a builder or a daily practicer. Promise: take a role in building
// community around you, even a small one. Actions: invite, host once, share the
// idea. First action: bring one person / share. Voice: plain sentences, proper
// nouns carry the magic, no narrated feelings, no em or en dashes, DAWN tokens only.
const L = { spaceTop: 'default', spaceBottom: 'default', visibility: 'all' } as const

export const data: Data = {
  root: {},
  content: [
    {
      type: 'Hero',
      props: {
        id: 'spread-hero', variant: 'split',
        eyebrow: 'For everyone else',
        title: 'Take a role in building community around you.', titleAccent: 'around you.',
        subtitle: 'You do not have to lead a Circle or practice every day to matter here. Bring one person. Host one thing, once. Share the idea. Small moves are how a community actually grows.',
        image: '/images/site/22a51611-07f6-4c39-8a26-1c996295b6d3.jpg', focal: 'center',
        minHeight: 'auto',
        ctaPrimaryLabel: 'Bring one person', ctaPrimaryHref: '/onboarding/beta',
        ctaSecondaryLabel: 'See what is here', ctaSecondaryHref: '/discover', note: '',
        tone: 'ink', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Manifesto',
      props: {
        id: 'spread-manifesto',
        text: 'The whole thing is built by ordinary people, doing one small thing each.',
        accent: 'one small thing each.',
        tone: 'ink', layout: L,
      },
    },
    {
      type: 'Heading',
      props: {
        id: 'spread-why-h', eyebrow: 'Why you count',
        title: 'A community grows one introduction at a time.', titleAccent: '',
        kicker: 'The person who brings a friend is doing the real work, same as the host.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Text',
      props: {
        id: 'spread-why-b',
        body: "Not everyone wants to run a weekly Circle, and not everyone is ready to practice every morning. That is normal, and it is enough. The thing that actually fills a room is people pulling other people in.\n\nYou can share your code with one friend. You can host a single walk or a one-off dinner, no standing commitment. You can pass the idea along to the person you know who needs it. Each of those is a real role, and each one is how the next Circle starts.",
        size: 'lg', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'spread-f1', illustration: 'spread', side: 'left',
        eyebrow: 'Invite', title: 'Bring one person.', titleAccent: 'one person.',
        body: 'Share your code with someone who would get something out of this. One friend, one neighbor, one coworker who moved here and does not know anyone yet. The first person you bring is the hardest, and it is also the one that matters most.',
        ctaLabel: 'Bring one person', ctaHref: '/onboarding/beta',
        tone: 'surface', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'spread-f2', illustration: 'events', side: 'right',
        eyebrow: 'Host once', title: 'One thing, one time.', titleAccent: 'one time.',
        body: "You do not have to commit to a weekly rhythm to gather people. Put a single walk, a coffee, or a dinner on the calendar and invite a few. If it goes well, do it again. If it does not, you hosted one good night and that already counts.",
        ctaLabel: '', ctaHref: '',
        tone: 'canvas', layout: L,
      },
    },
    {
      type: 'IllustratedFeature',
      props: {
        id: 'spread-f3', illustration: 'belonging', side: 'left',
        eyebrow: 'Share', title: 'Pass the idea along.', titleAccent: 'along.',
        body: 'Tell one person what Frequency is for: the third place is gone, and ordinary people are rebuilding it where they live. You never know who has been waiting for a reason to look. Sharing the idea is the lowest-effort role and it still moves the whole thing forward.',
        ctaLabel: '', ctaHref: '',
        tone: 'surface', layout: L,
      },
    },
    {
      type: 'Statement',
      props: { id: 'spread-stmt', text: 'You do not have to do everything. You can do one thing.', accent: 'one thing.', tone: 'ink', layout: L },
    },
    {
      type: 'Heading',
      props: {
        id: 'spread-steps-h', eyebrow: 'Ways in', title: 'Three small moves that count.', titleAccent: '',
        kicker: 'Pick the one that fits this week. They all build the same thing.',
        size: 'default', tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'FeatureGrid',
      props: {
        id: 'spread-steps', eyebrow: '', title: '', titleAccent: '', style: 'number', columns: '3',
        items: [
          { icon: 'Handshake', image: '', title: 'Share your code', body: 'Send one person your personal code. When they join through it, you have grown the room by one, and that is how it starts.', href: '' },
          { icon: 'CalendarDays', image: '', title: 'Put one thing on the calendar', body: 'A single walk, coffee, or dinner. No standing commitment. Host it once and see who shows up.', href: '' },
          { icon: 'Sparkles', image: '', title: 'Tell one person what it is for', body: 'Pass the idea to someone who needs a third place. The lowest-effort role, and still a real one.', href: '' },
        ],
        tone: 'canvas', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'Accordion',
      props: {
        id: 'spread-faq', eyebrow: 'Questions', title: 'What taking a small role looks like.', titleAccent: '',
        items: [
          { q: 'Do I have to lead anything?', a: 'No. Inviting one person or hosting a single event is plenty. Leading a weekly Circle is one option among many, not the entry fee.' },
          { q: 'What is a code?', a: 'Your code is a personal link you share with one person. When they join through it, you have brought someone in, and the community grows by one real person at a time.' },
          { q: 'Can I host just once?', a: 'Yes. Put one walk or one dinner on the calendar and invite a few people. There is no rule that says you have to do it again. One good night still counts.' },
          { q: 'What if I do not know anyone here yet?', a: 'Then sharing the idea is your move. Tell one person what Frequency is for. New here too? Practice solo today and bring someone along once you have found your footing.' },
          { q: 'Does any of this cost money?', a: 'No. Joining, inviting, and sharing are free. You are giving your time and your trust, not your card. Membership keeps the wider rooms open, but the small moves are always free.' },
        ],
        tone: 'surface', width: 'default', align: 'left', layout: L,
      },
    },
    {
      type: 'CallToAction',
      props: {
        id: 'spread-cta', eyebrow: '', heading: 'Bring one person.', headingAccent: '',
        body: 'Share your code, host one thing, or pass the idea along. Pick the small move that fits this week and do it.',
        ctaPrimaryLabel: 'Bring one person', ctaPrimaryHref: '/onboarding/beta',
        ctaSecondaryLabel: 'See what is here', ctaSecondaryHref: '/discover',
        tone: 'ink', width: 'default', align: 'center', layout: L,
      },
    },
  ],
}
