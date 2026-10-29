import type { KitPage } from '@/lib/sites/kits/types'

// THE TEMPLE KIT INNER PAGES, group A: About, Ceremonies and hire, and Contact, as pages of TempleKitInner blocks
// (components/page-editor/blocks/temple-kit-inner.tsx). PURE. Words are the design's (docs/design-systems/temple,
// ui_kits/site), with the owner's own facts as {{slot|sample}} tokens that a Space's saved content replaces. Photos
// stay empty: the blocks draw the kit's plaster wash until the owner adds their own.

type Block = KitPage['blocks'][number]

const page = (slug: string, label: string, description: string, blocks: Block[]): KitPage => ({ slug, label, seo: { title: label, description }, blocks })

export function templeKitAboutPage(): KitPage {
  return page('about', 'About', 'Who we are and how we keep the house.', [
    { type: 'TempleKitInnerHero', props: { eyebrow: 'The house', title: 'Two acres, *kept quietly.*' } },
    { type: 'TempleKitInnerStory', props: {
      index: 'I', eyebrow: 'Why we keep it', title: 'A temple with *open doors.*', caption: 'The pepper tree, west lawn',
      body: '{{story|The house was a citrus farm until 2016, when we lime-washed the barn, planted the olives and lit the first fire in the circle.\nIt is a temple in the old sense: a place set apart. We hold weekly practice, the turns of the year, weddings and memorials, and we open the rooms to teachers and groups who need somewhere quiet to work.\nWe keep numbers small and hours slow. Nobody is asked to believe anything to come in. You only need to arrive a little early and take your shoes off at the door.}}',
    } },
    { type: 'TempleKitInnerTeam', props: { label: 'The team', people: [
      { name: '{{person1Name|Ines Aldana}}', line: '{{person1Role|Keeper of the house · leads breath and the seasons}}' },
      { name: '{{person2Name|Marco Bell}}', line: '{{person2Role|Ceremony host · weddings, namings, memorials}}' },
      { name: '{{person3Name|Ana Ruiz}}', line: '{{person3Role|House and kitchen · the long table and stays}}' },
    ] } },
    { type: 'TempleKitInnerStats', props: { stats: [
      { value: '2016', label: 'First fire lit' }, { value: '8', label: 'Rooms to gather in' }, { value: '24', label: 'Seats at the long table' }, { value: '140+', label: 'Ceremonies held' },
    ] } },
  ])
}

export function templeKitCeremoniesPage(): KitPage {
  return page('ceremonies-hire', 'Ceremonies and hire', 'Weddings, retreats and space hire, held for you.', [
    { type: 'TempleKitInnerHero', props: { eyebrow: 'Ceremonies and hire', title: 'The house, *held for you.*', lead: 'Weddings, namings and memorials, retreats, or a single room for an evening. Every booking starts with a walk of the grounds.' } },
    { type: 'TempleKitInnerService', props: {
      eyebrow: 'Weddings, namings, memorials', title: 'Ceremonies', sigil: 'circle', side: 'left', ctaLabel: 'Hold a date', ctaHref: '~/contact', note: 'From $2,400 · half day',
      lead: 'Vows under the olive trees, a naming at the fire, a memorial in the great room. We hold the space, the light and the quiet; you bring the people who matter.',
      points: 'A planning walk of the grounds with our ceremony host\nThe great room or the garden lawn, set and cleared\nCandles, cushions and a sound system that stays out of sight',
    } },
    { type: 'TempleKitInnerService', props: {
      eyebrow: 'Two to five nights', title: 'Retreats', sigil: 'triangle', side: 'right', ctaLabel: 'Hold a date', ctaHref: '~/contact', note: 'From $1,450 a guest',
      lead: 'Bring your group for a few nights on the grounds. Six rooms and the bell tents sleep sixteen; the studio, fire circle and long table are yours for the stay.',
      points: 'Rooms for sixteen, with linens and morning tea\nFull use of the studio, council room and fire circle\nMeals at the long table, cooked by our kitchen',
    } },
    { type: 'TempleKitInnerService', props: {
      eyebrow: 'An evening to a full day', title: 'Space hire', sigil: 'square', side: 'left', ctaLabel: 'Hold a date', ctaHref: '~/contact', note: 'From $180 an hour',
      lead: 'The studio for a class, the council room for a circle, the long table for a supper. Hire one room for an evening or the whole house for a day.',
      points: 'A 48-hour hold while you decide\nSetup and reset by our house team\nStep-free access to every room on the ground floor',
    } },
    { type: 'TempleKitInnerFaq', props: { title: 'Common *questions*', items: [
      { q: 'Can we hold a date while we decide?', a: 'Yes. Any date is held for 48 hours at no cost. We write before the hold lapses.' },
      { q: 'Can we bring our own celebrant or teacher?', a: 'Yes. Many couples and groups do. We will walk them through the house before the day.' },
      { q: 'Which rooms suit which numbers?', a: 'Eighty standing in the great room, a hundred and fifty on the garden lawn, twenty-four seated at the long table and thirty mats in the studio.' },
    ] } },
  ])
}

export function templeKitContactPage(): KitPage {
  return page('contact', 'Contact', 'Write to us about a date, a visit or a question.', [
    { type: 'TempleKitInnerContact', props: {
      title: 'Write *to us.*', email: '{{email|hello@temple.house}}', place: '{{address|Ojai, California}}',
      intro: 'Tell us the date, how many people and what you have in mind. We reply within two working days, usually sooner.',
      topics: 'A walk of the grounds\nCeremonies\nRetreats\nSpace hire\nSomething else',
      buttonLabel: 'Send message', successTitle: 'Received.', successBody: 'We reply within two days.',
    } },
  ])
}

/** Group A, in menu order. */
export const templeKitInnerPagesA = (): KitPage[] => [templeKitCeremoniesPage(), templeKitAboutPage(), templeKitContactPage()]
