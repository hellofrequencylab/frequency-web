import { permanentRedirect } from 'next/navigation'

// Consolidated into /friendship-as-an-adult (Community Collective IA consolidation). The unique content and target
// keywords from this guide were absorbed into that authoritative pillar, so this route is retired with a
// permanent (308) redirect: old links and SEO equity transfer straight to the destination, no chain.
export default function FindLikeMindedPeopleRedirect() {
  permanentRedirect('/friendship-as-an-adult')
}
