import { FqSearchLoading } from '@/components/frequency/members/community-states'

// Route-level loading UI for Search (PAGE-FRAMEWORK §5).
//
// It used to open with `px-4 py-8 max-w-2xl mx-auto` — the RETIRED page shell. The app shell's
// <main> already supplies the outer padding (px-4 sm:px-6 lg:px-8 on the content column, py-6 on
// <main>), so that wrapper double-padded, and `max-w-2xl` painted a column narrower than the
// IndexTemplate page.tsx actually renders. The skeleton now paints the template's own shape:
// PageHeading's title + description, its divider rule, the toolbar row, then the result rows.
export default function SearchLoading() {
  return <FqSearchLoading />
}
