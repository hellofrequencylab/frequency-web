// Reward-currency model (docs/GLOSSARY.md).
//
//   GEMS — internal, on-platform web engagement.
//   ZAPS — external + in-person: outreach, invites, ghost-node captures,
//          business/NFC programs, in-person events.
//
// At season end, zaps convert to gems (reset_season, rank-based rate); gems buy
// digital badges and trade for physical merch in the web store.
//
// This maps an engagement SOURCE → the currency it earns, so the (deferred)
// capture/reward orchestration routes physical & outreach events to zaps and
// on-platform actions to gems. Pure + framework-independent.

import type { EngagementSource } from './events'

export type EngagementCurrency = 'gems' | 'zaps'

export function currencyForSource(source: EngagementSource): EngagementCurrency {
  switch (source) {
    case 'web':
      return 'gems' // internal, on-platform engagement
    case 'task': // crew / outreach tasks (posters, flyering, QR drops)
    case 'qr': // scanned a code out in the world
    case 'nfc': // bumped a business plaque / merch tag / phone-to-phone
    case 'geo': // ghost-node / geocache capture
    case 'p2p': // met someone in person
      return 'zaps' // external + in-person
    case 'system':
    default:
      return 'gems' // neutral / system grants default to gems
  }
}
