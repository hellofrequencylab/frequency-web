import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PhotoHero, Section } from '@/components/marketing/marketing-ui'
import { LEAD_FLOWS, getLeadFlow } from '@/lib/onboarding/lead-flows'
import { PersonaChooser } from './persona-chooser'

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
    alternates: { canonical: `/start/${flow}` },
    openGraph: { title: lf.splash.headline, description: lf.splash.body, url: `/start/${flow}` },
    // Metadata merges per top-level key: omitting `twitter` inherits the ROOT block, so a lead
    // flow dropped in an IG bio would preview as generic site copy instead of its own splash.
    twitter: { card: 'summary_large_image', title: lf.splash.headline, description: lf.splash.body },
  }
}

export default async function LeadFlowPage({ params }: { params: Promise<{ flow: string }> }) {
  const { flow } = await params
  if (!LEAD_FLOWS[flow]) notFound()
  const lf = getLeadFlow(flow)

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
