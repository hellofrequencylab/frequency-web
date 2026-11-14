import type { PillarSlug } from '../pillars/slugs'

/** Explicit exploration choices, not an inference from someone's logs or wellbeing. */
export const PRACTICE_SUPPORT_CHOICES: readonly { id: PillarSlug; label: string; area: string }[] = [
  { id: 'mind', label: 'Clear my head', area: 'Mind' },
  { id: 'body', label: 'Care for my body', area: 'Body' },
  { id: 'spirit', label: 'Feel connected', area: 'Spirit' },
  { id: 'expression', label: 'Make or share something', area: 'Expression' },
]

type ExploreInvitation = { kind: 'explore'; message: string; href: string; action: string }
type RestInvitation = { kind: 'rest'; message: string }
export type PracticeInvitationChoice = PillarSlug | 'familiar' | 'rest'
type PracticeInvitationResult = ExploreInvitation | RestInvitation

const INVITATIONS: Readonly<Record<PracticeInvitationChoice, PracticeInvitationResult>> = {
  mind: {
    kind: 'explore',
    message: 'Make a little room for attention, learning, or reflection. Choose a practice that fits your day.',
    href: '/discover/practices/pillar/mind',
    action: 'Explore Mind practices',
  },
  body: {
    kind: 'explore',
    message: 'Explore movement, rest, or physical care in a way that works for you.',
    href: '/discover/practices/pillar/body',
    action: 'Explore Body practices',
  },
  spirit: {
    kind: 'explore',
    message: 'Explore presence, meaning, or connection in your own way.',
    href: '/discover/practices/pillar/spirit',
    action: 'Explore Spirit practices',
  },
  expression: {
    kind: 'explore',
    message: 'Make something, speak, help, or connect. You can keep it private, and you can begin as you are.',
    href: '/discover/practices/pillar/expression',
    action: 'Explore Expression practices',
  },
  familiar: {
    kind: 'explore',
    message: 'You can stay with a practice you already know. Browse at your own pace.',
    href: '/practices',
    action: 'Browse practices',
  },
  rest: {
    kind: 'rest',
    message: 'You can leave room for rest today. There is nothing to log here. Come back when something feels useful.',
  },
}

/** Closed choices produce only existing internal destinations; no personal data is retained. */
export function practiceInvitationFor(raw: unknown): PracticeInvitationResult | null {
  if (typeof raw !== 'string' || !Object.hasOwn(INVITATIONS, raw)) return null
  return { ...INVITATIONS[raw as PracticeInvitationChoice] }
}
