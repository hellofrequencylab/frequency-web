import { FqSettingsLoading } from '@/components/frequency/members/utility-states'

// Route-level loading UI for the unified Settings page (PAGE-FRAMEWORK §5). Paints the
// FocusTemplate shape (centered max-w-3xl, the chip section-rail, and the first stacked
// sections' row cards) while the server sections stream, so there is no layout shift on
// arrival. Per-section streaming after first paint is handled by the page's own
// <Suspense> fallbacks; this covers the initial navigation.


export default function SettingsLoading() {
  return <FqSettingsLoading />
}
