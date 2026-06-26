import { Upload } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { ImportClient } from './import-client'

// /admin/import (Community > Activity): turn a WhatsApp group "Export chat" .txt into
// reviewable events + housing listings. This page is a DRY RUN — it parses + classifies
// and shows what it found; it never posts anything. The whole point is to read the
// preview and trust the extraction before any writer is wired up. Same gate as
// /admin/events (community host+ OR community staff); the action re-checks server-side.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Import from chat' }

export default async function AdminImportPage() {
  await requireAdmin('host', { staff: 'community' })

  return (
    <AdminTemplate
      title="Import from chat"
      icon={Upload}
      eyebrow="Community"
      description="Turn a WhatsApp group export into reviewable events and housing listings. Nothing is posted from here. This is a dry run you read first."
    >
      <AdminSection
        title="WhatsApp chat export"
        description="In WhatsApp, open the group, tap its name, and choose Export chat (without media). Upload or paste the .txt below."
      >
        <ImportClient />
      </AdminSection>
    </AdminTemplate>
  )
}
