import Link from 'next/link'
import { Link2, QrCode } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { LinkGenerator } from './link-generator'

export const dynamic = 'force-dynamic'

// Link Generator: the unified operator tool for trackable links (BUILD-LIST P5). One
// focused surface: compose a destination + campaign tags, see the tracked URL build
// live, then generate a /q/<slug> short link with a styled QR to copy. It reuses the
// EXISTING qr_codes short-link infrastructure (the QR Studio writes the same rows), so
// every link generated here is a first-class managed code the Studio can restyle,
// repoint, or retire without reprinting. No new table or RPC.
//
// Gate: requireAdmin('host', { staff: 'qr' }), the SAME staff capability the QR
// surface uses (the growth domain's acquisition tools). The generateLink action
// re-checks this server-side; this page guard only gates entry.
export default async function LinkGeneratorPage() {
  await requireAdmin('host', { staff: 'qr' })

  return (
    <AdminTemplate
      title="Link Generator"
      icon={Link2}
      eyebrow="Growth"
      width="default"
      description="Compose a trackable link with campaign tags, then generate a short link and QR to share. Every link is a managed code you can restyle or retire from the QR Studio."
      back={{ href: '/admin/growth', label: 'Growth' }}
      actions={
        <Link href="/admin/qr" className={buttonClasses('secondary', 'sm')}>
          <QrCode className="h-3.5 w-3.5" /> QR Studio
        </Link>
      }
    >
      <AdminSection>
        <LinkGenerator />
      </AdminSection>
    </AdminTemplate>
  )
}
