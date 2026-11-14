import type { triage } from './moderation'

/** The route resolves the allowed Hunt IDs from live authorization, never from browser input. */
export type HuntModerationScope = Readonly<{ huntIds: readonly string[] }>

type HuntModerationCase = Readonly<{
  huntId: string
  title: string
  /** What the Trail is doing now, in the player's words: running, paused or closed. */
  state?: 'published' | 'paused' | 'closed'
  reports: Parameters<typeof triage>[0]
}>

/** A reader must enforce the supplied scope on every read. The shell renders only aggregate triage. */
export type HuntModerationReader = (
  scope: HuntModerationScope,
) => Promise<readonly HuntModerationCase[]>
