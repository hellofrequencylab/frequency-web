import { FqIndexLoading } from '@/components/frequency/members/community-states'

// Route-level loading UI for Housing (LIVE-1032). The page awaits its listings before first paint and had
// no boundary of its own, so the wait fell through to whatever the parent painted. Under Frequency it wears
// the kit skeleton every other marketplace area uses; DAWN gets a heading, the search row and a card grid.
export default function HousingLoading() {
  return <FqIndexLoading label="Loading Housing" shape="items" />
}
