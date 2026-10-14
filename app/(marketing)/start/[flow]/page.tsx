import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PhotoHero, Section } from '@/components/marketing/marketing-ui'
import { LEAD_FLOWS, getLeadFlow } from '@/lib/onboarding/lead-flows'
import { PersonaChooser } from './persona-chooser'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FnPhotoHero } from '@/components/frequency/site/pages/funnel/parts'
import { FrequencyPersonaChooser } from '@/components/frequency/site/pages/funnel/persona-chooser'

// An assignable lead flow (ADR-125, docs/LEAD-FLOWS.md): /start/<flow>. Drop the URL
// behind any entry point (QR, IG bio, partner button). The splash sets the frame;
// the persona picker (client island) routes the visitor into the induction carrying
// who they said they were. Authored in lib/onboarding/lead-flows.ts.

export const revalidate = 3600

export function generateStaticParams() {
  return Object.keys(LEAD_FLOWS).map((flow) => ({ flow }))
}

export async function generateMetadata({ params }: { params: Promise<{ flow: string }> }): Promise<Metadata> {
  const { flow } = await params
  const lf = LEAD_FLOWS[flow]
  if (!lf) return {}
  return {
    title: lf.splash.headline,
    description: lf.splash.body,
    // A campaign splash (QR, IG bio, partner button) is shared directly with an audience, not a
    // public crawl target: indexed, it is a thin page titled with its slogan competing with /start.
    // Noindex, follow, matching the /join/<slug> funnel splash. The self canonical stays: pointing
    // it at /start alongside noindex would send crawlers mixed signals (SCAN-803).
    robots: { index: false, follow: true },
    alternates: { canonical: `/start/${flow}` },
    openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: lf.splash.headline, description: lf.splash.body, url: `/start/${flow}` },
    // Metadata merges per top-level key: omitting `twitter` inherits the ROOT block, so a lead
    // flow dropped in an IG bio would preview as generic site copy instead of its own splash.
    twitter: { card: 'summary_large_image', title: lf.splash.headline, description: lf.splash.body },
  }
}

export default async function LeadFlowPage({ params }: { params: Promise<{ flow: string }> }) {
  const { flow } = await params
  if (!LEAD_FLOWS[flow]) notFound()
  const lf = getLeadFlow(flow)

  // The Frequency design (ADR-1737): the same splash, the same chooser behaviour and the same capture
  // action, in the design's photo hero and card grammar.
  if (SITE_DESIGN === 'frequency') {
    return (
      <>
        <FnPhotoHero image={lf.splash.image} kicker={lf.splash.eyebrow} title={lf.splash.headline} lede={lf.splash.body} />
        <section className="sec" data-screen-label="02 Choose">
          <div className="wrap">
            <FrequencyPersonaChooser
              flow={lf.slug}
              source={lf.source}
              prompt={lf.splash.prompt}
              personas={lf.personas}
              captureEmail={lf.captureEmail}
              defaultPersona={lf.defaultPersona}
            />
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <PhotoHero
        image={lf.splash.image}
        alt={lf.splash.imageAlt}
        eyebrow={lf.splash.eyebrow}
        title={lf.splash.headline}
        subtitle={lf.splash.body}
      />

      <Section tone="canvas">
        <PersonaChooser
          flow={lf.slug}
          source={lf.source}
          prompt={lf.splash.prompt}
          personas={lf.personas}
          captureEmail={lf.captureEmail}
          defaultPersona={lf.defaultPersona}
        />
      </Section>
    </>
  )
}
