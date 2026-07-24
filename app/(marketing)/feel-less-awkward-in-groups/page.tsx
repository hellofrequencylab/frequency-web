import { permanentRedirect } from 'next/navigation'

// Consolidated into /how-to-be-more-social (Community Collective IA consolidation). The unique content and target
// keywords from this guide were absorbed into that authoritative pillar, so this route is retired with a
// permanent (308) redirect: old links and SEO equity transfer straight to the destination, no chain.
export default function FeelLessAwkwardInGroupsRedirect() {
  permanentRedirect('/how-to-be-more-social')
}
