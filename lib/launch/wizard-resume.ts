// One bounded cursor shared by the builder and the owner's launch. No authorization or IO here.
import { readWizardResumeMetadata } from './wizard-resume-metadata.ts'
import { isPreviewKit } from '../create-space/preview-site'
import { parseDraft, type BuilderDraft } from '../create-space/builder'

export interface WizardResume {
  version: 1
  phase: 'builder' | 'launch'
  cursor: number
  theme: string
  accentAt: number
  niche: string | null
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
  return { ...metadata, draft }
}

export function showWizardClock(resume: WizardResume | null | undefined, activeMs: number): boolean {
  return resume?.timedEntry === true && Number.isFinite(activeMs) && activeMs >= 0 && activeMs < 12 * 60_000
}

/** The caller supplies only a slug obtained from its own owner-scoped Space read. */
export function ownerEntryHref(ownedSlug: string | null, explicitlyNew: boolean): string | null {
  return !explicitlyNew && ownedSlug && /^[a-z0-9][a-z0-9-]{0,79}$/.test(ownedSlug)
    ? `/spaces/${ownedSlug}/manage/spotlight` : null
}
