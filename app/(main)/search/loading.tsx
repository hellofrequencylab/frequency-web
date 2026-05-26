import { Skeleton } from '@/components/ui/skeleton'

export default function SearchLoading() {
  return (
    <div className="px-4 py-8 max-w-2xl mx-auto">
      <Skeleton className="h-7 w-24 mb-4" />
      <Skeleton className="h-10 w-full rounded-xl mb-6" />
      <div className="flex gap-1 mb-6">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-none" />
        ))}
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <Skeleton className="w-9 h-9 rounded-full shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-1.5" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
