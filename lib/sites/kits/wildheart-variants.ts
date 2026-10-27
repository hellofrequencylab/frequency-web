import type { KitNiche, KitPage, SiteKit } from './types'

// Wildheart x the niche doors (coaches stays in wildheart-coaches.ts). One mega theme, starting points as DATA:
// pages of Wildheart blocks (components/page-editor/blocks/wildheart.tsx) plus the shared Space blocks, with
// generic sample copy in the house voice (docs/marketing/voice-and-language-guide.md): plain, warm, pain point
// first, no hard claims, no prices, no photos. Seasons and moons are said as plain calendar facts. Every Wildheart
// prop that would otherwise fall back to the theme's own words is set here. A `{{slot|sample words}}` token shows
// the Space's own fact once it has one (lib/spaces/content-slots.ts). Live blocks read the Space's own rows.

type Block = KitPage['blocks'][number]
type Variant = Omit<SiteKit, 'theme' | 'version' | 'niche'>

const hero = (p: { eyebrow: string; title: string; subtitle: string; label: string; href: string }): Block => ({
  type: 'PhotoHero',
  props: { content: 'below', eyebrow: p.eyebrow, title: p.title, subtitle: p.subtitle, actionPrimaryLabel: p.label, actionPrimaryHref: p.href },
})
const now: Block = { type: 'WildheartNowLine' }
const ornament: Block = { type: 'WildheartOrnament', props: { variant: 'moons', label: '' } }
const seals = (label: string, heading: string, cards: { glyph: string; title: string; body: string; note: string }[]): Block => ({
  type: 'WildheartSealCards',
  props: { label, heading, accentWord: '', lead: '', columns: cards.length >= 4 ? 4 : cards.length === 2 ? 2 : 3, cards },
})
const path = (label: string, heading: string, note: string, steps: { title: string; body: string }[]): Block => ({
  type: 'WildheartMoonPath',
  props: { label, heading, accentWord: '', note, steps: steps.map((s) => ({ href: '', ...s })) },
})
const cards = (eyebrow: string, title: string, list: { title: string; body: string }[]): Block => ({
  type: 'CardGrid',
  props: { role: 'feature', columns: list.length === 2 ? 2 : 3, eyebrow, title, cards: list },
})
const faq: Block = { type: 'SpaceFAQ' }
const events = (label: string, line: string): Block[] => [
  { type: 'EditorialSection', props: { body: 'lead', eyebrow: label, title: 'Come to one', lead: line } },
  { type: 'SpaceEvents' },
]
const aboutPage = (lead: string): KitPage => ({
  slug: 'about',
  label: 'About',
  seo: { title: 'About', description: 'Who we are and how we do things.' },
  blocks: [
    { type: 'EditorialSection', props: { body: 'prose', media: 'right', eyebrow: 'About', title: 'Hi, we are glad you are here.', lead: `{{story|${lead}}}` } },
    { type: 'SpaceContact' },
  ],
})
const eventsPage = (label: string, line: string): KitPage => ({
  slug: 'events',
  label,
  seo: { title: label, description: 'Every upcoming date.' },
  blocks: events(label, line),
})

