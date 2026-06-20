import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/ui/section-header'

// Route-level loading UI for Settings (PAGE-FRAMEWORK §5). The page is a client
// surface (the theme toggle reads localStorage), so this paints the FocusTemplate
// shape (centered max-w-2xl, the two SectionHeader sections, and the setting-row
// list) while the bundle loads, so there is no layout shift on arrival.
function SettingRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
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
    <div className="mx-auto w-full max-w-2xl">
      {/* Header band (FocusTemplate / PageHeading: title + description + rule) */}
      <div className="mb-4 space-y-2 sm:mb-5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="mb-5 border-b border-border sm:mb-6" />

      {/* Account section */}
      <section className="mb-8">
        <SectionHeader title="Account" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SettingRowSkeleton key={i} />
          ))}
        </div>
      </section>

      {/* Appearance section */}
      <section>
        <SectionHeader title="Appearance" />
        <Skeleton className="mb-2 h-3 w-12" />
        <div className="divide-y divide-border/80 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm dark:divide-border/50">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-36 max-w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
