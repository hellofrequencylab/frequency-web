// OPERATOR FUNNEL DOORS — the template (ADR-591). Renders the fixed section skeleton from one FunnelConfig.
// Chrome-free: its own splash header + sticky mobile CTA, no marketing mega-nav. The section ORDER is the
// same on every niche; only the config copy + which graphics surface change. The community niche
// (loopProminent) gets the Loop enlarged AND a compact echo right after How it works.

import type { FunnelConfig } from '@/lib/marketing/funnel-config'
import {
  SplashHeader,
  StickyMobileCta,
  FunnelHero,
  AssuranceBar,
  ProblemSection,
  HowItWorks,
  FeatureBlocks,
  LoopSection,
  PricingBeat,
  ProofSection,
  MissionSection,
  FaqSection,
  FinalCta,
  SplashFooter,
  type FunnelTestimonial,
} from './funnel-sections'

export function NicheFunnel({
  config,
  testimonials,
}: {
  config: FunnelConfig
  /** Real testimonials only; Proof renders nothing when empty. */
  testimonials?: FunnelTestimonial[]
}) {
  return (
    <>
      <SplashHeader />
      <main className="pb-20 lg:pb-0">
        <FunnelHero config={config} />
        <AssuranceBar config={config} />
        <ProblemSection config={config} />
        <HowItWorks config={config} />
        {/* Community niche: a compact Loop echo right after How it works, because the loop IS the product. */}
        {config.loopProminent && <LoopSection />}
        <FeatureBlocks config={config} />
        <LoopSection prominent={config.loopProminent} />
        <PricingBeat config={config} />
        <ProofSection testimonials={testimonials} />
        <MissionSection />
        <FaqSection config={config} />
        <FinalCta config={config} />
      </main>
      <SplashFooter />
      <StickyMobileCta />
    </>
  )
}
