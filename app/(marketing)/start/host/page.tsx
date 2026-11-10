import { Suspense } from 'react'
import type { Metadata } from 'next'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { HostFunnelHero } from '@/components/frequency/site/pages/funnel/host-hero'
import { HostFunnelForm } from '@/components/frequency/site/pages/funnel/host-form'
import {
  FUNNEL_PARAM_KEYS,
  funnelQuery,
  funnelRecord,
  hostFunnelCopy,
  parseFunnelContext,
  type FunnelContext,
} from '@/lib/onboarding/funnel-context'

// The smart host funnel (LIVE-2233): where a FlowWeb host invite lands. The link carries persona, region,
// area, channel, src and utm tags (lib/onboarding/funnel-context.ts); the page speaks to the place, picks
// what they host from the Channel, adds Daniel's line on his personal invites, and stores every param on
// the lead. A static segment, so it wins over /start/[flow] for this one slug.

const HOST_STILL = '/images/site/meditation-circle-outdoor.jpg'
const HEADLINE = 'Start a Circle near you.'
const BODY = 'You already teach, lead or gather people. Frequency gives that a free local home.'

export const metadata: Metadata = {
  title: HEADLINE,
  description: BODY,
  // A personal invite landing, shared one to one: never a crawl target (the /start/<flow> rule, SCAN-803).
  robots: { index: false, follow: true },
  alternates: { canonical: '/start/host' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: HEADLINE, description: BODY, url: '/start/host' },
  twitter: { card: 'summary_large_image', title: HEADLINE, description: BODY },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

// SPEED (PAGE-FRAMEWORK §5.3): searchParams is read INSIDE the boundary, so the chrome paints first and
// the fallback is the same page without the link's context.
export default function HostFunnelPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<HostFunnel ctx={parseFunnelContext({})} params={{}} />}>
      <HostFunnelFromLink searchParams={searchParams} />
    </Suspense>
  )
}

async function HostFunnelFromLink({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const params: Record<string, string> = {}
  for (const k of FUNNEL_PARAM_KEYS) {
    const v = raw[k]
    const one = Array.isArray(v) ? v[0] : v
    if (typeof one === 'string') params[k] = one.slice(0, 64)
  }
  return <HostFunnel ctx={parseFunnelContext(params)} params={params} />
}

function HostFunnel({ ctx, params }: { ctx: FunnelContext; params: Record<string, string> }) {
  const copy = hostFunnelCopy(ctx)
  const rec = funnelRecord(ctx)
  return (
    <>
      <HostFunnelHero image={HOST_STILL} copy={copy} />
      <HostFunnelForm
        params={params}
        subject={ctx.channelSubject}
        area={rec.area}
        region={rec.region}
        continueQuery={funnelQuery(rec)}
      />
    </>
  )
}
