// Entry-point A/B management (ADR-136). Define destination variants for one entry
// point and read per-variant scans / conversions / rate. In /marketing (admin/staff).

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowLeft } from 'lucide-react'
import { DashboardTemplate } from '@/components/templates/dashboard-template'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCallerProfile } from '@/lib/auth'
import { listMarketingTargets } from '@/lib/qr/marketing'
import { entryDestinationGroups } from '@/lib/entry-points/destinations'
import { variantResults } from '@/lib/entry-points/ab'
import { shortLinkUrl } from '@/lib/qr/links'
import { VariantManager } from './variants-client'

export const dynamic = 'force-dynamic'

export default async function VariantsPage({ params }: { params: Promise<{ codeId: string }> }) {
  const { codeId } = await params
  const db = createAdminClient() as unknown as SupabaseClient
  const { data: code } = await db
    .from('qr_codes')
    .select('id, slug, title, target_url, template_id')
    .eq('id', codeId)
    .maybeSingle()
  // Only entry points (template_id set) can be A/B tested.
  if (!code || !(code as { template_id: string | null }).template_id) notFound()
  const c = code as { id: string; slug: string; title: string; target_url: string | null }

  const me = await getCallerProfile()
  const [targets, results] = await Promise.all([
    me ? listMarketingTargets(me.id) : Promise.resolve([]),
    variantResults(codeId),
  ])

  return (
    <DashboardTemplate
      eyebrow={
        <Link href="/admin/marketing/funnels" className="inline-flex items-center gap-1 text-muted hover:text-text">
          <ArrowLeft className="h-3 w-3" /> Funnels
        </Link>
      }
      title={`A/B · ${c.title}`}
      description={`Split scans of ${shortLinkUrl(c.slug).replace(/^https?:\/\//, '')} across destinations and see which converts. With no active variants, the entry point uses its default destination (the control).`}
    >
      <VariantManager
        codeId={codeId}
        control={c.target_url ?? ''}
        results={results}
        destinationGroups={entryDestinationGroups(targets)}
      />
    </DashboardTemplate>
  )
}
