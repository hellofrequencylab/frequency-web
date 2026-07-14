import { AdminTemplate } from '@/components/templates'
import { listImportSpaces } from '@/lib/crm/import/actions'
import { ImportWizard } from '@/components/crm/import/import-wizard'

export const dynamic = 'force-dynamic'

// Operator surface for CSV contact import into a Space's sealed contact list (CRM Master
// Build Plan Phase 2). The Marketing layout already gates access. Contacts land in the
// chosen Space's contacts(space_id) as unknown/unsubscribed leads (ADR-099), sealed to
// the Space by the membrane (never shared to the wider community).
export default async function MarketingImportPage() {
  const spaces = await listImportSpaces()

  return (
    <AdminTemplate
      eyebrow="Marketing"
      title="Import contacts"
      description="Upload a CSV to bring contacts into one of your Space contact lists. We match your columns to the right fields, dedupe against what the Space already has, and show a preview before anything is saved. Imported contacts are leads, never auto-subscribed."
      width="wide"
    >
      <div className="max-w-2xl">
        <ImportWizard targetKind="space" spaces={spaces} />
      </div>
    </AdminTemplate>
  )
}
