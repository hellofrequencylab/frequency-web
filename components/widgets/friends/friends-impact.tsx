import { YourImpact } from '@/components/connections/your-impact'

// Friends layout module (ADR-270/294): "Your impact" — the member's own private lead-funnel view
// (the people on Frequency because of them). A self-fetching, caller-scoped RSC that renders nothing
// until the member has actually brought someone in, so an empty block costs one query and shows
// nothing (the module contract). The presentation lives in YourImpact (components/connections); this
// thin wrapper only registers it as an assignable block so the /friends interior renders through
// <PageModules> like every other module-driven page. No client JS.
export async function FriendsImpact() {
  return <YourImpact />
}
