import { dateLabel } from '@/lib/sites/menswork-page'
import type { SiteFooter } from '@/lib/sites/site-footer'

// THE TEMPLE KIT SITE CHROME, pure parts (design: ui_kits/site/Header.jsx). The words the header, the cart drawer, the
// account menu and the footer carry that are the kit's own, and the small decisions the chrome makes from the Space's
// own menu, footer and next gathering. PURE: components/sites/temple-kit-*.tsx draw it, temple-kit-chrome-css.ts dresses it.

export const TEMPLE_KIT_CHROME_COPY = {
  /** The letter in the footer, the design's own default (the Space's saved footer sign-up wins). */
  letter: { title: 'A letter each season.', em: 'Four a year.', label: 'Email', placeholder: 'you@email.com', button: 'Subscribe', done: 'Thanks. You are on the list.' },
  columns: { work: 'Work with us', learn: 'Learn', about: 'About' },
  bag: { title: 'Your bag', empty: 'Nothing here yet', emptyBody: 'Objects, recordings and gift cards land here.', visit: 'Visit the shop', subtotal: 'Subtotal', checkout: 'Checkout', fine: 'Shipping and tax at checkout. Note any member discount here.', freeShipping: 'Free shipping unlocked', toFreeShipping: 'to free shipping' },
  account: {
    welcome: 'Welcome',
    welcomeEm: 'back',
    signedOutBody: 'We will email you a sign-in link. No password to remember.',
    emailLink: 'Email me a link',
    signOut: 'Sign out',
    orders: 'Orders & downloads',
    settings: 'Settings & letters',
  },
  /** The footer's right-hand credit, in the design's words. */
  credit: 'Runs on Frequency',
  /** The announce bar's small links, in the design's order. */
  barLinks: ['Gift cards', 'The letter', 'About', 'Contact'],
} as const

/** The announce bar's one line: the Space's own line (its footer utility strip) wins, else the next gathering with its day. */
export function templeKitAnnounce(utility: SiteFooter['utility'] | null | undefined, next: { title: string; startsAt: string } | null): string | null {
  const own = utility?.left?.trim()
  if (own) return own
  if (!next?.title) return null
  const when = next.startsAt ? dateLabel(next.startsAt) : null
  return when?.day ? `${next.title} · ${when.day}` : next.title
}

interface BarLink {
  label: string
  href: string
  external?: boolean
}

const BAR_LINK = /^(gift|the letter|letter|about|contact)/i

/** The small links on the right of the announce bar: the Space's own footer strip, else its Gift cards, Letter, About and
 *  Contact pages (at most four), as Nocturne's bar does. */
export function templeKitBarLinks(links: BarLink[], utility: SiteFooter['utility'] | null | undefined): BarLink[] {
  if (utility?.items.length) return utility.items.flatMap((i): BarLink[] => (i.href ? [{ label: i.label, href: i.href }] : [])).slice(0, 4)
  return links.filter((l) => BAR_LINK.test(l.label.trim())).slice(0, 4)
}

const SHOP = /\b(shop|store|gift|merch|objects)\b/i

/** Where the bag goes: the Space's own shop page, or null when the menu names none (the bag then stays out of the header). */
export function templeKitShopHref(links: BarLink[]): string | null {
  return links.find((l) => SHOP.test(l.label))?.href ?? null
}

interface FooterColumn {
  title: string
  links: { label: string; href: string }[]
  lines?: string[]
}

const WORK = /\b(book|session|service|offering|ceremon|hire|rent|membership|member|shop|store|gift|work with)/i
const LEARN = /\b(gathering|event|program|journey|library|letter|resource|class|workshop|learn|course|calendar|circle)/i

/** The footer's three link columns (Work with us, Learn, About). A Space's own saved columns win; otherwise its menu is sorted
 *  by what each page is for, so the footer reads as the design's does. Empty columns are left out. */
export function templeKitFooterColumns(links: BarLink[], saved: SiteFooter['columns'] | null | undefined): FooterColumn[] {
  if (saved?.length) return saved.map((c) => ({ title: c.title, links: c.links, lines: c.lines }))
  const work: BarLink[] = []
  const learn: BarLink[] = []
  const about: BarLink[] = []
  for (const l of links) (WORK.test(l.label) ? work : LEARN.test(l.label) ? learn : about).push(l)
  const C = TEMPLE_KIT_CHROME_COPY.columns
  return [
    { title: C.work, links: work },
    { title: C.learn, links: learn },
    { title: C.about, links: about },
  ].filter((c) => c.links.length > 0)
}

/** The letter title with its starred words set as the accent (`A letter each season. *Four a year.*`); without stars the whole
 *  title is plain. Returns the parts in order. */
export function templeKitLetterParts(title: string): { text: string; em: boolean }[] {
  const parts: { text: string; em: boolean }[] = []
  const re = /\*([^*]+)\*/g
  let at = 0
  for (const m of title.matchAll(re)) {
    if (m.index > at) parts.push({ text: title.slice(at, m.index), em: false })
    parts.push({ text: m[1], em: true })
    at = m.index + m[0].length
  }
  if (at < title.length) parts.push({ text: title.slice(at), em: false })
  return parts
}

/** Initials for the account avatar, as the design's Avatar draws them: the first letters of up to two words. */
export function templeKitInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}
