import { redirect } from 'next/navigation'
import Link from 'next/link'
import { QrCode } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { isCodeLive } from '@/lib/qr/codes'

export const dynamic = 'force-dynamic'

// The universal dynamic-code resolver. Every managed QR encodes /q/<slug>; this
// records the scan (analytics + counter, via the record_qr_scan RPC) then sends the
// visitor to the code's current destination — a URL or an in-app earning node. The
// destination is editable in the Studio, so a printed code is retargeted with no
// reprint. Server-mediated: qr_codes RLS denies client reads, so we use the admin
// client here (same pattern as /n/[nodeId]).
export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: code } = await admin
    .from('qr_codes')
    .select('id, active, valid_from, valid_until, destination_type, target_url, node_id')
    .eq('slug', slug)
    .maybeSingle()

  // Resolve the destination first; only count a scan that actually goes somewhere.
  let destination: string | null = null
  if (code && isCodeLive(code)) {
    if (code.destination_type === 'node' && code.node_id) destination = `/n/${code.node_id}`
    else if (code.destination_type === 'url' && code.target_url) destination = code.target_url
  }

  if (code && destination) {
    const profileId = await getMyProfileId()
    await admin
      .rpc('record_qr_scan', { p_code_id: code.id, p_profile: profileId ?? undefined })
      .then(() => {}, () => {}) // analytics must never block the redirect
    redirect(destination)
  }

  // Not found / inactive / expired / misconfigured → a calm dead-end.
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-canvas">
      <div className="max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-elevated text-muted flex items-center justify-center">
          <QrCode className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-text mt-4">This code isn’t active</h1>
        <p className="text-sm text-muted mt-2">
          It may have expired or been retired. Check with whoever shared it.
        </p>
        <Link href="/" className="inline-block mt-5 text-sm font-semibold text-primary hover:underline">
          Go to Frequency →
        </Link>
      </div>
    </div>
  )
}
