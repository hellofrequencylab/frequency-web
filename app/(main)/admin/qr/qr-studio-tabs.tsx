'use client'

import { useState } from 'react'
import { MapPin, Link2, BarChart3 } from 'lucide-react'
import { QrStudio, type StudioNode, type PartnerOption } from './qr-studio'
import { DynamicLinks, type StudioLink, type NodeOption } from './dynamic-links'
import { Analytics, type AnalyticsData } from './analytics'

type TabKey = 'nodes' | 'links' | 'analytics'

const TABS: { key: TabKey; label: string; Icon: typeof MapPin }[] = [
  { key: 'nodes', label: 'Check-in codes', Icon: MapPin },
  { key: 'links', label: 'Dynamic links', Icon: Link2 },
  { key: 'analytics', label: 'Analytics', Icon: BarChart3 },
]

export function QrStudioTabs({
  nodeProps,
  linkProps,
  analytics,
}: {
  nodeProps: { initialNodes: StudioNode[]; partners: PartnerOption[] }
  linkProps: { initialLinks: StudioLink[]; nodes: NodeOption[]; partners: PartnerOption[] }
  analytics: AnalyticsData
}) {
  const [tab, setTab] = useState<TabKey>('nodes')

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-primary text-text'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'nodes' && <QrStudio initialNodes={nodeProps.initialNodes} partners={nodeProps.partners} />}
      {tab === 'links' && (
        <DynamicLinks
          initialLinks={linkProps.initialLinks}
          nodes={linkProps.nodes}
          partners={linkProps.partners}
        />
      )}
      {tab === 'analytics' && <Analytics data={analytics} />}
    </div>
  )
}
