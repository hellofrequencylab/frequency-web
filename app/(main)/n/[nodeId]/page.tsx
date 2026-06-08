import { notFound } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { FocusTemplate } from '@/components/templates'
import { ClaimButton } from './claim-button'

export const dynamic = 'force-dynamic'

// Landing page for a scanned physical node (the URL a QR/NFC encodes:
// /n/<nodeId>). Shows the spot + a Claim button that runs the verified pipeline.
export default async function NodePage({
  params,
  searchParams,
}: {
  params: Promise<{ nodeId: string }>
  searchParams: Promise<{ s?: string }>
}) {
  const { nodeId } = await params
  const { s: secret } = await searchParams
  const admin = createAdminClient()

  const { data: node } = await admin
    .from('nodes')
    .select('id, label, type, zaps_value, active, partner_id')
    .eq('id', nodeId)
    .maybeSingle()
  if (!node || !node.active) notFound()

  let partnerName: string | null = null
  if (node.partner_id) {
    const { data: partner } = await admin
      .from('partners')
      .select('name')
      .eq('id', node.partner_id)
      .maybeSingle()
    partnerName = partner?.name ?? null
  }

  return (
    <FocusTemplate
      width="narrow"
      divider={false}
      title={node.label ?? 'Check in'}
      description={partnerName ? `at ${partnerName}` : undefined}
    >
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-bg text-primary-strong">
          <MapPin className="h-8 w-8" />
        </div>

        <p className="mt-4 text-sm text-muted">
          {node.zaps_value > 0
            ? `Claim this spot to earn ${node.zaps_value} zaps.`
            : 'Claim this spot.'}
        </p>

        <div className="mt-6 flex justify-center">
          <ClaimButton nodeId={node.id} secret={secret ?? null} />
        </div>
      </div>
    </FocusTemplate>
  )
}
