// The curated reaction set for feed posts and comments. One source of truth for
// the allowed emojis, shared by the client picker (post-card / post-replies) and
// the server validation in `toggleReaction` — so the UI can never offer, and the
// action can never write, an emoji outside this set.
//
// Kept small and warm on purpose: a member scans six friendly options, not a full
// keyboard. The legacy 'heart' / 'plus_one' keys are intentionally NOT here — they
// were retired in favour of the emoji set (the broadening migration maps the old
// hearts onto '❤️'). The values stored in `post_reactions.reaction_type` are the
// emoji characters themselves.

// Skin-toned emojis carry the MEDIUM tan modifier (🏽, U+1F3FD) so the set reads as
// one consistent tone rather than the default Simpson-yellow.
export const REACTIONS = [
  { key: '❤️', label: 'Love this' },
  { key: '🔥', label: 'Fire' },
  { key: '🙌🏽', label: 'Celebrate' },
  { key: '😂', label: 'Funny' },
  { key: '😮', label: 'Wow' },
  { key: '🙏🏽', label: 'Grateful' },
] as const

export type ReactionKey = (typeof REACTIONS)[number]['key']

/** The bare allowed set, for fast membership checks (client + server validation). */
export const REACTION_KEYS: readonly string[] = REACTIONS.map((r) => r.key)

/** Is `value` one of the allowed reaction emojis? The single guard both the picker
 *  and the server action key off, so the allowed set is defined in exactly one place. */
export function isReactionKey(value: string): value is ReactionKey {
  return (REACTION_KEYS as readonly string[]).includes(value)
}

/** The human label for a reaction emoji (for aria-labels / titles). Falls back to
 *  the emoji itself for any value not in the set (defensive; shouldn't happen). */
export function reactionLabel(key: string): string {
  return REACTIONS.find((r) => r.key === key)?.label ?? key
}
