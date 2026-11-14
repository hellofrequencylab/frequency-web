import { isMegaThemeId } from '../theme/mega-theme.ts'
import type { WizardResume } from './wizard-resume.ts'

const token = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value)

/** Node-safe wire metadata only. Never returns a private draft; owner IO must run the full decoder. */
export function readWizardResumeMetadata(raw: unknown): WizardResume | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  try { if (JSON.stringify(raw).length > 10000) return null } catch { return null }
  const value = raw as Record<string, unknown>
  if (value.version !== 1 || (value.phase !== 'builder' && value.phase !== 'launch')) return null
  if (!Number.isInteger(value.cursor) || Number(value.cursor) < 0 || Number(value.cursor) > 4) return null
  if (!isMegaThemeId(value.theme) || !Number.isInteger(value.accentAt) || Number(value.accentAt) < 0 || Number(value.accentAt) > 11) return null
  return {
    version: 1, phase: value.phase, cursor: Number(value.cursor), theme: value.theme,
    accentAt: Number(value.accentAt), niche: token(value.niche) ? value.niche : null,
    goals: Array.isArray(value.goals) ? [...new Set(value.goals.filter(token))].slice(0, 8) : [],
    timedEntry: value.timedEntry === true, draft: null,
    leadToken: typeof value.leadToken === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value.leadToken) ? value.leadToken : null,
  }
}

