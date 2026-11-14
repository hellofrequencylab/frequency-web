'use server'
import { getMyProfileId } from '@/lib/auth'
import { exposeMemberExperiment } from '@/lib/analytics/experiment-runtime'

export async function exposeUpcomingExperiment(id: string): Promise<void> {
  const profileId = await getMyProfileId()
  if (!profileId || !/^[0-9a-f-]{36}$/i.test(id)) return
  await exposeMemberExperiment(id).catch(() => {})
}
