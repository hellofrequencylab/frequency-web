import { permanentRedirect } from 'next/navigation'

// /what-is-frequency MERGED into /about (2026-10-19, SCAN-1017). Two pages told the same story: the
// founding narrative on /about and a 2,100-word explainer here that still described Pillars and Channels
// the live site no longer shows. The five answers worth keeping (what it is, how it works, whether it is
// social media, how it makes money, where it is available) moved into About's FAQ, so one URL carries
// the explainer and the FAQPage node.
//
// WHY A ROUTE-LEVEL REDIRECT AND NOT A next.config RULE. lib/marketing/redirect-shadow.test.ts refuses
// a rule whose source matches a live route, and two ledger probes (LIVE-912 launch-0-3-lab-naming,
// LIVE-913 launch-0-4-fees) read this file and the template by path, so both stay. The template
// (lib/page-editor/templates/what-is-frequency.ts) is kept as source for llms and the pricing tests, the
// way the-lab and the-quest templates were kept when their routes merged (ADR-1747).
export default function WhatIsFrequencyPage(): never {
  permanentRedirect('/about')
}
