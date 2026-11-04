import type { MegaNicheId } from '@/lib/theme/mega-theme'

type CyberWitchKitSlug = 'general' | 'practitioner' | 'reader' | 'band' | 'brand' | 'studio'
interface CyberWitchKitSummary { id: string; kit: CyberWitchKitSlug; niche: MegaNicheId; theme: 'CyberWitch'; label: string; description: string }

/** CyberWitch's six kits for the editor's kit library, `cyberwitch-<kit>`. Kept apart from cyberwitch-variants.ts so listing them does not
 *  load the kits' copy. cyberwitch-variants.test.ts pins every row to its kit. */
export const CYBERWITCH_KIT_INDEX: readonly CyberWitchKitSummary[] = [
  { id: 'cyberwitch-general', kit: 'general', niche: 'general', theme: 'CyberWitch', label: 'General', description: 'A page for whatever you do: say it in five words, show your offers and make booking easy.' },
  { id: 'cyberwitch-practitioner', kit: 'practitioner', niche: 'coaches', theme: 'CyberWitch', label: 'Practitioner', description: 'For therapists, coaches and somatic workers: name the work, book a first session, no fixing.' },
  { id: 'cyberwitch-reader', kit: 'reader', niche: 'wellness', theme: 'CyberWitch', label: 'Witch & reader', description: 'For witches, readers and ritual workers: your craft, your readings and a way to book one.' },
  { id: 'cyberwitch-band', kit: 'band', niche: 'creators', theme: 'CyberWitch', label: 'Band / artist', description: 'For bands and artists: the next show, the record and the merch, in that order.' },
  { id: 'cyberwitch-brand', kit: 'brand', niche: 'markets', theme: 'CyberWitch', label: 'Brand / label', description: 'For labels and brands: the drop, the story and a shop that is easy to use.' },
  { id: 'cyberwitch-studio', kit: 'studio', niche: 'studios', theme: 'CyberWitch', label: 'Studio / maker', description: 'For tattoo, art and craft studios: your books, your consultation and your work.' },
]
