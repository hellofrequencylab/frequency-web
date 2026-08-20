'use client'

import { Link2, MapPin, UserCircle, Megaphone, Trophy, BarChart3 } from 'lucide-react'
import { QrGenerator } from './qr-generator'
import { QrStudio, type StudioNode, type PartnerOption } from './qr-studio'
import { DynamicLinks, type StudioLink, type NodeOption, type PickOption } from './dynamic-links'
import { Campaigns, type CampaignCard, type CampaignCodeOption } from './campaigns'
import { Analytics, type AnalyticsData } from './analytics'
import { MemberProfileCodes, type MemberProfileCode } from './member-profile-codes'
import { MarketingCodesAdmin, type MarketingCodeAdmin } from './marketing-codes-admin'
import type { QrStudioConfig } from '@/lib/elements/qr-studio-config'

// The QR Studio dashboard: the GENERATOR sits at the top (type selector + all
// options), and every kind of code is categorized below it. Single scroll, no tabs.
export function QrStudioDashboard({
  qrConfig,
  nodeProps,
  linkProps,
  campaignProps,
  memberCodes,
  marketingCodes,
  analytics,
}: {
  /** The operator's resolved qr-studio element config (resolveQrStudio at the server mount), threaded
   *  into every StyleEditor surface below. Optional = the fail-safe full config. */
  qrConfig?: QrStudioConfig
  nodeProps: { initialNodes: StudioNode[]; partners: PartnerOption[] }
  linkProps: {
    initialLinks: StudioLink[]
    nodes: NodeOption[]
    circles: PickOption[]
    events: PickOption[]
    partners: PartnerOption[]
  }
  campaignProps: { campaigns: CampaignCard[]; codes: CampaignCodeOption[] }
  memberCodes: MemberProfileCode[]
  marketingCodes: MarketingCodeAdmin[]
  analytics: AnalyticsData
}) {
  return (
    <div className="space-y-8">
      {/* ── Generator (top) ─────────────────────────────────────────────────── */}
      <QrGenerator
        partners={linkProps.partners}
        nodes={linkProps.nodes}
        circles={linkProps.circles}
        events={linkProps.events}
        qrConfig={qrConfig}
      />

      {/* ── Categories ──────────────────────────────────────────────────────── */}
      <Category Icon={Link2} title="Dynamic links" count={linkProps.initialLinks.length}>
        <DynamicLinks
          initialLinks={linkProps.initialLinks}
          nodes={linkProps.nodes}
          circles={linkProps.circles}
          events={linkProps.events}
          partners={linkProps.partners}
          qrConfig={qrConfig}
          hideCreate
        />
      </Category>

      <Category Icon={MapPin} title="Check-in codes" count={nodeProps.initialNodes.length}>
        <QrStudio initialNodes={nodeProps.initialNodes} partners={nodeProps.partners} qrConfig={qrConfig} hideCreate />
      </Category>

      <Category Icon={UserCircle} title="Member profile codes" count={memberCodes.length}>
        <MemberProfileCodes codes={memberCodes} qrConfig={qrConfig} />
      </Category>

      <Category Icon={Megaphone} title="Marketing codes" count={marketingCodes.length}>
        <MarketingCodesAdmin codes={marketingCodes} qrConfig={qrConfig} />
      </Category>

      <Category Icon={Trophy} title="Campaigns" count={campaignProps.campaigns.length}>
        <Campaigns campaigns={campaignProps.campaigns} codes={campaignProps.codes} />
      </Category>

      <Category Icon={BarChart3} title="Analytics">
        <Analytics data={analytics} />
      </Category>
    </div>
  )
}

function Category({
  Icon,
  title,
  count,
  children,
}: {
  Icon: typeof Link2
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 border-b border-border pb-2 text-body font-bold text-text">
        <Icon className="h-4 w-4 text-primary-strong" />
        {title}
        {typeof count === 'number' && (
          <span className="rounded-pill bg-surface-elevated px-2 py-0.5 text-meta font-medium text-muted">{count}</span>
        )}
      </h2>
      {children}
    </section>
  )
}
