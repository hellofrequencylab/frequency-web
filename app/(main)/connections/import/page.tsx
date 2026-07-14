import { redirect } from 'next/navigation'

// The standalone member CSV importer was retired (contact import now lives inside the CRM
// surfaces the operator actually uses: the platform Resonance CRM at /admin/crm?view=import and
// each Space CRM's Import tab). This route stays only as a redirect so any bookmarked link lands
// members in their contacts area, where the card scan, Google import, and manual add live.
export const dynamic = 'force-dynamic'

export default function ImportContactsRedirect() {
  redirect('/network/contacts')
}
