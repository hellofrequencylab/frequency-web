import type { SpotlightData } from '@/lib/spotlight/data'

/** A member with a published Spotlight (authored legacy blocks) and no grid of their own; each golden
 *  document below supplies the grid. Shape copied from lib/spotlight/grid-safety.test.ts. */
export function member(): SpotlightData {
  return {
    profile: {
      id: 'p1',
      handle: 'ada',
      display_name: 'Ada',
      avatar_url: null,
      header_image_url: null,
      bio: 'Building things.',
      community_role: null,
      profile_theme: null,
      current_streak: 3,
      lifetime_gems: 12,
      created_at: '2024-01-01T00:00:00.000Z',
      nexus_regions: { name: 'Portland' },
    },
    hostedEvents: [],
    layout: {
      version: 1,
      blocks: [
        { id: 'h1', type: 'heading', text: 'Welcome', level: 2 },
        { id: 't1', type: 'text', text: 'Thanks for stopping by.' },
        { id: 'l1', type: 'links', items: [{ label: 'Site', url: 'https://example.com' }] },
      ],
    },
    background: { assetPath: null, dim: 0, focusX: 50, focusY: 50, zoom: 100 },
    theme: {} as SpotlightData['theme'],
    totalZaps: 42,
    topFriends: [{ profileId: 'f1', handle: 'bob', displayName: 'Bob', avatarUrl: null }],
    guestbook: [],
    grid: null,
  } as unknown as SpotlightData
}

/** The member documents the render gate freezes: every stored shape a member grid can take. */
export const GOLDEN_DOCS: Record<string, unknown> = {
  'null grid (the starter)': null,
  'empty object': {},
  'legacy single template': { template: 'single', slots: { main: ['about', 'stats', 'links', 'topfriends'] } },
  'legacy order list': { order: ['heading', 'about', 'links'] },
  'rows, one column, data and content': {
    rows: [
      { id: 'r0', columns: 1, cells: [['about', 'heading', 'text', 'links']] },
      { id: 'r1', columns: 1, cells: [['stats', 'quote']], title: 'Numbers', headerOn: true, mt: 'lg' },
    ],
    content: {
      heading: { text: 'Hello there' },
      text: { text: '<p>Authored <strong>body</strong></p>' },
      quote: { text: 'A quote', attribution: 'Someone' },
    },
    style: { about: { background: 'muted', align: 'center' }, text: { padding: 'lg' } },
  },
  'rows with hidden and unknown types': {
    rows: [{ id: 'r0', columns: 1, cells: [['about', 'retiredBlock', 'stats', 'links', 'guestbook']] }],
    hidden: ['stats'],
    content: { retiredBlock: { foo: 'bar' } },
  },
  'rows wider than a member may hold': {
    rows: [{ id: 'r0', columns: 2, cells: [['about'], ['stats']] }],
  },
  'a second data block is refused': {
    rows: [{ id: 'r0', columns: 1, cells: [['about', 'links', 'about']] }],
  },
};
