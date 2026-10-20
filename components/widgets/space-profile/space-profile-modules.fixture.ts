import type { SpaceContentData } from '@/lib/spaces/content-data'
import type { SpaceProfileContext } from '@/lib/spaces/profile-modules'
import { readProfileData } from '@/lib/spaces/profile-data'

/** A business Space with a story, a FAQ and two reviews, enough for each data block the goldens place
 *  to draw something. The preferences carry no Puck doc, so authored content is the layout's own. */
export function space(): SpaceProfileContext {
  const preferences = {
    profileData: {
      about: 'A long story about the studio and the people who run it.',
      offerings: [
        { title: 'Morning flow', description: 'Sixty minutes, all levels.', price: '$18', listed: true },
        { title: 'Private session', description: 'One on one.', price: '$90', listed: true },
      ],
    },
  }
  return {
    id: 's1',
    slug: 'acme',
    type: 'business',
    brandName: 'Acme Studio',
    logoUrl: null,
    coverUrl: null,
    tagline: 'Move well.',
    entitlements: {},
    featureRoles: {},
    preferences,
    profile: readProfileData(preferences),
  }
}

export function data(): SpaceContentData {
  return {
    spaceId: 's1',
    aboutShort: 'A studio for everyone.',
    reviews: {
      average: 4.5,
      count: 2,
      latest: [],
      all: [],
      distribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 },
    },
    faqs: [{ id: 'f1', question: 'Do I need a mat?', answer: 'We have spares.' }],
    highlights: [],
    stats: [],
    events: [],
    community: [],
    communityHref: null,
    team: [],
  } as unknown as SpaceContentData
}

/** The Space documents the render gate freezes: the stored shapes a Space grid takes, two columns wide. */
export const GOLDEN_DOCS: Record<string, unknown> = {
  'legacy main-side template': {
    template: 'main-side',
    slots: { main: ['about', 'offerings', 'faq'], side: ['contact', 'reviews'] },
  },
  'rows, two columns, data and content': {
    rows: [
      { id: 'r0', columns: 1, cells: [['heading', 'about']] },
      { id: 'r1', columns: 2, cells: [['story', 'text'], ['faq', 'reviews']], ratio: 'lead', title: 'More', headerOn: true, mb: 'lg' },
      { id: 'r2', columns: 1, cells: [['offerings', 'callout']] },
    ],
    content: {
      heading: { text: 'Welcome to Acme' },
      about: { eyebrow: 'Who we are', title: 'About *us*' },
      story: { body: '<p>Our story, told inline.</p>' },
      text: { text: '<p>Authored <em>text</em></p>' },
      callout: { title: 'Come by', body: 'Doors open at nine.' },
      offerings: { title: 'What we offer', featured: ['Morning flow'] },
    },
    style: { about: { background: 'muted' }, text: { align: 'center', padding: 'lg' } },
  },
  'rows with hidden and unknown types': {
    rows: [{ id: 'r0', columns: 1, cells: [['about', 'retiredBlock', 'offerings', 'faq']] }],
    hidden: ['offerings'],
    content: { retiredBlock: { foo: 'bar' } },
  },
  'a second data block is refused': {
    rows: [{ id: 'r0', columns: 2, cells: [['about', 'faq'], ['about']] }],
  },
}
