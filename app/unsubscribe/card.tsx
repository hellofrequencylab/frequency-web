// The unsubscribe card: the one-column, no-login frame every /unsubscribe state renders inside
// (confirm, done, invalid, preference center). Moved out of page.tsx so the client-side confirm
// step (confirm-unsubscribe.tsx) can show the SAME success / error layouts after the member's
// click, without the page re-rendering. Presentational + server-friendly (no hooks).

import Link from 'next/link'
import { FocusTemplate } from '@/components/templates'

// ── Layout helpers ─────────────────────────────────────────────────────

export function Layout({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6 py-12">
      <div className="max-w-md w-full bg-surface border border-border rounded-card lift-1 p-8">
        <Link
          href="/"
          className="inline-block text-lead font-black tracking-tight text-text mb-6"
        >
          frequency
        </Link>
        <FocusTemplate title={title} description={description} width="narrow" divider={false}>
          <div className="space-y-3">{children}</div>
        </FocusTemplate>
      </div>
    </div>
  )
}

export function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-body-sm text-muted leading-relaxed">{children}</p>
}

export function ManageLink() {
  return (
    <div className="pt-3">
      <Link
        href="/settings#notifications"
        className="inline-flex items-center gap-1.5 rounded-control bg-primary text-on-primary text-body-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors"
      >
        Manage all preferences →
      </Link>
    </div>
  )
}
