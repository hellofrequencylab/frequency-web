import { notFound } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { ClaimButton } from './claim-button'

export const dynamic = 'force-dynamic'

// Landing page for a scanned physical node (the URL a QR/NFC encodes:
// /n/<nodeId>). Shows the spot + a Claim button that runs the verified pipeline.
export default async function NodePage({
  params,
}: {
  params: Promise<{ nodeId: string }>
}) {
  const { nodeId } = await params
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
    <div className="max-w-md mx-auto text-center py-12">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-bg text-primary-strong flex items-center justify-center">
        <MapPin className="w-8 h-8" />
      </div>

      <h1 className="text-2xl font-bold text-text mt-4">{node.label ?? 'Check in'}</h1>
      {partnerName && <p className="text-sm text-muted mt-1">at {partnerName}</p>}

      <p className="text-sm text-muted mt-4">
        {node.zaps_value > 0
          ? `Claim this spot to earn ${node.zaps_value} zaps.`
          : 'Claim this spot.'}
      </p>

      <div className="mt-6 flex justify-center">
        <ClaimButton nodeId={node.id} />
      </div>
    </div>
  )
}
