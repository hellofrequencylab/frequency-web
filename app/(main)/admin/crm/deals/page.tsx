import { redirect } from 'next/navigation'

// Deals was renamed to Pipeline and rescoped to the platform's upsell + donation motion. This stub keeps
// the old /admin/crm/deals URL alive (no 404) by permanently forwarding to the new board. The dynamic
// sub-routes (/deals/new, /deals/[id], /deals/[id]/edit) are forwarded by ./[...slug]/page.tsx.
export default function DealsRedirect() {
  redirect('/admin/crm/pipeline')
}
