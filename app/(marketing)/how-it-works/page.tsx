import { permanentRedirect } from 'next/navigation'

// /how-it-works is consolidated into /what-is-frequency, which now answers both "what is Frequency" and
// "how does it work" in one authoritative explainer (Community Collective IA consolidation). Permanent
// (308) redirect so old links and SEO equity land on the canonical page.
export default function HowItWorksRedirect() {
  permanentRedirect('/what-is-frequency')
}
