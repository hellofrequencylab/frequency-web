import { SLOT_GROUPS, slotsUsed, type SlotValues } from '@/lib/spaces/content-slots'
import type { Data } from '@/lib/page-editor/types'

// THE SHARED CONTENT PANEL'S MODEL. For one page of the website: every shared Space fact a section draws on, what
// the Space has saved for it, how many sections use it, and the console page where the owner changes it. PURE.
// There is no write path here on purpose: each fact is saved by the form that already owns it (Identity and
// branding, Business info, Offerings, Team), so one fact still has one home.

export interface SlotRow { key: string; label: string; saved: string | null; uses: number; href: string }
export interface SlotGroupModel { label: string; rows: SlotRow[] }

const LISTS = new Set(['Offers', 'People', 'Schedule'])
const WORDS: Record<string, string> = { Title: 'title', Blurb: 'description', Price: 'price', Name: 'name', Role: 'role', Photo: 'photo', When: 'date and time', Place: 'place' }

function labelOf(key: string): string {
  const m = /^(offer|person|event)(\d)(\w+)$/.exec(key)
  if (m) return `${m[1] === 'offer' ? 'Offer' : m[1] === 'event' ? 'Event' : 'Person'} ${m[2]} ${WORDS[m[3]] ?? m[3].toLowerCase()}`
  const plain: Record<string, string> = { name: 'Name', tagline: 'Tagline', intro: 'Short intro', story: 'Story', email: 'Email', phone: 'Phone', address: 'Address', hours: 'Hours', logo: 'Logo', cover: 'Cover photo', ctaLabel: 'Button label', ctaHref: 'Button link' }
  return plain[key] ?? key
}

function hrefOf(key: string, slug: string): string {
  if (key.startsWith('offer')) return `/spaces/${slug}/settings/services`
  if (key.startsWith('event')) return `/spaces/${slug}/settings/calendar`
  if (key.startsWith('person')) return `/spaces/${slug}/settings/collaborators`
  return `/spaces/${slug}/manage`
}

/** The groups to show. Offers and People list only the rows a section uses or the Space has filled, so a Space with
 *  no team is not shown nine empty lines. */
export function slotPanelModel(slots: SlotValues, docs: readonly Data[], slug: string): SlotGroupModel[] {
  const uses = new Map<string, number>()
  for (const doc of docs) for (const name of slotsUsed(doc.content)) uses.set(name, (uses.get(name) ?? 0) + 1)
  return SLOT_GROUPS.map((group) => ({
    label: group.label,
    rows: group.keys
      .map((key) => ({ key, label: labelOf(key), saved: slots[key] ?? null, uses: uses.get(key) ?? 0, href: hrefOf(key, slug) }))
      .filter((row) => !LISTS.has(group.label) || row.saved !== null || row.uses > 0),
  })).filter((group) => group.rows.length > 0)
}
