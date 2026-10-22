import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'

// The operator funnel doors live OUTSIDE the (marketing) route group on purpose (ADR-591): they must be
// chrome-free (no marketing mega-nav / footer), so they inherit only the root layout and render their own
// minimal splash header + sticky CTA. This layout is a thin pass-through that scopes that intent.
//
// Under Frequency (ADR-1737, build-time) a door is a persona page on Stage inside the site kit root, and it
// wears the standard site header and footer: the Claude Design handoff says the door's chrome is identical to
// the rest of the marketing site, and the owner asked for the standard header and footer (2026-10-22).
// DAWN keeps the chrome-free door of ADR-591.
export default function FunnelLayout({ children }: { children: React.ReactNode }) {
  if (SITE_DESIGN === 'frequency') return <SiteShell>{children}</SiteShell>
  return <div className="min-h-screen bg-canvas">{children}</div>
}
