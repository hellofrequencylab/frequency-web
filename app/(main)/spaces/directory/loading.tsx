import { FqIndexLoading } from '@/components/frequency/members/community-states'

// The Business Spaces directory's loading screen (SCAN-405, LIVE-1018). The Frequency page awaits the
// discovery read before it paints, so the route needs its own boundary: a heading bar, the find row, then
// the same dimension-matched card grid the page streams into. Neutral on purpose: no photo band, so
// nothing flashes where the header will land.

export default function SpacesDirectoryLoading() {
  return <FqIndexLoading label="Loading Spaces" shape="circles" />
}
