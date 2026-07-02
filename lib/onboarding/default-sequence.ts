import type { SequenceDef } from './sequence-schema'

// The code default onboarding sequence — Layer 2 as CODE (the fail-safe every resolver falls back
// to, like page_settings' coded defaults). It reproduces today's steady-state flow
// (app/onboarding/form.tsx: You / About you / Your region / Review) step-for-step via the
// step-registry, so a future cutover from OnboardingForm to the SequenceRunner is behaviour
// preserving. Copy mirrors form.tsx verbatim (voice canon: no em dashes).
//
// This is ADDITIVE: the live route still renders OnboardingForm. When a published kind='sequence'
// asset resolves for a viewer it wins; absent one, resolveOnboardingSequence returns THIS.

export const DEFAULT_ONBOARDING_SEQUENCE: SequenceDef = {
  key: 'onboarding-default',
  label: 'Every new member (default)',
  eyebrow: 'Welcome home',
  steps: [
    {
      id: 'identity',
      type: 'identity',
      label: 'You',
      content: {
        title: 'Let’s set you up',
        description: 'How should the community know you?',
      },
    },
    {
      id: 'profile',
      type: 'profile',
      label: 'About you',
      content: {
        title: 'Add a face and a few words',
        description: 'Optional, but it helps people connect.',
      },
    },
    {
      id: 'region',
      type: 'region',
      label: 'Your region',
      content: {
        title: 'Where are you?',
        description: 'We’ll connect you to the community nearest you.',
      },
    },
    {
      id: 'review',
      type: 'review',
      label: 'Review',
      content: {
        title: 'Ready to join?',
        description: 'A quick look before you step in.',
        submitLabel: 'Join Frequency',
        submitBusyLabel: 'Joining…',
      },
      action: 'completeOnboarding',
    },
  ],
}
