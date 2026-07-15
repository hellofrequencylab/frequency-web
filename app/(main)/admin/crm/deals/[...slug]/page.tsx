import { redirect } from 'next/navigation'

// Catch-all forward for the old Deals sub-routes (/admin/crm/deals/new, /deals/[id], /deals/[id]/edit).
// Deals was renamed to Pipeline (rescoped to the platform upsell + donation motion); this preserves every
// old deep link by mapping the same tail onto /admin/crm/pipeline/*, so no bookmark 404s.
export default async function DealsSlugRedirect({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params
  const tail = (slug ?? []).join('/')
  redirect(tail ? `/admin/crm/pipeline/${tail}` : '/admin/crm/pipeline')
}
