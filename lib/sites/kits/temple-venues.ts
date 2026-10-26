import type { SiteKit } from './types'

// Temple x venues and community houses. The page order follows the Temple theme's house layout; every word, price
// and number is placeholder in the house voice (docs/marketing/voice-and-language-guide.md). No photos: the owner
// adds their own, and the theme draws a plain panel until then.
const kit: SiteKit = {
  id: 'temple-venues',
  version: 1,
  theme: 'Temple',
  niche: 'venues',
  label: 'Venues and community houses',
  description: 'A home for gatherings, a standing week, membership and space to rent.',
  pages: [
    {
      slug: 'home',
      label: 'Home',
      seo: { title: 'Our house', description: 'Gatherings, membership and space to rent.' },
      blocks: [
        { type: 'TempleHero', props: { eyebrow: 'Your town · A community house', title: 'A place to gather.', lead: 'Dinners, circles, music and shared work, in the same slots most weeks. Come once as a guest, or make this place yours.', primaryLabel: 'See what is on', primaryHref: '~/calendar', secondaryLabel: 'Membership', secondaryHref: '~/memberships', facts: [{ value: '0', label: 'Gatherings a month' }, { value: '0', label: 'Seasonal events' }, { value: '$0', label: 'Membership, monthly' }], image: '', alt: '', ticketLabel: 'Next at the house' } },
        { type: 'TempleEvents', props: { eyebrow: 'Coming up', title: 'What is on next.', lead: 'Members come to every gathering. Guests pay at the door.', actionLabel: 'Full calendar', actionHref: '~/calendar', count: 3, badge: 'Members included', fallback: '', covers: [] } },
        { type: 'TempleWeek', props: { eyebrow: 'The standing week', title: 'Same slots, all year.', lead: 'Read the week once and the calendar makes sense.', notes: [{ weekday: 'Monday', label: 'Quiet hours' }, { weekday: 'Friday', label: 'Rentals' }] } },
        { type: 'TempleTiers', props: { eyebrow: 'Membership', title: 'Follow, belong, hold.', lead: 'Three ways in. Each one opens a little more.', actionLabel: 'Compare', actionHref: '~/memberships', tiers: [
          { rung: 'Follow', name: 'Guest', price: 'Free', priceNote: 'One person', lead: false, blurb: 'Hear about everything and pay at the door.', perks: 'Event announcements\nDoor price on public gatherings', ctaLabel: 'Follow for free', ctaHref: '~/memberships' },
          { rung: 'Belong', name: 'Member', price: '$0', priceNote: 'a month', lead: true, blurb: 'Every regular gathering is yours.', perks: 'Every regular gathering included\nFirst RSVP priority\nMember rate on seasonal events', ctaLabel: 'Join as a member', ctaHref: '~/memberships' },
          { rung: 'Hold', name: 'Household', price: '$0', priceNote: 'a month, whole household', lead: false, blurb: 'Everything above, for the people you live with.', perks: 'Everything in Member, for your household\nSeasonal events included\nOne guest pass a month', ctaLabel: 'Join as a household', ctaHref: '~/memberships' },
        ] } },
        { type: 'TempleSeasons', props: { eyebrow: 'The turning year', title: 'Four seasonal events.', lead: 'One at each solstice and equinox, on the calendar dates.', actionLabel: 'The whole year', actionHref: '~/calendar', seasons: [
          { turn: 'December Solstice', title: 'Winter gathering', when: 'Add the date', image: '', href: '' },
          { turn: 'March Equinox', title: 'Spring gathering', when: 'Add the date', image: '', href: '' },
          { turn: 'June Solstice', title: 'Summer gathering', when: 'Add the date', image: '', href: '' },
          { turn: 'September Equinox', title: 'Fall gathering', when: 'Add the date', image: '', href: '' },
        ] } },
        { type: 'TempleRetreat', props: { eyebrow: 'Rent the space', title: 'Hold a date with us.', lead: 'Keep some days free for retreats and private events. Tell us what you have in mind.', image: '', alt: '', spaces: [{ icon: 'palm', label: 'The main room', value: '0', unit: 'standing' }, { icon: 'long-table', label: 'The long table', value: '0', unit: 'seated' }], primaryLabel: 'Ask about a date', primaryHref: '~/contact' } },
        { type: 'TempleFAQ', props: { eyebrow: 'Questions', title: 'Before you come.', items: [
          { q: 'Where are you?', a: 'Add your address and how to find the door.' },
          { q: 'What does membership include?', a: 'Say what members get, in a sentence or two.' },
          { q: 'What if the price is a stretch?', a: 'Say how someone can ask for a lower rate.' },
        ] } },
        { type: 'TempleFollow', props: { eyebrow: 'Follow along', title: 'Hear what is happening, first.', lead: 'Event news from us. Free to follow.', placeholder: 'you@email.com', buttonLabel: 'Follow', successMessage: 'You are on the list. News will come to your inbox.' } },
      ],
    },
    {
      slug: 'visit',
      label: 'Visit',
      seo: { title: 'Visit', description: 'How to find us and get in touch.' },
      blocks: [
        { type: 'TempleFAQ', props: { eyebrow: 'Visit', title: 'Finding us.', items: [{ q: 'How do I get here?', a: 'Add directions, parking and anything a first-timer should know.' }] } },
        { type: 'SpaceContact' },
      ],
    },
  ],
}
export default kit
