import { FqUtilityLoading } from '@/components/frequency/members/utility-states'

// Instant full-bleed loading for the personal codes / QR hub. The Zap menu's
// Connect tile ("Share your code") navigates here; without this the feed behind
// stayed visible during the RSC fetch and flashed before the codes loaded. This
// paints the FocusTemplate's shape immediately (matches the page's `wide` width)
// so the destination covers the feed the instant navigation starts.
export default function CodesLoading() {
  return <FqUtilityLoading title="Your codes" label="Loading your codes" rows={3} />
}
