import type { PillarSlug } from '@/lib/pillars'
import type { CircleSparkDraft } from './circle-spark'
import { writingCoach } from './writing-coach'
export type CircleComposeSection = 'pillars' | 'agreements' | 'remix' | 'rhythm' | 'card' | 'thread'

/** What Vera knows about the Circle so far, to ground the section it drafts. */
interface CircleComposeContext {
  name: string
  primaryPillar: PillarSlug | null
  topic?: string
  audience?: string
  identity?: string
}

export type CircleComposeResult = Partial<
  Pick<CircleSparkDraft, 'card' | 'oneLiner' | 'pillarsInside' | 'agreements' | 'remixOptions' | 'meetup' | 'gathering' | 'thread'>
> & { questions?: string[] }

export async function composeCircleSection(input: { section: CircleComposeSection; context: CircleComposeContext; profileId?: string | null }): Promise<CircleComposeResult | null> {
 return { questions: await writingCoach({ feature: 'circle-compose', context: JSON.stringify({ section: input.section, context: input.context }), profileId: input.profileId }) }
}
