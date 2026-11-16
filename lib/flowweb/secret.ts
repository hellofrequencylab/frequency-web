// The signing secret of one FlowWeb webhook (SCAN-1239).
//
// Four routes verify FlowWeb's HMAC: outcomes, facts, link and crm. One shared secret meant a leak of any
// one integration opened all four. Each of facts, link and crm now reads its own variable first
// (FLOWWEB_FACTS_SECRET, FLOWWEB_LINK_SECRET, FLOWWEB_CRM_SECRET) and falls back to the shared
// FLOWWEB_OUTCOMES_SECRET, so nothing breaks the day this ships; set the three and put the same values in
// the sender's Keychain to retire the shared fallback. Unset everywhere, the answer is '' and
// verifySignature refuses every request (fail closed).

import { envStringOrNull } from '@/lib/env/string'

type FlowwebHook = 'facts' | 'link' | 'crm'

const OWN: Record<FlowwebHook, string> = {
  facts: 'FLOWWEB_FACTS_SECRET',
  link: 'FLOWWEB_LINK_SECRET',
  crm: 'FLOWWEB_CRM_SECRET',
}

export function flowwebSecret(hook: FlowwebHook): string {
  return envStringOrNull(OWN[hook]) ?? envStringOrNull('FLOWWEB_OUTCOMES_SECRET') ?? ''
}
