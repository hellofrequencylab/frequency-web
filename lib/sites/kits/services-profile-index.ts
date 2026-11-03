import { SERVICES_TRADE_IDS, SERVICES_TRADES, servicesKitDescription } from './services-trades-data'

interface ServicesKitSummary { id: string; niche: 'general'; theme: 'Services'; label: string; description: string }

/** Services' sixteen trade kits for the editor's kit library, `services-<trade>`. Kept apart from services-variants.ts so listing them does
 *  not load the kits' pages. services-variants.test.ts pins every row to its kit. */
export const SERVICES_KIT_INDEX: readonly ServicesKitSummary[] = SERVICES_TRADE_IDS.map((trade) => ({
  id: `services-${trade}`, niche: 'general' as const, theme: 'Services' as const, label: SERVICES_TRADES[trade].label, description: servicesKitDescription(trade),
}))
