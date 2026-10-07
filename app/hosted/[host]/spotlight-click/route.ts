import { handleSpotlightClick } from '@/lib/spaces/spotlight-clicks'

// A SPOTLIGHT LINK CARD PRESS on a website host (LIVE-856): `/spotlight-click` on the site's own origin,
// rewritten here by the proxy (lib/sites/host.ts), so a stand-alone site's beacon never leaves its origin.
// The beacon names its Space, which recordSpotlightClick checks; the host is not consulted. Always 204.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleSpotlightClick(req)
}
