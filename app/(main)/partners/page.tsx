import { MapPin } from 'lucide-react'
import { listActivePartners } from '@/lib/partners/read'

export const dynamic = 'force-dynamic'

// Partner directory (Phase 3 partners module). Lists aligned local businesses;
// members find them here and unlock offers in person (NFC plaque / QR → zaps).
export default async function PartnersPage() {
  const partners = await listActivePartners()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text mb-1">Partners</h1>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          Local businesses aligned with the community. Members unlock offers — tap
          their plaque or scan a code in person to claim it and earn zaps.
        </p>
      </div>

      {partners.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center">
          <p className="text-sm text-muted">No partners yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {partners.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-border bg-surface shadow-sm p-4"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-text">{p.name}</h2>
                {p.category && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-surface-elevated text-muted font-medium">
                    {p.category}
                  </span>
                )}
              </div>
              {p.city && (
                <div className="flex items-center gap-1 mt-0.5 text-xs text-subtle">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span>{p.city}</span>
                </div>
              )}
              {p.description && (
                <p className="mt-1.5 text-xs text-muted line-clamp-2">{p.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
