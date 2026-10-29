import type { KitPage } from '@/lib/sites/kits/types'

// THE TEMPLE KIT INNER PAGES, group B: Membership and Gatherings, as pages of TempleKitInner blocks
// (components/page-editor/blocks/temple-kit-inner-b.tsx). PURE. Words and sample prices are the design's
// (docs/design-systems/temple, ui_kits/site BookPage and WorkshopsPage); every price is a typed value the Space
// edits. No member count and no seat counts are seeded: those are the Space's own facts.

type Block = KitPage['blocks'][number]

const page = (slug: string, label: string, description: string, blocks: Block[]): KitPage => ({ slug, label, seo: { title: label, description }, blocks })

export function templeKitMembershipPage(): KitPage {
  return page('membership', 'Membership', 'Keep a place at the house.', [
    { type: 'TempleKitInnerHero', props: { eyebrow: 'Membership', title: 'Keep a place *at the house.*', lead: 'A standing seat at the weekly practice, a program each season and more time in the rooms. Pause for up to three months a year.' } },
    { type: 'TempleKitInnerTiers', props: {
      caption: 'Prices in USD, tax included', yearlyNote: 'Two months free',
      footnote: 'Members also join the house circle on Frequency, where dates and recordings are posted first.',
      tiers: [
        { name: 'Friend of the house', sigil: 'half', summary: 'Keep a thread to the house. The library, the seasonal letter and early word on every date.', monthly: '$18', yearly: '$180', perks: 'The full recordings library\nThe seasonal letter, four times a year\n10% off gatherings', ctaLabel: 'Join Friend of the house', ctaHref: '~/contact' },
        { name: 'Circle', sigil: 'ring', featured: true, badge: 'Most chosen', summary: 'For people who come often. A standing place at the weekly practice and one program each season.', monthly: '$54', yearly: '$540', intro: 'First month $27, then $54', perks: 'Everything for friends of the house\nThe Tuesday morning practice, every week\nOne seasonal program included\n20% off gatherings and suppers', ctaLabel: 'Join Circle', ctaHref: '~/contact' },
        { name: 'Keeper', sigil: 'square', summary: 'Hold the house with us. Private time in the rooms, and first seats at every ceremony.', monthly: '$220', yearly: '$2200', perks: 'Everything in Circle\nTwo private healing sessions a month\nFour hours of room hire each season\nFirst seats at the solstice and equinox', ctaLabel: 'Join Keeper', ctaHref: '~/contact' },
      ],
    } },
    { type: 'TempleKitInnerFaq', props: { title: 'About *membership*', items: [
      { q: 'Can I pause a membership?', a: 'Members can pause for up to three months a year and keep their rate when they come back.' },
      { q: 'What happens to my programs if I cancel?', a: 'You keep every recording and program you finished. Live seats end with the month.' },
      { q: 'Can I give a membership?', a: 'Yes. Gift a season of Circle from the shop, sent by email with your note.' },
    ] } },
  ])
}

export function templeKitGatheringsPage(): KitPage {
  return page('gatherings', 'Gatherings', 'Sound, breath, suppers and the turns of the year.', [
    { type: 'TempleKitInnerHero', props: { eyebrow: 'Gatherings', title: 'Gatherings *this season.*', lead: 'Sound, breath, suppers and the turns of the year. Twenty to thirty people, in person, booked by the seat.' } },
    { type: 'TempleKitInnerGatherings', props: { countLabel: 'upcoming', items: [
      { when: 'Thu 20 Nov · 7pm to 8:30pm', title: 'New moon sound bath', place: 'The great room', summary: 'Ninety minutes on the mats with gongs, bowls and a low fire. You leave slower than you came.', price: '$45', href: '~/contact' },
      { when: 'Sat 29 Nov · 6pm to 9:30pm', title: 'Long table supper', place: 'The long table, under the olives', summary: 'Four courses from the garden and one long conversation. Seats are sold singly so you will sit beside someone new.', price: '$120', href: '~/contact' },
      { when: 'Sun 7 Dec · 5pm to 7pm', title: 'Breath at the fire circle', place: 'The fire circle', summary: 'A guided breathwork practice at dusk, then a quiet sit by the fire. Suitable for first-timers.', price: '$55', href: '~/contact' },
      { when: 'Sun 21 Dec · 4pm to 9pm', title: 'Winter solstice ceremony', place: 'The whole house', summary: 'The longest night, kept together. Candle walk, council, fire and a shared table to close the year.', price: '$95', href: '~/contact' },
    ] } },
  ])
}

/** Group B, in menu order. */
export const templeKitInnerPagesB = (): KitPage[] => [templeKitGatheringsPage(), templeKitMembershipPage()]
