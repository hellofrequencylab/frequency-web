import { handleSpotlightClick } from '@/lib/spaces/spotlight-clicks'

// A SPOTLIGHT LINK CARD PRESS on frequencylocal.com (LIVE-856, lib/spaces/spotlight-clicks.ts). Always 204.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleSpotlightClick(req)
}
