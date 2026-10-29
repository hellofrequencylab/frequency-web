import { freeHumanPhotoSrc } from '@/lib/sites/free-human-photos'

// THE FREE HUMAN SITE CHROME, pure parts (design: templates/website/Website.dc.html, the announce bar, the header with its four
// mega menus, the bag, the account menu and the footer). The words the chrome carries that are the kit's own, and the small
// decisions it makes from the Space's own menu. PURE: components/sites/free-human-*.tsx draw it, free-human-css.ts dresses it.
// The announce bar, bar links, shop link, footer columns, letter parts and initials are Temple Kit's pure helpers
// (lib/sites/temple-kit-chrome.ts), which the design package names as the shared ones.

export const FREE_HUMAN_CHROME_COPY = {
  /** The wordmark's second word is set in the lyric italic; the tagline is the inscription under it. */
  wordmark: { lead: 'Free Human', em: 'Movement', tagline: 'EMBODY • CREATE • RISE' },
  /** The footer's letter, in the design's words (the Space's saved footer sign-up wins). */
  letter: { title: 'A letter each new moon. *Thirteen a year.*', body: 'A practice, a story and what is gathering next. Written by Audrey, never more often than the moon.', label: 'Email', placeholder: 'you@email.com', button: 'Subscribe', done: 'Thank you. The next one comes with the new moon.' },
  columns: { work: 'Work with us', learn: 'Learn', about: 'About' },
  bag: { title: 'Your bag', empty: 'Nothing here yet', emptyBody: 'Books, recordings and gift cards land here.', visit: 'Visit the shop', subtotal: 'Subtotal', checkout: 'Checkout', fine: 'Shipping and tax at checkout. Member discounts apply automatically.', freeShipping: 'Free shipping unlocked', toFreeShipping: 'to free shipping on books and objects' },
  account: { welcome: 'Welcome', welcomeEm: 'back', signedOutBody: 'We will email you a sign-in link. No password to remember.', emailLink: 'Email me a link', signOut: 'Sign out', rituals: 'Your rituals', orders: 'Orders & downloads', settings: 'Settings & letters' },
  join: 'Join us',
  credit: 'Runs on Frequency',
} as const

interface NavLink {
  label: string
  href: string
  external?: boolean
}

interface PanelEntry {
  glyph: string
  label: string
  desc: string
  /** Which of the Space's own menu items this door opens, by what the item is called. */
  match: RegExp
  /** The home page section it falls back to when the Space has no page for it (the design's own anchors). */
  anchor?: string
}

interface PanelTile {
  photo: string
  kicker: string
  title: string
  match: RegExp
  anchor?: string
}

interface Panel {
  label: string
  lyric: string
  entries: PanelEntry[]
  tiles: PanelTile[]
}

/** The four mega menus, in the design's order, words and icons. Dates and counts the design shows as samples are left out of the
 *  words: a menu never promises what the Space has not scheduled. */
