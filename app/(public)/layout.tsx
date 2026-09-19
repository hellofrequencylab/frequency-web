import { PublicShareChrome } from '@/components/layout/public-share-chrome'

// Share URLs that used to sit under (main) and pay its auth read (SCAN-643).
// This layout never calls cookies() or headers(). Discover already paid to
// learn that one dynamic API voids revalidate for the whole subtree.
// Space profiles stay under (main) until SCAN-644: their layout still
// reads getMyProfileId, and a signed-in member keeps the member shell
// on the same URL.

export default async function PublicShareLayout({ children }: { children: React.ReactNode }) {
  return <PublicShareChrome>{children}</PublicShareChrome>
}