const VARIANTS: Partial<Record<KitNiche, Variant>> = {
  studios: {
    id: 'wildheart-studios',
    label: 'Studios',
    description: 'Classes, a simple schedule and a first visit that feels easy.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Classes and membership', description: 'Find a class, see the schedule and join.' },
        blocks: [
          now,
          hero({ eyebrow: 'Classes and community', title: 'Find a class you will actually go back to.', subtitle: '{{tagline|Friendly classes at every level, a clear schedule and people who notice when you are missing.}}', label: 'See the schedule', href: '~/events' }),
          ornament,
          path('Your first visit', 'Start small, then *keep going.*', 'At your own pace', [
            { title: 'Pick a class', body: 'Look for the ones marked for beginners.' },
            { title: 'Arrive early', body: 'We will show you around and set you up.' },
            { title: 'Come back', body: 'Most people feel it by the second week.' },
            { title: 'Join in', body: 'Become a member when you are ready.' },
          ]),
          { type: 'SpaceOfferings', props: { eyebrow: 'Ways to join', heading: 'Classes and memberships' } },
          { type: 'SpaceReviews' },
          faq,
        ],
      },
      eventsPage('Classes', 'Every class, in one place.'),
      aboutPage('Tell people who teaches, what a class feels like and who it is for.'),
    ],
  },
  hosts: {
    id: 'wildheart-hosts',
    label: 'Event hosts',
    description: 'A home for your gatherings: what is coming up, how to join and how to stay in touch.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Gatherings', description: 'What is coming up and how to join.' },
        blocks: [
          now,
          hero({ eyebrow: 'Gatherings', title: 'Come together on purpose.', subtitle: '{{tagline|We get people together on a rhythm. Come to one and see if it feels like yours.}}', label: 'See what is on', href: '~/events' }),
          ...events('Coming up', 'Save your spot. Come early if you can.'),
          ornament,
          seals('The rhythm', 'Four ways we *gather.*', [
            { glyph: 'fire', title: 'Fire', body: 'Evenings around a fire, with music and food.', note: 'Evenings' },
            { glyph: 'water', title: 'Water', body: 'Slow mornings, tea and conversation.', note: 'Mornings' },
            { glyph: 'air', title: 'Air', body: 'Workshops where you learn something new.', note: 'Workshops' },
            { glyph: 'earth', title: 'Earth', body: 'Working days where we build and tidy together.', note: 'Together' },
          ]),
          { type: 'SpaceContact' },
        ],
      },
      eventsPage('Events', 'Every upcoming gathering.'),
      aboutPage('Tell people why you started, who you hope will come and what a first visit feels like.'),
    ],
  },
  venues: {
    id: 'wildheart-venues',
    label: 'Venues',
    description: 'Show the room, what is on and how to book it.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'The space', description: 'See the room, what is on and how to book it.' },
        blocks: [
          now,
          hero({ eyebrow: 'The space', title: 'A room that makes people want to stay.', subtitle: '{{tagline|Add a line about the room, the light and what people use it for.}}', label: 'Ask about a date', href: '~/contact' }),
          cards('The room', 'Space for *what you have planned*', [
            { title: 'The main room', body: 'Describe what it holds and what it comes with.' },
            { title: 'Outside', body: 'Describe the garden, the courtyard or the view.' },
            { title: 'The kitchen', body: 'Say what is on hand and what to bring.' },
          ]),
          ornament,
          ...events('What is on', 'Come and see the room in use.'),
          faq,
          { type: 'SpaceContact' },
        ],
      },
      eventsPage('What is on', 'Everything happening in the room.'),
      aboutPage('Tell the story of the building, who looks after it and what you want it to be for the neighbourhood.'),
    ],
  },
  nonprofits: {
    id: 'wildheart-nonprofits',
    label: 'Nonprofits',
    description: 'Explain the work plainly and make it easy to say yes: come along, volunteer or give.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Our work', description: 'What we do and how you can help.' },
        blocks: [
          now,
          hero({ eyebrow: 'Our work', title: 'Something needs doing here. Want to help?', subtitle: '{{tagline|Say in one or two lines what you do, who it is for and why it matters.}}', label: 'Get involved', href: '~/involved' }),
          seals('Three ways in', 'Pick how you *want to help.*', [
            { glyph: 'star', title: 'Come along', body: 'Visit an event and see the work for yourself.', note: 'Visit' },
            { glyph: 'sun', title: 'Volunteer', body: 'Give a few hours. We will find something that suits you.', note: 'Give time' },
            { glyph: 'spark', title: 'Give', body: 'Every gift goes to the work. We will show you where.', note: 'Give' },
          ]),
          ...events('Coming up', 'Join us at one of these.'),
        ],
      },
      {
        slug: 'involved',
        label: 'Get involved',
        seo: { title: 'Get involved', description: 'Come along, volunteer or give.' },
        blocks: [
          path('How to help', 'Start small. *Everything counts.*', 'Your pace', [
            { title: 'Say hello', body: 'Tell us what you can offer.' },
            { title: 'Come along', body: 'Meet the people and see the work.' },
            { title: 'Help out', body: 'Pick a task that suits you.' },
          ]),
          { type: 'SpaceContact' },
        ],
      },
      eventsPage('Events', 'Every upcoming date.'),
      aboutPage('Tell the story plainly: why this work started, who it is for and who is doing it.'),
    ],
  },
  networks: {
    id: 'wildheart-networks',
    label: 'Networks',
    description: 'One home for many places: find a chapter, start one, and see what is on everywhere.',
    pages: [
      {
        slug: 'home',
        label: 'Home',
        seo: { title: 'Find a chapter', description: 'Find a chapter near you, or start one.' },
        blocks: [
          now,
          hero({ eyebrow: 'Many places, one community', title: 'Find your people close to home.', subtitle: '{{tagline|Chapters in different places, one shared way of doing things. Find the one nearest you.}}', label: 'See what is on', href: '~/events' }),
          ...events('On everywhere', 'What is happening across every chapter.'),
          ornament,
          path('Start a chapter', 'Three steps, *start small.*', 'New moon to full', [
            { title: 'Say hello', body: 'Tell us where you live and who you would like to gather.' },
            { title: 'Plan the first one', body: 'We help you pick a place and a date.' },
            { title: 'Open the doors', body: 'Invite a few people. It grows from there.' },
          ]),
          { type: 'SpaceContact' },
        ],
      },
      eventsPage('Events', 'What is on in every chapter.'),
      aboutPage('Tell people why the network exists, who runs it and how the chapters work together.'),
    ],
  },
}

/** The Wildheart kit for one niche door (coaches lives in wildheart-coaches.ts). */
export function wildheartKit(niche: Exclude<KitNiche, 'coaches'>): SiteKit {
  return { ...(VARIANTS[niche] as Variant), version: 1, theme: 'Wildheart', niche }
}