export const FREE_HUMAN_PANELS: readonly Panel[] = [
  {
    label: 'Program',
    lyric: 'A practice for every season of motherhood.',
    entries: [
      { glyph: 'sun', label: 'The year-round program', desc: 'Join in any month', match: /\b(program|year[- ]round)/i, anchor: 'program' },
      { glyph: 'seedling', label: 'This season: Raise', desc: 'The module open now', match: /\b(season|module|raise)\b/i },
      { glyph: 'library', label: 'Practice library', desc: 'For members', match: /\b(library|practices|recordings?)\b/i },
      { glyph: 'moon', label: 'Live circle', desc: 'Every week, live', match: /\b(circle|live)\b/i },
    ],
    tiles: [
      { photo: 'heritage-madonna-nursing', kicker: 'Now', title: 'Raise', match: /\b(season|module|raise)\b/i, anchor: 'program' },
      { photo: 'light-floating-candles', kicker: 'Next', title: 'Winter rest begins', match: /\b(winter|rest)\b/i, anchor: 'program' },
    ],
  },
  {
    label: 'Gather',
    lyric: 'Come as you are. Bring the baby.',
    entries: [
      { glyph: 'calendar', label: 'Events & gatherings', desc: 'Circles, full moons, retreats', match: /\b(calendar|events?|gatherings?)\b/i, anchor: 'events' },
      { glyph: 'bloom', label: 'Workshops', desc: 'Open to everyone', match: /\bworkshops?\b/i, anchor: 'workshops' },
      { glyph: 'temple', label: 'Solstice retreat', desc: 'Childcare held', match: /\b(retreat|solstice)\b/i },
      { glyph: 'gift', label: 'Gift cards', desc: 'For a sister, a doula, a friend', match: /\bgift/i },
    ],
    tiles: [
      { photo: 'light-lanterns', kicker: 'Full moon', title: 'Full moon gathering', match: /\b(calendar|events?|gatherings?)\b/i, anchor: 'events' },
      { photo: 'light-honey-spoon', kicker: 'Online', title: 'Breath for birth', match: /\bworkshops?\b/i, anchor: 'workshops' },
    ],
  },
  {
    label: 'Read',
    lyric: 'Words for the wild work.',
    entries: [
      { glyph: 'egg', label: 'Beyond The Wild', desc: 'A guide to rearing children.', match: /\b(books?|beyond)\b/i, anchor: 'books' },
      { glyph: 'quill', label: 'Defying Men', desc: 'How to move through the modern world.', match: /\b(books?|defying)\b/i, anchor: 'books' },
      { glyph: 'mail', label: 'The letter', desc: 'Each new moon, by Audrey', match: /\b(letter|newsletter)\b/i },
      { glyph: 'breath', label: 'Recordings', desc: 'Practices to take with you', match: /\b(recordings?|audio)\b/i },
    ],
    tiles: [
      { photo: 'craft-beaded-deer', kicker: 'New', title: 'Beyond The Wild', match: /\b(books?|beyond)\b/i, anchor: 'books' },
      { photo: 'heritage-maiden-sword', kicker: 'Pre-order', title: 'Defying Men', match: /\b(books?|defying)\b/i, anchor: 'books' },
    ],
  },
  {
    label: 'Audrey',
    lyric: 'Your guide, and a voice for your gathering.',
    entries: [
      { glyph: 'heart', label: 'About Audrey', desc: 'Mother, teacher, founder', match: /\b(about|audrey)\b/i, anchor: 'speaking' },
      { glyph: 'live', label: 'Speaking & bookings', desc: 'Conferences, retreats, podcasts', match: /\b(speaking|bookings?)\b/i, anchor: 'speaking' },
      { glyph: 'image', label: 'Press kit', desc: 'Bio, photos, topics', match: /\bpress\b/i },
      { glyph: 'chat', label: 'Contact', desc: 'We reply within a week', match: /\bcontact\b/i },
    ],
    tiles: [
      { photo: 'founder-audrey', kicker: 'Speaking', title: 'Bring Audrey to you', match: /\b(speaking|bookings?)\b/i, anchor: 'speaking' },
      { photo: 'myth-guanyin', kicker: 'Lineage', title: 'The women before us', match: /\blineage\b/i, anchor: 'lineage' },
    ],
  },
]

/** Where a door goes: the Space's own menu item it names, else the matching section of the home page, else nowhere (the door is left out). */
function resolve(links: NavLink[], homeHref: string, match: RegExp, anchor?: string): string | null {
  const own = links.find((l) => match.test(l.label))
  if (own) return own.href
  return anchor ? `${homeHref.replace(/#.*$/, '')}#${anchor}` : null
}

/** A mega menu in the design's shape: the lyric line, four doors with their glyph, and two pictured tiles. */
interface FreeHumanMega {
  lyric: string
  doors: { glyph: string; label: string; desc: string; href: string }[]
  tiles: { title: string; kicker: string; href: string; img: string; avg: string | null }[]
}

interface FreeHumanNavItem {
  label: string
  href: string
  mega?: FreeHumanMega
  /** The glyph beside a direct link (the Calendar's). */
  glyph?: string
}

/** The header's menu: the four mega menus then Calendar as a direct link (the design's order). A door with no page and no home
 *  section is left out, a panel with no doors is not drawn, and Calendar is left out when the Space has no calendar page. */
export function freeHumanNav(links: NavLink[], homeHref: string, avgOf: (photo: string) => string | null = () => null): FreeHumanNavItem[] {
  const out: FreeHumanNavItem[] = []
  for (const p of FREE_HUMAN_PANELS) {
    const doors = p.entries.flatMap((e) => {
      const href = resolve(links, homeHref, e.match, e.anchor)
      return href ? [{ glyph: e.glyph, label: e.label, desc: e.desc, href }] : []
    })
    if (!doors.length) continue
    const tiles = p.tiles.flatMap((t) => {
      const href = resolve(links, homeHref, t.match, t.anchor)
      return href ? [{ title: t.title, kicker: t.kicker, href, img: freeHumanPhotoSrc(t.photo), avg: avgOf(t.photo) }] : []
    })
    out.push({ label: p.label, href: doors[0].href, mega: { lyric: p.lyric, doors, tiles } })
  }
  const cal = links.find((l) => /\bcalendar\b/i.test(l.label))
  if (cal) out.push({ label: 'Calendar', href: cal.href, glyph: 'calendar' })
  return out
}
