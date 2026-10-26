// THE MIDNIGHT SITE, AS THE DESIGN SETS IT (Midnight design system, "Web Theme"). Drop-in at
// lib/sites/midnight-home.ts. PURE: no React, so the seed script can import it.
//
// Every block here is an EXISTING registry type (lib/page-editor/config.tsx, the names seed.ts maps to), so the
// template renders with the shared blocks today and picks up Midnight purely through MIDNIGHT_TOKENS_CSS. Live
// blocks read the Space's own data at render time; the props below are their headings and empty-state copy.
// Copy is the Nocturne demo; a new Space replaces it in the editor.
//
// Gaps (no registry block yet, so the page falls back to a static CardGrid): Shop catalogue, Journey player,
// account portal. See handoff/frequency/README.md, "Gaps".

interface MidnightBlockSeed { type: string; props: Record<string, unknown> }
interface MidnightPageSeed { slug: string; title: string; nav: boolean; blocks: MidnightBlockSeed[] }

const P = '/sites/midnight/photos'

const hero = (eyebrow: string, title: string, subtitle: string, image: string, primary?: [string, string], secondary?: [string, string]): MidnightBlockSeed => ({
  type: 'PhotoHero',
  props: { content: 'below', variant: 'image', display: 'overlay', eyebrow, title, subtitle, image: `${P}/${image}.jpg`, alt: '',
    actionPrimaryLabel: primary?.[0] ?? '', actionPrimaryHref: primary?.[1] ?? '', actionSecondaryLabel: secondary?.[0] ?? '', actionSecondaryHref: secondary?.[1] ?? '' },
})

export const MIDNIGHT_FAQ = {
  heading: 'Before you book',
  items: [
    { q: 'Do you work with people outside Melbourne?', a: 'Yes. Sessions and most gatherings run online.' },
    { q: 'Can I change or cancel a booking?', a: 'Yes, from the link in your confirmation email or from your account. Free changes up to 24 hours before.' },
    { q: 'What is a Journey run?', a: 'A small group taking the same Journey together over four weeks, with a kickoff and a weekly check-in.' },
    { q: 'Can I pause a membership?', a: 'Yes, for up to two months a year, from your account.' },
  ],
}

/** Home: the strategy's section order (Site Strategy, §V). */
export function midnightHomeBlocks(): MidnightBlockSeed[] {
  return [
    hero('Nocturne · Melbourne and online', 'Better decisions, made in good company.', 'Counsel, gatherings and a working library for people who lead.', 'nature-dunes', ['Book a free intro', '~/book'], ['Ways to work with us', '~/offerings']),
    { type: 'SpaceHighlights', props: { heading: '', items: ['nextOpening', 'nextEvent', 'nextRun', 'members'] } },
    { type: 'FeatureGrid', props: { title: 'Four doors, one house', source: 'static', items: [
      { title: 'Book a session', body: 'Private counsel by the hour. A free 20-minute intro first.', href: '~/book', icon: 'sigil:mercury' },
      { title: 'Join a gathering', body: 'Small circles timed to the moon, online and in the studio.', href: '~/gatherings', icon: 'sigil:fire' },
      { title: 'Take a Journey', body: 'Four-week programs you move through with a small group.', href: '~/journeys', icon: 'sigil:moon-waxing' },
      { title: 'Become a member', body: 'The library, a standing circle and a Journey each season.', href: '~/membership', icon: 'sigil:moon-full' },
    ] } },
    { type: 'SpacePractices', props: { heading: 'Learn it together', kind: 'journeys', limit: 3 } },
    { type: 'SpaceEvents', props: { heading: 'Small circles. Real work.', limit: 4 } },
    { type: 'SpaceReviews', props: { heading: '4.9 from 318 reviews', limit: 3 } },
    { type: 'CardGrid', props: { title: 'Things we use ourselves', cards: [] } },
    { type: 'SpaceFAQ', props: { ...MIDNIGHT_FAQ } },
    { type: 'AccentBeat', props: { mode: 'cta', title: 'Not sure which door? Start with a 20-minute call.', ctaLabel: 'Book a call', ctaHref: '~/book' } },
  ]
}

/** The whole site: the strategy's navigation, in order. */
export function midnightSitePages(): MidnightPageSeed[] {
  return [
    { slug: 'home', title: 'Home', nav: false, blocks: midnightHomeBlocks() },
    { slug: 'offerings', title: 'Offerings', nav: true, blocks: [hero('Offerings', 'Three ways to work together', 'Private counsel, intensives for your inner circle, and a long apprenticeship.', 'industrial-ribs'), { type: 'SpaceOfferings', props: { heading: 'Offerings' } }, { type: 'AccentBeat', props: { mode: 'cta', title: 'Not sure which door?', ctaLabel: 'Book a call', ctaHref: '~/book' } }] },
    { slug: 'book', title: 'Book', nav: true, blocks: [{ type: 'Heading', props: { title: 'What would help most?', eyebrow: 'Book a session' } }, { type: 'SpaceBooking', props: { heading: '' } }] },
    { slug: 'gatherings', title: 'Gatherings', nav: true, blocks: [hero('Gatherings', 'Learn it in the circle', 'Small circles, never more than 20. Every session works on something real you bring.', 'nature-palm'), { type: 'SpaceEvents', props: { heading: '', limit: 12 } }] },
    { slug: 'journeys', title: 'Journeys', nav: true, blocks: [hero('Journeys', 'Four weeks. One change.', 'Short programs with a clear outcome. Take one with a small group, or on your own.', 'nature-fern'), { type: 'SpacePractices', props: { heading: '', kind: 'journeys' } }] },
    { slug: 'shop', title: 'Shop', nav: true, blocks: [hero('The shop', 'Tools for the work between sessions', 'Objects, downloads and gift cards.', 'industrial-panel'), { type: 'CardGrid', props: { title: '', cards: [] } }] },
    { slug: 'membership', title: 'Membership', nav: true, blocks: [hero('Membership', 'Keep good company', 'Three ways to stay close between sessions. Pause or cancel any time.', 'nature-grain'), { type: 'SpaceCTA', props: { heading: 'Membership', ctaLabel: 'Compare plans', ctaHref: '~/membership' } }, { type: 'SpaceFAQ', props: { heading: 'About membership' } }] },
    { slug: 'library', title: 'Library', nav: true, blocks: [hero('Library', 'A working library', 'Guides, templates and recordings. Most of it free.', 'industrial-blades'), { type: 'CardGrid', props: { title: '', cards: [] } }] },
    { slug: 'about', title: 'About', nav: false, blocks: [{ type: 'EditorialSection', props: { title: 'A small house, on purpose', body: 'prose', media: 'right', image: `${P}/nature-fern.jpg` } }, { type: 'SpaceTeam', props: { heading: 'The people' } }, { type: 'SpaceContact', props: { heading: 'Write to us' } }] },
    { slug: 'contact', title: 'Contact', nav: false, blocks: [{ type: 'SpaceContact', props: { heading: 'Write to us' } }] },
  ].map((p) => ({ slug: p.slug, title: p.title, nav: p.nav, blocks: p.blocks }))
}
