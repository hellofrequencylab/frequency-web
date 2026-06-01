// The conversational onboarding script. A funnel disguised as a conversation:
// an emotional arc about belonging interleaved with the profile-setup inputs.
// Front-end prototype — `field` names mirror the eventual profile columns so the
// persistence layer (Supabase email OTP + profiles + topical_channel_memberships)
// drops in later without reshaping this.
//
// Every beat is a STATEMENT (optional lead-in) followed by a QUESTION the visitor
// answers. The act of answering is the only confirmation — there are no filler
// "Continue" taps between beats.

import type { LucideIcon } from 'lucide-react'
import {
  Sparkles, Activity, HeartPulse, MessagesSquare, Megaphone, Palette, Compass,
} from 'lucide-react'

export type Choice = { value: string; label: string }
export type InterestOption = { value: string; label: string; icon: LucideIcon }

// `statement` lines type out first (quiet), then `prompt` (the question), then the
// control. Answering advances and widens the reveal. `reveal` is the final beat.
export type Step =
  | { kind: 'choice'; id: string; field: string; statement?: string[]; prompt: string; choices: Choice[] }
  | { kind: 'text'; id: string; field: string; statement?: string[]; prompt: string; placeholder: string; maxLength?: number }
  | { kind: 'longtext'; id: string; field: string; statement?: string[]; prompt: string; placeholder: string; optional?: boolean; maxLength?: number }
  | { kind: 'handle'; id: string; field: string; statement?: string[]; prompt: string }
  | { kind: 'avatar'; id: string; field: string; statement?: string[]; prompt: string }
  | { kind: 'interests'; id: string; field: string; statement?: string[]; prompt: string; options: InterestOption[]; min?: number }
  | { kind: 'email'; id: string; field: string; statement?: string[]; prompt: string }
  | { kind: 'otp'; id: string; field: string; statement?: string[]; prompt: string }
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
  {
    kind: 'choice', id: 'belonging', field: 'feltPartOf',
    statement: ['Can I ask you something honest?'],
    prompt: 'When did you last feel truly part of something?',
    choices: [
      { value: 'this-week', label: 'This week' },
      { value: 'a-while', label: 'It’s been a while' },
      { value: 'cant-remember', label: 'Honestly, I can’t remember' },
      { value: 'still-looking', label: 'I’m still looking for it' },
    ],
  },
  {
    kind: 'choice', id: 'seeking', field: 'seeking',
    statement: ['Yeah. A lot of us are.', 'That’s the whole reason this place exists.'],
    prompt: 'So what are you really after?',
    choices: [
      { value: 'belonging', label: 'A place to belong' },
      { value: 'friends', label: 'Real friendships' },
      { value: 'understood', label: 'People who get me' },
      { value: 'do-things', label: 'Things to do with others' },
    ],
  },
  {
    kind: 'text', id: 'name', field: 'displayName',
    statement: ['Good. Let’s make this yours.'],
    prompt: 'What should we call you?', placeholder: 'e.g. Daniel', maxLength: 40,
  },
  {
    kind: 'handle', id: 'handle', field: 'handle',
    statement: ['Nice to meet you, {displayName}.'],
    prompt: 'What’s your handle?',
  },
  {
    kind: 'longtext', id: 'bio', field: 'bio',
    prompt: 'What’s one true thing about you?',
    placeholder: 'Say it however you want.', optional: true, maxLength: 140,
  },
  {
    kind: 'avatar', id: 'avatar', field: 'avatar',
    prompt: 'Want to put a face to the name?',
  },
  {
    kind: 'interests', id: 'interests', field: 'interests',
    statement: ['This is how we find your people.'],
    prompt: 'What lights you up?', options: INTERESTS, min: 1,
  },
  {
    kind: 'email', id: 'email', field: 'email',
    statement: ['Almost home.'],
    prompt: 'Where should we send your key?',
  },
  {
    kind: 'otp', id: 'otp', field: 'otp',
    prompt: 'What’s the 6-digit code we just sent you?',
  },
  { kind: 'reveal', id: 'done', headline: 'You’re in.', sub: 'Welcome home, {displayName}.' },
]

// Every beat except the final reveal advances the reveal outward.
export const REVEAL_STEPS = STEPS.filter((s) => s.kind !== 'reveal').length

// Fill {field} placeholders from collected answers.
export function fillTemplate(text: string, answers: Record<string, unknown>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => {
    const v = answers[key]
    return typeof v === 'string' && v.trim() ? v.trim() : 'friend'
  })
}
