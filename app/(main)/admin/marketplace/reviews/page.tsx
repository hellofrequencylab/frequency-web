import Link from 'next/link'
import { Star, EyeOff } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonClasses } from '@/components/ui/button'
import { listReviewsForModeration, reviewStatusCounts, type ModeratedReview } from '@/lib/commerce/reviews'
import { Stars } from '@/components/marketplace/product-reviews'
import { hideProductReviewAction, unhideProductReviewAction } from '../actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Reviews · Admin' }

function ReviewRow({ r }: { r: ModeratedReview }) {
  const when = new Date(r.createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const hidden = r.status === 'hidden'
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/market/${r.productId}`} className="min-w-0 truncate font-medium text-text hover:text-primary">
          {r.productTitle}
        </Link>
        <div className="flex items-center gap-2">
          <Stars value={r.rating} />
          {hidden && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-muted">
              <EyeOff className="h-3 w-3" aria-hidden /> Hidden
            </span>
          )}
        </div>
      </div>
      {r.body && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{r.body}</p>}
      <p className="mt-1 text-2xs text-subtle">
        {r.reviewer} · {when}
      </p>
      <div className="mt-3">
        {hidden ? (
          <form action={unhideProductReviewAction.bind(null, r.id)}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>
              Restore
            </button>
          </form>
        ) : (
          <form action={hideProductReviewAction.bind(null, r.id)}>
            <button type="submit" className={buttonClasses('ghost', 'sm')}>
              Hide
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default async function MarketplaceReviewsPage() {
  await requireAdmin('admin', { staff: 'platform' })
  const [reviews, counts] = await Promise.all([listReviewsForModeration(), reviewStatusCounts()])

  return (
    <AdminTemplate
      title="Reviews"
      eyebrow="Marketplace"
      description="Every rating members left on a listing or Space Shop item. Hiding one takes it off the listing; nothing is deleted, so you can restore it."
      back={{ href: '/admin/marketplace', label: 'Marketplace' }}
      width="wide"
    >
      <div className="mb-8 grid grid-cols-2 gap-3">
        <StatCard label="Live reviews" value={counts.visible} icon={Star} />
        <StatCard label="Hidden" value={counts.hidden} icon={EyeOff} />
      </div>

      <AdminSection title="All reviews" description="Newest first. Hidden reviews stay here so you can restore them.">
        {reviews.length === 0 ? (
          <EmptyState
            variant="first-use"
            icon={Star}
            title="No reviews yet"
            description="When a member reviews a listing or Shop item, it shows up here for oversight."
          />
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewRow key={r.id} r={r} />
            ))}
          </div>
        )}
      </AdminSection>
    </AdminTemplate>
  )
}
