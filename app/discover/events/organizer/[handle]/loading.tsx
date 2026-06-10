import { Skeleton } from '@/components/ui/skeleton'

export default function OrganizerLoading() {
  return (
    <div className="relative max-w-3xl mx-auto px-6 py-20 sm:py-24">
      {/* Back link */}
      <Skeleton className="h-4 w-16 mb-6" />

      {/* Host identity */}
      <div className="flex items-center gap-3 mb-2">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-8 w-1/2" />
      </div>
      <Skeleton className="h-4 w-3/4 mb-8" />

      {/* Subscribe band */}
      <Skeleton className="h-16 w-full rounded-2xl mb-10" />

      {/* Upcoming heading */}
      <Skeleton className="h-6 w-40 mb-6" />

      {/* Event rows */}
      <div className="space-y-3 mb-12">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-2xl" />
        ))}
      </div>

      {/* CTA */}
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  )
}
