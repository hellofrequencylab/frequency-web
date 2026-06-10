import Link from 'next/link'
import { Lock, Mail, Phone, Building2, MapPin, Globe, ScanText } from 'lucide-react'
import type { LinkedContactCard } from '@/lib/connections/matching'

const SOURCE_LABEL: Record<string, string> = {
  card_scan: 'Scanned from a card',
  poster: 'From a poster',
  manual: 'Added by hand',
  import: 'Imported',
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// The owner-private contact card on a member's profile (docs/NETWORK-CRM.md). Shown
// ONLY to the viewer who merged their own personal contact with this member — it's
// their own logged data (the original "how we met" details + notes), surfaced where
// it's useful and visible to no one else. The parent gates on ownership before
// rendering; this component is purely presentational.
export function PrivateContactPanel({ card, memberName }: { card: LinkedContactCard; memberName: string }) {
  const added = fmtDate(card.createdAt)
  const rows = [
    card.email && { Icon: Mail, label: card.email, href: `mailto:${card.email}` },
    card.phone && { Icon: Phone, label: card.phone, href: `tel:${card.phone}` },
    (card.title || card.company) && {
      Icon: Building2,
      label: [card.title, card.company].filter(Boolean).join(' · '),
    },
    card.city && { Icon: MapPin, label: card.city },
    card.website && { Icon: Globe, label: card.website, href: card.website },
  ].filter(Boolean) as { Icon: typeof Mail; label: string; href?: string }[]

  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface-elevated/40 p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-text">
          <Lock className="h-3.5 w-3.5 text-subtle" /> Your private contact card
        </h2>
        <Link href={`/connections/${card.id}`} className="text-xs font-medium text-primary-strong hover:underline">
          Open
        </Link>
      </div>
      <p className="mb-3 text-xs text-muted">
        From your contact book — only you can see this. The details you logged for {memberName}.
      </p>

      <dl className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-text">
            <r.Icon className="h-3.5 w-3.5 shrink-0 text-subtle" />
            {r.href ? (
              <a href={r.href} className="truncate hover:underline" target={r.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                {r.label}
              </a>
            ) : (
              <span className="truncate">{r.label}</span>
            )}
          </div>
        ))}
      </dl>

      {card.notes.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          {card.notes.map((n, i) => (
            <p key={i} className="text-sm text-muted">“{n}”</p>
          ))}
        </div>
      )}

      <p className="mt-3 flex items-center gap-1 text-2xs text-subtle">
        <ScanText className="h-3 w-3" /> {SOURCE_LABEL[card.source] ?? card.source}
        {added && ` · added ${added}`}
      </p>
    </div>
  )
}
