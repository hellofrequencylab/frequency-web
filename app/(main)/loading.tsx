import { Skeleton } from '@/components/ui/skeleton'

/** The fallback for every member page that has no loading face of its own. The shell (header, menus,
 *  rails) is already painted by the layout, so a menu click shows this the moment it lands instead of
 *  a frozen screen while the next page's data reads finish. Routes with their own loading.tsx win. */
export default function MemberLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-10 w-2/3 rounded-card" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-48 w-full rounded-card" />
      <Skeleton className="h-32 w-full rounded-card" />
    </div>
  )
}
