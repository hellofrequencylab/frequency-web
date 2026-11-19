import type { MegaNicheId } from '@/lib/theme/mega-theme'

type MindlessKitSlug = 'general' | 'circle' | 'guide' | 'program' | 'studio' | 'shop'
interface MindlessKitSummary { id: string; kit: MindlessKitSlug; niche: MegaNicheId; theme: 'Mindless'; label: string; description: string }

/** Mindless's six kits for the editor's kit library, `mindless-<kit>`. Kept apart from mindless-variants.ts so listing them does not
 *  load the kits' copy. mindless-variants.test.ts pins every row to its kit. */
export const MINDLESS_KIT_INDEX: readonly MindlessKitSummary[] = [
  { id: 'mindless-general', kit: 'general', niche: 'general', theme: 'Mindless', label: 'Mindless', description: 'The whole thing: groups that meet, a program, live sessions and the people who lead them, with words that coach you what to write.' },
  { id: 'mindless-circle', kit: 'circle', niche: 'wellness', theme: 'Mindless', label: 'Circle host', description: 'For a local circle: when you meet, where, who holds the time and how to save a spot.' },
  { id: 'mindless-guide', kit: 'guide', niche: 'coaches', theme: 'Mindless', label: 'Guide', description: 'For a guide: the techniques you teach, one-to-one sits and the circles you hold.' },
  { id: 'mindless-program', kit: 'program', niche: 'creators', theme: 'Mindless', label: 'Program', description: 'For a course: eight weeks, what each week teaches, how to start and what it costs.' },
  { id: 'mindless-studio', kit: 'studio', niche: 'studios', theme: 'Mindless', label: 'Studio', description: 'For a meditation room or studio: the schedule, the first visit, memberships and the room itself.' },
  { id: 'mindless-shop', kit: 'shop', niche: 'markets', theme: 'Mindless', label: 'Shop', description: 'For gear: the drop, the story and a shop that is easy to use.' },
]
