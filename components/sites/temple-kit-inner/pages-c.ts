import type { KitPage } from '@/lib/sites/kits/types'

// THE TEMPLE KIT INNER PAGES, group C: Programs, as a page of TempleKitInner blocks
// (components/page-editor/blocks/temple-kit-inner-c.tsx). PURE. Words are the design's (ui_kits/site JourneysPage);
// names, lengths and prices are typed values the Space edits. No rating, no enrolment and no run dates are seeded.

type Block = KitPage['blocks'][number]

const page = (slug: string, label: string, description: string, blocks: Block[]): KitPage => ({ slug, label, seo: { title: label, description }, blocks })

export function templeKitProgramsPage(): KitPage {
  return page('programs', 'Programs', 'Practices to take home.', [
    { type: 'TempleKitInnerHero', props: { eyebrow: 'Programs', title: 'Practices *to take home.*', lead: 'Small groups over one to eight weeks, in the studio and online. Join a group run or go at your own pace; each ends with a practice you keep.' } },
    { type: 'TempleKitInnerPrograms', props: { countLabel: 'programs', items: [
      { eyebrow: 'Breath · 4 weeks', title: 'Breath for a steadier week', host: 'With the house teachers', summary: 'Four short practices for the mornings that start fast. You leave with a ten minute sequence of your own.', price: '$180', href: '~/contact' },
      { eyebrow: 'Sound · 6 weeks', title: 'Listening, slowly', host: 'With the house teachers', summary: 'Bowls, voice and silence in a small group. You leave with a practice you can keep at home.', price: '$240', href: '~/contact' },
      { eyebrow: 'Ritual · 8 weeks', title: 'The turning year', host: 'With the house teachers', summary: 'One gathering for each turn of the season, with a home practice between. You leave with a calendar of your own.', price: '$320', href: '~/contact' },
    ] } },
    { type: 'TempleKitInnerFaq', props: { title: 'About *programs*', items: [
      { q: 'Do I need experience?', a: 'No. Every program starts from the beginning and says what to bring.' },
      { q: 'What if I miss a session?', a: 'Recordings of group sessions stay with you for the length of the program.' },
    ] } },
  ])
}

/** Group C, in menu order. */
export const templeKitInnerPagesC = (): KitPage[] => [templeKitProgramsPage()]
