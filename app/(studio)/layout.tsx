import Link from 'next/link'
import { LayoutDashboard, Users, Megaphone, ArrowLeft } from 'lucide-react'
import { requireStaff } from '@/lib/staff'

// The Studio: an admin-gated business cockpit with its own SaaS-style shell
// (not the member chrome). Gated once here (ADR-027). Routes live under /studio.
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff()

  return (
    <div className="min-h-screen bg-canvas text-text">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <Link href="/studio" className="text-sm font-bold tracking-tight">
          Frequency <span className="text-primary-strong">Studio</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-xs text-subtle capitalize">{staff.role}</span>
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to app
          </Link>
        </div>
      </header>

      <div className="flex">
        <nav className="w-52 shrink-0 border-r border-border p-3 space-y-0.5">
          <Link href="/studio" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:bg-surface-elevated hover:text-text transition-colors">
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <Link href="/studio/contacts" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:bg-surface-elevated hover:text-text transition-colors">
            <Users className="w-4 h-4" />
            Contacts
          </Link>
          <Link href="/studio/campaigns" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:bg-surface-elevated hover:text-text transition-colors">
            <Megaphone className="w-4 h-4" />
            Campaigns
          </Link>
          <p className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-subtle">
            Coming soon
          </p>
          {['Automations', 'Segments', 'Analytics', 'Agent', 'Settings'].map((m) => (
            <span key={m} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-subtle/60 cursor-default">
              {m}
            </span>
          ))}
        </nav>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
