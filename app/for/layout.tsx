import { SITE_DESIGN } from '@/lib/theme/design'
import { SiteShell } from '@/components/frequency/site/shell/site-shell'

// The operator funnel doors live OUTSIDE the (marketing) route group on purpose (ADR-591): they must be
// chrome-free (no marketing mega-nav / footer), so they inherit only the root layout and render their own
// minimal splash header + sticky CTA. This layout is a thin pass-through that scopes that intent.
//
// Under Frequency (ADR-1737, build-time) a door is a persona page, so it sits on Stage inside the site kit
// root (tokens, mood, FX) with `chrome={false}`: still no mega-nav and no footer, as ADR-591 asks.
export default function FunnelLayout({ children }: { children: React.ReactNode }) {
  if (SITE_DESIGN === 'frequency') return <SiteShell chrome={false}>{children}</SiteShell>
  return <div className="min-h-screen bg-canvas">{children}</div>
}
