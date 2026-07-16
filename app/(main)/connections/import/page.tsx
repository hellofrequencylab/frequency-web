import { redirect } from 'next/navigation'

// The standalone member CSV importer page was retired: contact import now lives inside the
// surfaces that own the contacts, launched from an <ImportContactsButton> popup wizard (the
// platform Resonance CRM at /admin/crm?view=import, each Space CRM's Import tab, and — for a
// member's own book — the "Import from file" button on /network/contacts). This route stays
// only as a redirect so any bookmarked link lands members in their contacts area, where the
// file import, card scan, Google import, and manual add all live.
export const dynamic = 'force-dynamic'

export default function ImportContactsRedirect() {
  redirect('/network/contacts')
}
