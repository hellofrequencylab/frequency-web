import type { SequenceDef, SequenceStep } from './sequence-schema'
import { CONSENT_STEP_TYPE, hasConsentStep } from './step-types'

// The code default onboarding sequence — Layer 2 as CODE (the fail-safe every resolver falls back
// to, like page_settings' coded defaults). It reproduces today's steady-state flow
// (app/onboarding/form.tsx: You / About you / Your region / the email opt-in / Review) step-for-step
// via the step-registry, so a future cutover from OnboardingForm to the SequenceRunner is behaviour
// preserving. Copy mirrors form.tsx verbatim (voice canon: no em dashes).
//
// 2026-09-06 (LIVE-168): the opt-in card form.tsx renders on its review screen is its own step here
// (CONSENT_STEP below). completeOnboarding records an omitted `emailOptIn` as consent WITHHELD, so a
// flow that does not ask marks every member it onboards as declining marketing email.
//
// This is ADDITIVE: the live route still renders OnboardingForm. When a published kind='sequence'
// asset resolves for a viewer it wins; absent one, resolveOnboardingSequence returns THIS.

/** The marketing-email opt-in step (LIVE-168). Every flow that ends in completeOnboarding needs it:
 *  the action records an omitted `emailOptIn` as consent WITHHELD, so a flow that never asks marks
 *  every member it onboards as declining. Content is left to the step type's schema defaults, which
 *  mirror the card in app/onboarding/form.tsx. */
export const CONSENT_STEP: SequenceStep = {
  id: 'consent',
  type: CONSENT_STEP_TYPE,
  label: 'Your inbox',
}

/** Return `steps` with the consent step guaranteed: present flows are returned untouched, and a flow
 *  that does not ask gets it inserted BEFORE the terminal step (the terminal `action` must stay on
 *  the last step). PURE. This is the fail-safe the runner applies to any resolved sequence, config
 *  included, so an operator-authored flow can never silently record consent withheld for everyone. */
export function withConsentStep(steps: readonly SequenceStep[]): SequenceStep[] {
  if (steps.length === 0 || hasConsentStep(steps)) return [...steps]
  return [...steps.slice(0, -1), CONSENT_STEP, steps[steps.length - 1]]
}

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
    CONSENT_STEP,
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
