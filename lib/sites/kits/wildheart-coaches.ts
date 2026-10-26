import type { SiteKit } from './types'

// Wildheart x coaches and healers. Copy is placeholder in the house voice (docs/marketing/voice-and-language-guide.md):
// plain, warm, pain point first, no hard claims. Live blocks (offerings, events, contact) read the Space's own data.
const kit: SiteKit = {
  id: 'wildheart-coaches',
  version: 1,
  theme: 'Wildheart',
  niche: 'coaches',
  label: 'Coaches and healers',
  description: 'Your story, how you work, what you offer and an easy way to book.',
  pages: [
    {
      slug: 'home',
      label: 'Home',
      seo: { title: 'Work with me', description: 'One-on-one and small group sessions, and how to book.' },
      blocks: [
        { type: 'WildheartNowLine' },
        { type: 'PhotoHero', props: { content: 'below', eyebrow: 'Coaching and healing', title: 'You do not have to carry it alone.', subtitle: 'Sessions and small groups for people who are ready for the next step. Say hello and we will find a time.', actionPrimaryLabel: 'Book a session', actionPrimaryHref: '~/book' } },
        { type: 'CardGrid', props: { role: 'feature', columns: 3, eyebrow: 'How it works', title: 'Three simple steps', cards: [
          { title: 'Say hello', body: 'Tell me what is going on and what you are hoping for. No pressure.' },
          { title: 'Meet', body: 'We talk in person or online and decide together if we are a fit.' },
          { title: 'Keep going', body: 'We set a rhythm that suits your life, then check in as it changes.' },
        ] } },
        { type: 'SpaceOfferings', props: { eyebrow: 'Ways to work together', heading: 'Offerings' } },
        { type: 'SpaceFAQ' },
      ],
    },
    {
      slug: 'about',
      label: 'About',
      seo: { title: 'About', description: 'Who I am and how I work.' },
      blocks: [
        { type: 'EditorialSection', props: { body: 'prose', media: 'right', eyebrow: 'About', title: 'Hi, I am glad you are here.', lead: 'Write a few honest lines about who you are, who you help and what a session feels like. Plain words work best.' } },
        { type: 'SpaceContact' },
      ],
    },
    {
      slug: 'sessions',
      label: 'Sessions',
      seo: { title: 'Sessions and events', description: 'Upcoming sessions, circles and workshops.' },
      blocks: [
        { type: 'EditorialSection', props: { body: 'lead', eyebrow: 'Sessions', title: 'Come to one', lead: 'Group sessions and workshops show up here as you add them.' } },
        { type: 'SpaceEvents' },
        { type: 'SpaceBooking' },
      ],
    },
  ],
}
export default kit
