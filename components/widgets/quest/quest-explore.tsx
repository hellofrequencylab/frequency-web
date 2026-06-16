import Link from 'next/link'
import { Map as MapIcon, Zap, Target, ShoppingBag } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'

// My Quest layout module (ADR-270/294): the four quick links into the rest of the Quest —
// Journeys, Practices, Challenges, and The Vault. Static (no data read), so it never blocks.
// Slot-aware (ADR-295): the grid is keyed to its CONTAINER, not the viewport — two-wide in a
// narrow side column, four-wide once the slot is wide enough (`@lg`), so it never overflows the
// sidebar.
export async function QuestExplore() {
  return (
    <section>
      <SectionHeader title="Explore" />
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-4">
        <QuickLink href="/journeys" Icon={MapIcon} label="Journeys" sub="Browse + build" color="bg-broadcast-bg text-broadcast-strong" />
        <QuickLink href="/practices" Icon={Zap} label="Practices" sub="Log today" color="bg-primary-bg text-primary-strong" />
        <QuickLink href="/crew/challenges" Icon={Target} label="Challenges" sub="Capstones + more" color="bg-signal-bg text-signal-strong" />
        <QuickLink href="/crew/store" Icon={ShoppingBag} label="The Vault" sub="Gems, Awards, standing" color="bg-warning-bg text-warning" />
      </div>
    </section>
  )
}

function QuickLink({
  href,
  Icon,
  label,
  sub,
  color,
}: {
  href: string
  Icon: React.ElementType
  label: string
  sub: string
  color: string
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl bg-surface-elevated/60 p-3 transition-colors hover:bg-surface-elevated motion-reduce:transition-none"
    >
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm font-semibold leading-none text-text">{label}</div>
      <div className="mt-0.5 text-xs text-muted">{sub}</div>
    </Link>
  )
}
