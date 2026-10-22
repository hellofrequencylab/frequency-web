import { Skeleton } from '@/components/ui/skeleton'

/** The centre column's loading face for the public layouts (marketing, public share, discover). The
 *  header and footer are the layout's and are already painted; this fills only <main>, so the footer
 *  never rides up the page while a route streams. Shapes only, tokened, no content. */
export function PageLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-12 sm:px-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-2/3 max-w-xl" />
      <Skeleton className="h-5 w-full max-w-2xl" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-card" />
        ))}
      </div>
    </div>
  )
}
