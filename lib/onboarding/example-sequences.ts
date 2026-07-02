import type { SequenceDef } from './sequence-schema'
import { DEFAULT_ONBOARDING_SEQUENCE } from './default-sequence'

// Example onboarding sequences (code) for the staff sequence PREVIEW (app/onboarding/sequence-preview).
// They demonstrate persona-targeted flow selection DETERMINISTICALLY, without a DB row: a coach
// (persona 'practitioner') gets a guide-focused flow; everyone else gets the default the owner likes.
//
// This is a preview aid, not the production resolver. In production, resolveOnboardingSequence
// (lib/onboarding/resolve-onboarding-sequence.ts) layers PUBLISHED Loom kind='sequence' assets on top
// of DEFAULT_ONBOARDING_SEQUENCE by the same {persona, region, space} targeting; these code examples
// show how a targeted flow reads and how the runner renders one, so multiple flows can be verified
// before any live cutover. Copy is in voice (CONTENT-VOICE §10: plain, no em dashes).

/** A guide-focused flow for practitioners (coaches): the default four steps, retitled to speak to
 *  someone who will offer practices, and targeted at the 'practitioner' persona. */
export const PRACTITIONER_SEQUENCE: SequenceDef = {
  key: 'onboarding-practitioner',
  label: 'Practitioner welcome (coach)',
  eyebrow: 'Welcome, guide',
  target: { personas: ['practitioner'] },
  steps: [
    {
      id: 'identity',
      type: 'identity',
      label: 'You',
      content: {
        title: 'Set up your guide profile',
        description: 'How should seekers find you?',
      },
    },
    {
      id: 'profile',
      type: 'profile',
      label: 'Your craft',
      content: {
        title: 'Add a face and what you teach',
        description: 'A photo and a line about your practice help people trust you.',
      },
    },
    {
      id: 'region',
      type: 'region',
      label: 'Where you practice',
      content: {
        title: 'Where do you guide?',
        description: 'We will connect you to seekers near you.',
      },
    },
    {
      id: 'review',
      type: 'review',
      label: 'Review',
      content: {
        title: 'Ready to guide?',
        description: 'A last look before you open your doors.',
        submitLabel: 'Start guiding',
        submitBusyLabel: 'Setting up your space',
      },
      action: 'completeOnboarding',
    },
  ],
}

/** The code catalog the preview picks from (the default lives in default-sequence.ts). */
export const EXAMPLE_SEQUENCES: readonly SequenceDef[] = [PRACTITIONER_SEQUENCE]

/** Pure persona picker mirroring resolveOnboardingSequence's persona targeting (a named-persona
 *  match beats the wildcard default), but over the code catalog only. Fails safe to the default. */
export function previewSequenceFor(persona: string | null | undefined): SequenceDef {
  if (persona) {
    const match = EXAMPLE_SEQUENCES.find((s) => s.target?.personas?.includes(persona))
    if (match) return match
  }
  return DEFAULT_ONBOARDING_SEQUENCE
}
