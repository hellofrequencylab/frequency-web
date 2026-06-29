import Link from 'next/link'
import { EyeOff } from 'lucide-react'
import {
  marketplaceVisibility,
  isMarketplaceOperator,
  AREA_LABEL,
  type MarketArea,
} from '@/lib/marketplace/visibility'

// Shown ONLY to operators, and ONLY when the area they're viewing is switched OFF (hidden
// from members). A quiet reminder that what they see is invisible to everyone else, with a
// jump to the visibility toggles. Renders nothing for members (they can't reach a hidden area).
export async function MarketplaceHiddenBanner({ area }: { area: MarketArea }) {
  const [vis, operator] = await Promise.all([marketplaceVisibility(), isMarketplaceOperator()])
  if (vis[area] || !operator) return null
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-2.5">
      <span className="inline-flex items-center gap-2 text-sm text-text">
        <EyeOff className="h-4 w-4 text-warning" aria-hidden />
        <span>
          {AREA_LABEL[area]} is <strong className="font-semibold">hidden from members</strong>. Only operators can see it.
        </span>
      </span>
      <Link href="/admin/marketplace" className="text-sm font-medium text-primary hover:underline">
        Visibility settings
      </Link>
    </div>
  )
}
