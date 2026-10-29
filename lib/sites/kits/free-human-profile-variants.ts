import { FREE_HUMAN_PROFILES } from '@/lib/theme/free-human'
import { freeHumanCalendarPage, freeHumanHomeBlocks } from '@/lib/sites/free-human-home'
import { FREE_HUMAN_PROFILE_KIT_INDEX } from './free-human-profile-index'
import type { KitNiche, KitPage, SiteKit } from './types'

// Free Human Theme Kit x its thirteen profile starter kits (handoff/frequency/theme-contract.free-human.json). One kit per profile,
// `free-human-<niche>`: the profile id IS the kit's niche, so a new Space that picked this look and a niche starts on its own kit.
// The thirteen share one type system and one Home and differ by ACCENT only (the design's kits.css). The Home is the design's
// sample house, minus the two sections that belong to one named person (her books and her speaking page): a starter's words are
// samples the owner rewrites, and another person's name and titles are not. The Calendar page is the kit's own.

/** Sections that carry the sample house's founder by name. A starter leaves them out. */
const FOUNDER_SECTIONS: ReadonlySet<string> = new Set(['FreeHumanBooks', 'FreeHumanSpeaking'])

const page = (slug: string, label: string, description: string, blocks: KitPage['blocks']): KitPage => ({ slug, label, seo: { title: label, description }, blocks })

/** The profile's accent, from the design's contract. The kit passes it as `accent`; an owner's own accent always wins. */
const freeHumanProfileAccent = (niche: string): string | null => (Object.hasOwn(FREE_HUMAN_PROFILES, niche) ? FREE_HUMAN_PROFILES[niche as keyof typeof FREE_HUMAN_PROFILES].accent : null)

/** The Free Human Theme Kit profile kit for one niche. Id is `free-human-<niche>`. */
export function freeHumanProfileKit(niche: KitNiche): SiteKit {
  const summary = FREE_HUMAN_PROFILE_KIT_INDEX.find((k) => k.niche === niche)
  if (!summary) throw new Error(`No Free Human Theme Kit profile kit for ${niche}`)
  const calendar = freeHumanCalendarPage()
  return {
    id: summary.id, label: summary.label, description: summary.description, theme: 'FreeHuman', version: 1, niche,
    accent: freeHumanProfileAccent(niche) ?? undefined,
    pages: [
      page('home', 'Home', summary.description, freeHumanHomeBlocks().filter((b) => !FOUNDER_SECTIONS.has(b.type))),
      page(calendar.slug, calendar.label, calendar.seo.description, calendar.blocks),
    ],
  }
}
