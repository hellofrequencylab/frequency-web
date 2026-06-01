// The conversational onboarding script. A funnel disguised as a conversation:
// an emotional arc about belonging interleaved with the profile-setup inputs.
// Front-end prototype — `field` names mirror the eventual profile columns so the
// persistence layer (Supabase email OTP + profiles + topical_channel_memberships)
// drops in later without reshaping this.

import type { LucideIcon } from 'lucide-react'
import {
  Sparkles, Activity, HeartPulse, MessagesSquare, Megaphone, Palette, Compass,
} from 'lucide-react'

export type Choice = { value: string; label: string }
export type InterestOption = { value: string; label: string; icon: LucideIcon }

// Each input step nudges the reveal outward by one layer; `say` steps are pure
// narration (tap to continue) and do not advance the reveal.
export type Step =
  | { kind: 'say'; id: string; lines: string[] }
  | { kind: 'choice'; id: string; field: string; prompt: string; choices: Choice[] }
  | { kind: 'text'; id: string; field: string; prompt: string; placeholder: string; maxLength?: number }
  | { kind: 'longtext'; id: string; field: string; prompt: string; placeholder: string; optional?: boolean; maxLength?: number }
  | { kind: 'handle'; id: string; field: string; prompt: string }
  | { kind: 'avatar'; id: string; field: string; prompt: string }
  | { kind: 'interests'; id: string; field: string; prompt: string; options: InterestOption[]; min?: number }
  | { kind: 'email'; id: string; field: string; prompt: string }
  | { kind: 'otp'; id: string; field: string; prompt: string }
  | { kind: 'reveal'; id: string; headline: string; sub: string }

export const INTERESTS: InterestOption[] = [
  { value: 'movement', label: 'Movement', icon: Activity },
  { value: 'spirituality', label: 'Spirituality', icon: Sparkles },
  { value: 'holistic-health', label: 'Holistic health', icon: HeartPulse },
  { value: 'human-relating', label: 'Human relating', icon: MessagesSquare },
  { value: 'activism', label: 'Activism', icon: Megaphone },
  { value: 'creative', label: 'Creative', icon: Palette },
  { value: 'adventure', label: 'Adventure', icon: Compass },
]

export const STEPS: Step[] = [
  { kind: 'say', id: 'hello', lines: ['Can I ask you something honest?'] },
  {
    kind: 'choice', id: 'belonging', field: 'feltPartOf',
    prompt: 'When did you last feel truly part of something?',
    choices: [
      { value: 'this-week', label: 'This week' },
      { value: 'a-while', label: 'It’s been a while' },
      { value: 'cant-remember', label: 'Honestly, I can’t remember' },
      { value: 'still-looking', label: 'I’m still looking for it' },
    ],
  },
  { kind: 'say', id: 'reassure', lines: ['Yeah. A lot of us are.', 'That’s the whole reason this place exists.'] },
  {
    kind: 'choice', id: 'seeking', field: 'seeking',
    prompt: 'What are you really after?',
    choices: [
      { value: 'belonging', label: 'A place to belong' },
      { value: 'friends', label: 'Real friendships' },
      { value: 'understood', label: 'People who get me' },
      { value: 'do-things', label: 'Things to do with others' },
    ],
  },
  { kind: 'say', id: 'lets-go', lines: ['Good. Let’s make this yours.', 'First — what should we call you?'] },
  { kind: 'text', id: 'name', field: 'displayName', prompt: 'Your name', placeholder: 'e.g. Daniel', maxLength: 40 },
  { kind: 'handle', id: 'handle', field: 'handle', prompt: 'Claim your handle' },
  { kind: 'say', id: 'nice', lines: ['Nice to meet you, {displayName}.'] },
  { kind: 'longtext', id: 'bio', field: 'bio', prompt: 'One line about you', placeholder: 'What should people know?', optional: true, maxLength: 140 },
  { kind: 'avatar', id: 'avatar', field: 'avatar', prompt: 'Put a face to the name?' },
  {
    kind: 'interests', id: 'interests', field: 'interests',
    prompt: 'What lights you up?', options: INTERESTS, min: 1,
  },
  { kind: 'say', id: 'almost', lines: ['Almost home.', 'Where should we send your key?'] },
  { kind: 'email', id: 'email', field: 'email', prompt: 'Your email' },
  { kind: 'otp', id: 'otp', field: 'otp', prompt: 'Enter the 6-digit code we just sent' },
  { kind: 'reveal', id: 'done', headline: 'You’re in.', sub: 'Welcome home, {displayName}.' },
]

// How many steps move the reveal outward (everything except pure narration).
export const REVEAL_STEPS = STEPS.filter((s) => s.kind !== 'say' && s.kind !== 'reveal').length

// Fill {field} placeholders from collected answers.
export function fillTemplate(text: string, answers: Record<string, unknown>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    const v = answers[key]
    return typeof v === 'string' && v.trim() ? v.trim() : 'friend'
  })
}
