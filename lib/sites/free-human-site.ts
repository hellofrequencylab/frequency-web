import type { WebsiteEditorState, WebsiteSnapshot } from '@/lib/sites/editor/state'
import { freeHumanAudreyPage, freeHumanBooksPage, freeHumanCalendarPage, freeHumanHomeBlocks, freeHumanProgramPage, freeHumanWorkshopsPage } from '@/lib/sites/free-human-home'
import { FREE_HUMAN_ACCENT } from '@/lib/theme/free-human'
import { freeHumanPhotoSrc } from './free-human-photos'

// THE FREE HUMAN MOVEMENT SPACE (owner ask 2026-10-29: "Create a Space and Spotlight called Free Human Movement. Populate it with
// blocks from the website. Make sure everything is synced."). The Space's website is the theme's own Home and Calendar, block for
// block, and its Spotlight is the Space Spotlight (lib/spaces/spotlight.ts) whose blocks read the same Space fields (about,
// tagline, links, events), so editing the Space edits the Spotlight. PURE: no React, no Supabase. The seed script
// (scripts/render/free-human-space-sql.render.tsx) prints the one SQL transaction the owner pastes.

export const FREE_HUMAN_SLUG = 'freehumanmovement'

export const FREE_HUMAN_SPACE = {
  name: 'Free Human Movement',
  tagline: 'Embody. Create. Rise.',
  /** The Space's cover (a wide photo), its mark and its time zone, all from the design's own shipped files. */
  cover: freeHumanPhotoSrc('place-sea-sunset'),
  logo: '/sites/free-human/logo-mark.svg',
  timeZone: 'America/Los_Angeles',
  about: 'Embodiment and child-rearing for women in their season of creation: conceiving, carrying, birthing and raising. A year-round program, circles at the full moon and a calendar of gatherings. Created by Audrey Uma Wilder.',
} as const

/** The four seasons of the year-round program, as the Space's own Programs (space_programs). Words are the design's (Home, the
 *  program section); no price, seat count or weekly promise. */
export const FREE_HUMAN_PROGRAMS = [
  { name: 'Rest', description: 'Winter. Yoga nidra, slow mornings and the art of doing less.', schedule: 'A live circle each season' },
  { name: 'Embody', description: 'Spring. Floor work that brings you back into pelvis, breath and spine.', schedule: 'A live circle each season' },
  { name: 'Create', description: 'Summer. Conception, pregnancy and birth, held as sacred work.', schedule: 'A live circle each season' },
  { name: 'Raise', description: 'Autumn. Rhythm, play and the village you were promised.', schedule: 'A live circle each season' },
] as const

/** The site's own pages the design's `~/` links point at that this Space does not have, mapped to the section of the Home that
 *  holds the same thing, so no button on the site goes nowhere. The Calendar is a real page and stays. */
const SECTION_OF_PAGE: Record<string, string> = { '~/shop': '~/books' }

function toSections(value: unknown): unknown {
  if (typeof value === 'string') return Object.hasOwn(SECTION_OF_PAGE, value) ? SECTION_OF_PAGE[value] : value
  if (Array.isArray(value)) return value.map(toSections)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toSections(v)]))
  return value
}

/** The Home, the Calendar and the menu's own pages (Program, Workshops, Books, Audrey), with a stable id on every block. */
function freeHumanSitePages() {
  return [
    { slug: 'home', label: 'Home', seo: { title: 'Free Human Movement', description: FREE_HUMAN_SPACE.about }, blocks: freeHumanHomeBlocks() },
    ...[freeHumanProgramPage(), freeHumanWorkshopsPage(), freeHumanBooksPage(), freeHumanAudreyPage(), freeHumanCalendarPage()].map((p) => ({ slug: p.slug, label: p.label, seo: p.seo, blocks: p.blocks })),
  ].map((p) => ({
    slug: p.slug,
    label: p.label,
    seo: { ...p.seo },
    comments: [],
    doc: { root: {}, content: p.blocks.map((b, n) => ({ type: b.type, props: { ...(toSections(structuredClone(b.props)) as Record<string, unknown>), id: `fh-${p.slug}-${n + 1}` } })) },
  }))
}

