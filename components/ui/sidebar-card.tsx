// Shared admin sidebar card — a titled panel with a header divider. Extracted
// from 9 byte-identical local copies across the admin pages (post-overhaul
// streamlining). Distinct from the borderless ModuleCard: this keeps a light
// box because admin side panels read as discrete tool surfaces.

export function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border">
        <h3 className="text-sm font-bold text-text">{title}</h3>
      </div>
      {children}
    </div>
  )
}
