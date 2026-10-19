import { permanentRedirect } from 'next/navigation'
import { ROUTES } from '@/lib/frequency/site-nav'

// /what-is-frequency MERGED into /about (2026-10-19, SCAN-1017, ADR-1761). Two pages told the same
// story: the founding narrative on /about and a 2,100-word explainer here that still described Pillars
// and Channels the live site no longer shows. The five answers worth keeping (what it is, how it works,
// whether it is social media, how it makes money, where it is available) moved into About's FAQ, so one
// URL carries the explainer and the FAQPage node.
//
// WHY THIS FILE STILL EXISTS. HYG-043's rule is right: a redirect belongs in next.config, as the-lab's
// did (ADR-1747), and that was the first plan. Two things keep the file: the LIVE-912 probe
// (scripts/probes/launch-0-3-lab-naming.mjs) reads it by path, and lib/marketing/redirect-shadow.test.ts
// refuses a next.config rule over a route that still exists. So the route stays, and its destination is
// the one About entry in the site's route table rather than a second copy of the path. Delete this file
// and move the rule to next.config once that probe's scope drops it. The template
// (lib/page-editor/templates/what-is-frequency.ts) is kept as source for llms and the pricing tests.
export default function WhatIsFrequencyPage(): never {
  permanentRedirect(ROUTES.about)
}
