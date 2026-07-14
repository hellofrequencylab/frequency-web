import { redirect } from 'next/navigation'
import { contactsOwnerId } from '@/lib/connections/access'
import { FocusTemplate } from '@/components/templates'
import { ImportWizard } from '@/components/crm/import/import-wizard'

export const dynamic = 'force-dynamic'

// Member surface for CSV contact import (CRM Master Build Plan Phase 2). Any member owns
// a personal contact book, so the tool is open to any authenticated member; imported
// contacts land in their private network_contacts (owner-scoped RLS), never shared.
export default async function ImportContactsPage() {
  const ownerId = await contactsOwnerId()
  if (!ownerId) redirect('/feed')

  return (
    <FocusTemplate
      title="Import contacts"
      description="Bring a CSV of people into your contacts. We match your columns to the right fields, show you a preview, and skip anyone you already have. Saved privately to you."
      back={{ href: '/network/contacts', label: 'Contacts' }}
    >
      <ImportWizard targetKind="member" />
    </FocusTemplate>
  )
}
