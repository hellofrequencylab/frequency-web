import type { CircleSparkDraft } from './circle-spark'
import { writingCoach } from './writing-coach'
type CircleForEdit = Partial<
  Pick<
    CircleSparkDraft,
    | 'name'
    | 'card'
    | 'oneLiner'
    | 'identity'
    | 'audience'
    | 'pillarsInside'
    | 'meetup'
    | 'gathering'
    | 'thread'
    | 'format'
    | 'sizeLabel'
    | 'agreements'
    | 'remixOptions'
  >
> & { name: string }

/** The minimal change to apply: only the fields Vera touched. */
type CircleEditPatch = Partial<
  Pick<
    CircleSparkDraft,
    | 'name'
    | 'card'
    | 'oneLiner'
    | 'identity'
    | 'audience'
    | 'pillarsInside'
    | 'meetup'
    | 'gathering'
    | 'thread'
    | 'format'
    | 'sizeLabel'
    | 'agreements'
    | 'remixOptions'
  >
> & { questions?: string[] }


export async function planCircleEdit(input: { request: string; circle: CircleForEdit; profileId?: string | null }): Promise<CircleEditPatch | null> {
 return { questions: await writingCoach({ feature: 'circle-edit', context: JSON.stringify({ request: input.request, circle: input.circle }), profileId: input.profileId }) }
}
