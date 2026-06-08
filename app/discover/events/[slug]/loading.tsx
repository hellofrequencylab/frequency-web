import { Skeleton } from '@/components/ui/skeleton'

export default function EventDetailLoading() {
  return (
    <div className="relative max-w-3xl mx-auto px-6 py-20 sm:py-24">
      {/* Back link */}
      <Skeleton className="h-4 w-16 mb-6" />

      {/* Event title */}
      <Skeleton className="h-8 w-3/4 mb-2" />
      <Skeleton className="h-7 w-1/2 mb-6" />

      {/* Date + location meta */}
      <div className="space-y-2 mb-8">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-28" />
        </div>
      </div>

      {/* Description body */}
      <div className="space-y-2 mb-10">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>

      {/* CTA / sign-in block */}
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  )
}
