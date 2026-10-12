// ─────────────────────────────────────────────────────────────────────────────
// SPACE SETUP: the seeding walk a brand-new Business or Nonprofit Space takes its owner through
// (ADR-1733, amends LIVE-261's landing). PURE and client-safe: no React, no Next, no Supabase.
//
// Owner ruling (2026-10-12): "I set it up and thought I would be taken through the seeding process,
// but it just created it and dumped me in a circle. Double check and make sure that starting a space
// takes people through the seeding wizard process."
//
// Two rules live here and nowhere else:
//   • WHICH STEPS, IN WHICH ORDER. The steps are read off the Space manifest's own sections
//     (lib/studio/entities/space.ts): story, identity, contact + links, offerings, then the one
//     step the manifest cannot declare, "First things" (the Circle and Event doors). A section the
//     manifest stops declaring drops its step; a step is never invented beside the manifest.
//   • WHERE A NEW SPACE LANDS. A console type (business / nonprofit, `isConsoleSpaceType`) lands on
//     /spaces/<slug>/setup; every other type keeps LIVE-261's landing, the Circles manager. The
//     setup's own finish lands on that same Circles manager, so LIVE-261's end state holds for
//     every Space, it is just reached after the seeding rather than instead of it.
// ─────────────────────────────────────────────────────────────────────────────

import type { EntityManifest, FieldDef } from '@/lib/studio/kernel/manifest'
import { isConsoleSpaceType, normalizeSpaceType } from '@/lib/spaces/types'

export type SpaceSetupStepKey = 'story' | 'identity' | 'contact' | 'offerings' | 'first-things'

export interface SpaceSetupStep {
  key: SpaceSetupStepKey
  /** The step's heading, in the member's words. */
  title: string
  /** One line under the heading. */
  desc: string
  /** The manifest sections this step edits. Empty for the doors step. */
  sections: readonly string[]
}

/** Which manifest sections each step edits, in walking order. The contact step takes two sections
 *  because the details and the links are one card to a member ("how do people reach you"). */
const STEP_SECTIONS: readonly { key: Exclude<SpaceSetupStepKey, 'first-things'>; sections: readonly string[] }[] = [
  { key: 'story', sections: ['story'] },
  { key: 'identity', sections: ['identity'] },
  { key: 'contact', sections: ['contact', 'links'] },
  { key: 'offerings', sections: ['offerings'] },
]

/** The copy each step leads with. The manifest's section titles are review-board labels ("About and
 *  story"); a wizard step asks a question, so the words are the step's own. */
const STEP_COPY: Record<SpaceSetupStepKey, { title: string; desc: string }> = {
  story: { title: 'Tell people what this is', desc: 'A tagline, a short intro, and the longer story. Vera drafts a starting point you edit.' },
  identity: { title: 'Make it look like you', desc: 'Your display name, your logo, and the brand color that paints your buttons.' },
  contact: { title: 'How people reach you', desc: 'Fill these in once and every surface reads from them.' },
  offerings: { title: 'What you offer', desc: 'The services, classes, or sessions people can come to you for. Add the ones you have; you can price and polish them later.' },
  'first-things': { title: 'First things', desc: 'Your Space is set up. Start a Circle or add an Event now, or skip straight to your Circles.' },
}

/** The doors step, the one step that edits no manifest field. */
const FIRST_THINGS: SpaceSetupStep = { key: 'first-things', ...STEP_COPY['first-things'], sections: [] }

/**
 * The steps a Space setup walks, derived from the manifest's sections. A step whose sections the
 * manifest does not declare is dropped (nothing to ask); the doors step is always last. PURE.
 */
export function spaceSetupSteps(manifest: EntityManifest): SpaceSetupStep[] {
  const declared = new Set(manifest.sections.map((s) => s.key))
  const steps: SpaceSetupStep[] = STEP_SECTIONS.filter((s) => s.sections.some((key) => declared.has(key))).map((s) => ({
    key: s.key,
    ...STEP_COPY[s.key],
    sections: s.sections.filter((key) => declared.has(key)),
  }))
  steps.push(FIRST_THINGS)
  return steps
}

/** The manifest fields a step edits: every scalar field in the step's sections that creation did
 *  not already ask (a `spark` field such as the name or the handle is settled before setup opens).
 *  Repeat groups (links, offerings) are read off `manifest.repeats` by section instead. PURE. */
export function spaceSetupFields(manifest: EntityManifest, step: SpaceSetupStep): FieldDef[] {
  return manifest.fields.filter((f) => step.sections.includes(f.section) && f.placement !== 'spark')
}

/** The setup route for a Space. */
export function spaceSetupHref(slug: string): string {
  return `/spaces/${slug}/setup`
}

/** Where the setup finishes: LIVE-261's landing, the Space's Circles manager. */
export function spaceSetupFinishHref(slug: string): string {
  return `/spaces/${slug}/manage/circles`
}

/**
 * Where `createSpace` sends a brand-new owner. A console type (business / nonprofit) walks the
 * setup first; any other type lands straight on hosting, exactly as LIVE-261 chose. PURE.
 */
export function postCreateLanding(type: string, slug: string): string {
  return isConsoleSpaceType(normalizeSpaceType(type)) ? spaceSetupHref(slug) : spaceSetupFinishHref(slug)
}
