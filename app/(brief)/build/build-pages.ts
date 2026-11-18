// The link-only partner pages listed on the /build index. One entry per page; the index renders a card
// for each, in this order. A page here must carry LINK_ONLY_ROBOTS and be in PRIVATE_PAGES
// (lib/how/brief-events.ts); it must never be in app/sitemap.ts or the site nav.
import type { PrivatePage } from '@/lib/how/brief-events'

export interface BuildPage {
  href: PrivatePage
  kicker: string
  title: string
  summary: string
  image: string
  imageAlt: string
}

export const BUILD_PAGES: BuildPage[] = [
  {
    href: '/build/vision',
    kicker: 'Partner pitch · Encinitas',
    title: 'The Frequency Vision',
    summary: 'The whole plan for Frequency in Encinitas in seven chapters: the community, the platform, open access, the building and how it is tuned, the business and the structure. The first Lab opens in 2028.',
    image: '/brand/frequency/facilities/biophilic-lounge-day.jpg',
    imageAlt: 'Inside a Frequency Lab, a concept render',
  },
  {
    href: '/build/how',
    kicker: 'Advisor brief',
    title: 'How Frequency works, and where the money comes from',
    summary: 'For coaches, advisors and partners. How members, hosts and local businesses meet in one network, the first-year revenue, and two calculators you can move.',
    image: '/how-assets/photos/gathering-05.jpg',
    imageAlt: 'A class on a front lawn in Encinitas',
  },
  {
    href: '/build/facilities',
    kicker: 'Partner pitch · Third spaces',
    title: 'Frequency third spaces',
    summary: 'For partners, investors, civic leaders and press. Concept renders of the hall, lounge, café and thermal circuit, the plan to 2028, and a form to get involved.',
    image: '/brand/frequency/facilities/hall-stage-night.jpg',
    imageAlt: 'The hall at night, a concept render',
  },
  {
    href: '/build/lab',
    kicker: 'Partner pitch · The Lab',
    title: 'The Lab',
    summary: 'The third space the community is planning for 2028: heat then cold with other people, three rooms, and why the community comes first and the building second.',
    image: '/images/site/lab-thermal.jpg',
    imageAlt: 'The thermal circuit of the Lab, a concept render',
  },
]
