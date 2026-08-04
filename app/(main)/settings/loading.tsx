import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/ui/section-header'

// Route-level loading UI for the unified Settings page (PAGE-FRAMEWORK §5). Paints the
// FocusTemplate shape (centered max-w-3xl, the chip section-rail, and the first stacked
// sections' row cards) while the server sections stream, so there is no layout shift on
// arrival. Per-section streaming after first paint is handled by the page's own
// <Suspense> fallbacks; this covers the initial navigation.

function SettingRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 lift-1">
      <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
    </div>
  )
}

export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header band (FocusTemplate / PageHeading: title + description + rule) */}
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />

      {/* Section chips */}
      <div className="mb-8 flex flex-wrap gap-2 border-b border-border pb-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-28 rounded-pill" />
        ))}
      </div>

      {/* Profile link card */}
      <section>
        <SectionHeader title="Profile" />
        <SettingRowSkeleton />
      </section>

      {/* Appearance section */}
      <section className="mt-12 border-t border-border pt-8">
        <SectionHeader title="Appearance" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-card" />
          ))}
        </div>
      </section>

      {/* Notifications section */}
      <section className="mt-12 border-t border-border pt-8">
        <SectionHeader title="Notifications" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SettingRowSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  )
}
