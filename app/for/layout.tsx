// The operator funnel doors live OUTSIDE the (marketing) route group on purpose (ADR-591): they must be
// chrome-free (no marketing mega-nav / footer), so they inherit only the root layout and render their own
// minimal splash header + sticky CTA. This layout is a thin pass-through that scopes that intent.
export default function FunnelLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-canvas">{children}</div>
}
