// ADD A SECTION BY INTENT (BLD-202, docs/EDITOR-NEXT.md#bld-202; spec docs/design/frequency-builder-v3/block-editor-spec.md
// §3 "Add a section"). The + on the canvas asks "What should this part do?" and answers with the roles, each named by
// its intent (lib/blocks/roles/*.role.json, BLD-201) and grouped Welcome, Show up, Trust, Answer, More. PURE: no React.
//
// What is offered is what is legal, decided by the rules the current editor already keeps, never a second list:
//   • the page kind: the website palette for this theme (derivePickerGroups, lib/page-editor/palette-scope.ts);
//   • the surface: a role whose email form is "hide" is not offered while the builder shows email (role.surfaces);
//   • the page: a role at its per-page cap stays listed but disabled, with the reason (lib/page-editor/block-limits).

import type { Config, Data } from '@/lib/page-editor/types'
import { addBlock, derivePickerGroups, moveBlockTo } from '@/components/page-editor/mobile/data-ops'
import { ROLES, ROLE_GROUPS, type RoleId } from '@/lib/blocks/roles/roles'

type Surface = 'site' | 'profile' | 'spotlight' | 'email'

export interface AddCard {
  role: RoleId
  type: string
  intent: string
  why: string
  icon: (typeof ROLES)[RoleId]['icon']
  live: boolean
  group: (typeof ROLE_GROUPS)[number]
  disabled?: true
  reason?: string
}

/** The theme's page order from the spec (§7), in our role ids: what "Suggested for this page" walks. */
const PAGE_ORDER: readonly RoleId[] = ['hero', 'stats', 'story', 'statement', 'chapters', 'gatherings', 'firstvisit', 'proof', 'people',
  'offerings', 'membership', 'booking', 'gallery', 'library', 'shop', 'steps', 'locations', 'contact', 'letter', 'faq', 'business', 'cta']

/** Every role the builder may add here, in page order, with a reason on the ones the page cannot take. */
export function addCards(config: Config, doc: Data, opts: { surface: Surface; theme?: string | null }): AddCard[] {
  const offered = new Map(derivePickerGroups(config, doc, 'website', opts.theme).flatMap((g) => g.items).map((item) => [item.type, item]))
  const cards: AddCard[] = []
  for (const role of PAGE_ORDER) {
    const def = ROLES[role]
    const item = offered.get(def.type)
    if (!item || def.surfaces[opts.surface] === 'hide') continue
    cards.push({ role, type: def.type, intent: def.intent, why: def.why, icon: def.icon, live: def.live, group: def.group, ...(item.disabled ? { disabled: true as const, reason: item.reason } : {}) })
  }
  return cards
}

/** The sheet's sections: up to three suggestions (roles this page lacks, in page order), then the five groups. A query
 *  narrows both to cards whose intent, why line or group says it; an empty group drops out. */
export function addSheet(cards: AddCard[], doc: Data, query = ''): { suggested: AddCard[]; groups: { group: AddCard['group']; cards: AddCard[] }[] } {
  const q = query.trim().toLowerCase()
  const match = (c: AddCard) => !q || `${c.intent} ${c.why} ${c.group}`.toLowerCase().includes(q)
  const present = new Set(doc.content.map((b) => b.type))
  const suggested = q ? [] : cards.filter((c) => !c.disabled && !present.has(c.type)).slice(0, 3)
  const groups = ROLE_GROUPS.map((group) => ({ group, cards: cards.filter((c) => c.group === group && match(c)) })).filter((g) => g.cards.length > 0)
  return { suggested, groups }
}

/** Insert a fresh section of `type` at `at` on the page (0 is the top). One new document, so the caller records one
 *  undo step; `id` is empty when the page cannot take it (its cap), and the document comes back unchanged. */
export function insertSection(doc: Data, config: Config, type: string, at: number): { doc: Data; id: string } {
  const added = addBlock(doc, config, type)
  if (!added.id) return { doc, id: '' }
  const index = Math.max(0, Math.min(at, doc.content.length))
  return { doc: moveBlockTo(added.data, config, added.id, { parentId: null, slotKey: null, index }), id: added.id }
}