/** The saved Space menu: Calendar is the one direct link in the bar; the four mega menus resolve their doors to these pages (the
 *  header reads them by name). `known` lists every page so none joins the bar on its own. */
export const FREE_HUMAN_MENU = {
  v: 1 as const,
  items: [
    { id: 'calendar', label: 'Calendar', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:calendar' } },
    { id: 'program', label: 'Program', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:program' } },
    { id: 'workshops', label: 'Workshops', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:workshops' } },
    { id: 'books', label: 'Books', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:books' } },
    { id: 'audrey', label: 'Audrey', visibility: 'website' as const, target: { kind: 'auto' as const, key: 'page:audrey' } },
  ],
  known: ['page:home', 'page:program', 'page:workshops', 'page:books', 'page:audrey', 'page:calendar'],
}

/** The Space's website address, for the links a Spotlight sends visitors to (a Spotlight on a website host is part of the site). */
const FREE_HUMAN_SITE_URL = `https://${FREE_HUMAN_SLUG}.frequencylocal.com`

/** The Spotlight's blocks, in reading order. The DATA blocks (about, linkCards, events) carry only a header: their rows are the Space's
 *  own about text, offers and events, so editing the Space edits the Spotlight and there is no second copy to keep in step. The
 *  CONTENT blocks (picture, button, line, links, form) are the Spotlight's own and use the design's shipped photos. */
export const FREE_HUMAN_SPOTLIGHT_BLOCKS = ['image', 'about', 'button', 'text', 'linkCards', 'events', 'links', 'contactForm'] as const

const PHOTO = freeHumanPhotoSrc
const SPOTLIGHT_CONTENT: Record<string, Record<string, unknown>> = {
  image: { src: PHOTO('heritage-a-virgin'), alt: 'Painting of a woman in golden robes walking forward with two children' },
  about: { eyebrow: 'Free Human Movement', title: 'Move like the woman who made a world.' },
  button: { label: 'Join the circle', url: `${FREE_HUMAN_SITE_URL}/#program`, align: 'center' },
  linkCards: { eyebrow: 'Come as you are', title: 'Ways to join' },
  events: { eyebrow: 'Gather', title: 'What is gathering next', view: 'list' },
  text: { text: 'Softness is not the opposite of strength. It is how strength moves.' },
  links: {
    items: [
      { label: 'The calendar', url: `${FREE_HUMAN_SITE_URL}/calendar` },
      { label: 'The year-round program', url: `${FREE_HUMAN_SITE_URL}/#program` },
      { label: 'Workshops', url: `${FREE_HUMAN_SITE_URL}/#workshops` },
      { label: 'Books', url: `${FREE_HUMAN_SITE_URL}/#books` },
      { label: 'Speaking and bookings', url: `${FREE_HUMAN_SITE_URL}/#speaking` },
    ],
  },
  contactForm: {
    eyebrow: 'Bring Audrey to your gathering',
    title: 'Say hello',
    body: 'Tell us about your gathering, retreat, school or podcast. We write back to every request.',
    showMessage: true, messageLabel: 'About your gathering', submitLabel: 'Send', successMessage: 'Thank you. Your request is with Audrey.',
    image: PHOTO('founder-audrey'),
  },
}

/** The published Space Spotlight node (`preferences.spotlight`): one column, every block once, content bags for the blocks that have words. */
export function freeHumanSpotlight() {
  return {
    published: true,
    layout: {
      rows: FREE_HUMAN_SPOTLIGHT_BLOCKS.map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] })),
      content: SPOTLIGHT_CONTENT,
    },
  }
}

/** The published website state the editor stores: every page's blocks with stable ids, no comments, one version. */
export function freeHumanEditorState(now: string): WebsiteEditorState {
  const snapshot: WebsiteSnapshot = {
    theme: 'FreeHuman',
    brand: { accent: FREE_HUMAN_ACCENT.accent },
    chrome: { name: FREE_HUMAN_SPACE.name, tagline: null, cta: { label: 'Join us', href: '#program' } },
    pages: freeHumanSitePages(),
  }
  return { v: 1, revision: 1, draft: snapshot, published: structuredClone(snapshot), versions: [{ id: '1', createdAt: now, author: 'Frequency', snapshot: structuredClone(snapshot) }] }
}
