'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { App } from '@/lib/apps/types'

// SURFACE LINK ROW — one editor surface as a compact link-row OUT to its own management page (inline-first
// rail, ADR-514). Lifted out of settings-panel.tsx into its own module (Phase 2) so BOTH the panel AND the
// summary card (surface-summary-card.tsx) can import it without a client-import cycle. A surface classified
// `render: 'link'` is a FEATURE WORKFLOW (Members / CRM / Offerings / QR / Email / Insights / Billing /
// Danger, …) that the bar deep-links into rather than inlining. Entity-agnostic: it takes a resolved
// `href` (Space rows resolve via hrefForSurface; core/personal via hrefForEntitySurface). Tokens only, no
// hex. This is the FALLBACK chrome the summary card degrades to when a surface has no summary stat.
export function SurfaceLinkRow({ app, href }: { app: App; href: string }) {
  const Icon = app.surfaces.editor?.Icon
  return (
    <Link
      href={href}
      title={app.description}
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 outline-none transition-colors hover:border-border-strong hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none"
    >
      {Icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-bg text-primary-strong">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{app.label}</span>
      <ArrowRight
        className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong motion-reduce:transition-none"
        aria-hidden
      />
    </Link>
  )
}
