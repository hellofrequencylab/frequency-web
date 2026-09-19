'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { setPlatformFlag } from '@/lib/platform-flags'
import { parseInput, z } from '@/lib/validation'

// Open-feed switch — when ON, the main feed lifts its reach gate so every member sees
// every member's posts; when OFF, the normal "your circles + nearby" reach model applies.
// Same gate as the Community page (host + community staff). The live behaviour is enforced
// DB-side in feed_for_viewer; this only flips platform_flags.feed_open, recorded in
// platform_flag_events (who/when/old→new). Fully reversible.
export async function setFeedOpen(open: boolean): Promise<void> {
  const { profileId } = await requireAdmin('host', { staff: 'community' })
  const { open: on } = parseInput(z.object({ open: z.boolean() }), { open })
  await setPlatformFlag('feed_open', on, { changedBy: profileId, source: 'admin' })
  revalidatePath('/feed')
  revalidatePath('/admin/community')
}
