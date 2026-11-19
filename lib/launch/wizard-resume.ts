// One bounded cursor shared by the builder and the owner's launch. No authorization or IO here.
import { readWizardResumeMetadata } from './wizard-resume-metadata.ts'
import { isPreviewKit } from '../create-space/preview-site'
import { parseDraft, type BuilderDraft } from '../create-space/builder'
import { nicheModeChoice } from '../create-space/niche-choices'

export interface WizardResume {
  version: 1
  phase: 'builder' | 'launch'
  cursor: number
  theme: string
  accentAt: number
  niche: string | null
  modeHint?: string
  goals: string[]
  timedEntry: boolean
  draft: BuilderDraft | null
  leadToken: string | null
}

/** The owner/client boundary retains the existing preview catalog and full builder sanitization. */
export function parseWizardResume(raw: unknown): WizardResume | null {
  const metadata = readWizardResumeMetadata(raw)
  if (!metadata || !isPreviewKit(metadata.theme)) return null
  const value = raw as Record<string, unknown>
  const draft = value.draft == null ? null : parseDraft(JSON.stringify(value.draft), null)
  if (value.draft != null && !draft) return null
  if (draft && draft.kit !== metadata.theme) return null
  const { modeHint: rawMode, ...wire } = metadata
  const mode = nicheModeChoice(rawMode)?.id
  const draftMode = nicheModeChoice(draft?.modeHint)?.id
  if (mode && draftMode && mode !== draftMode) return null
  const validatedMode = draftMode ?? mode
  return {
    ...wire,
    ...(draftMode && draft ? { niche: draft.niche, goals: draft.goals } : {}),
    ...(validatedMode ? { modeHint: validatedMode } : {}),
    draft,
  }
}

export function showWizardClock(resume: WizardResume | null | undefined, activeMs: number): boolean {
  return resume?.timedEntry === true && Number.isFinite(activeMs) && activeMs >= 0 && activeMs < 12 * 60_000
}

/** The caller supplies only a slug obtained from its own owner-scoped Space read. An owner whose Spotlight is not
 *  live yet lands on its setup; one whose Spotlight is already live has nothing to set up there, so they land on
 *  their Space's own home instead (LIVE-2392). */
export function ownerEntryHref(ownedSlug: string | null, explicitlyNew: boolean, spotlightLive = false): string | null {
  if (explicitlyNew || !ownedSlug || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(ownedSlug)) return null
  return spotlightLive ? `/spaces/${ownedSlug}/manage` : `/spaces/${ownedSlug}/manage/spotlight`
}
