// Owner-declared Space context, never a permission or inferred member profile.
export const COACH_PROFILE_FIELDS = [
  { key: 'goals', label: 'What would you like to improve?', hint: 'For example, helping first-time guests return.', max: 800 },
  { key: 'audience', label: 'Who do you serve?', hint: 'Describe your audience, experience levels, languages and access needs. Only include information people have chosen to share.', max: 1200 },
  { key: 'voice', label: 'How do you sound?', hint: 'Describe your writing style and words you use or avoid.', max: 800 },
  { key: 'examples', label: 'Your own writing', hint: 'Add a few examples you wrote. Leave out private messages and personal information.', max: 2400 },
  { key: 'facts', label: 'What should Vera check?', hint: 'List facts, constraints or promises to check against your current Space information.', max: 1200 },
] as const
type CoachProfileField = typeof COACH_PROFILE_FIELDS[number]['key']
export type SpaceCoachProfile = Record<CoachProfileField, string> & { version: 1 }
export function emptySpaceCoachProfile(): SpaceCoachProfile {
  return { version: 1, goals: '', audience: '', voice: '', examples: '', facts: '' }
}
export function parseSpaceCoachProfile(value: unknown): SpaceCoachProfile {
  const out = emptySpaceCoachProfile()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  const raw = value as Record<string, unknown>
  for (const field of COACH_PROFILE_FIELDS) {
    if (typeof raw[field.key] === 'string') out[field.key] = (raw[field.key] as string).replace(/\u0000/g, '').trim().slice(0, field.max)
  }
  return out
}
export function validateSpaceCoachProfile(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Enter your coach preferences before saving.'
  const raw = value as Record<string, unknown>
  for (const field of COACH_PROFILE_FIELDS) {
    if (typeof raw[field.key] !== 'string' || (raw[field.key] as string).length > field.max) return `${field.label} must be text under ${field.max + 1} characters.`
  }
  return null
}
