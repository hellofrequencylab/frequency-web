// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the RESEARCH pipeline orchestrator (P1 + P2,
// docs/BUSINESS-IMPORTER.md §6). Runs one intake through harvest -> extract -> verify ->
// reframe and writes the raw sources, the extracted+verified+voiced draft, the ledger, the
// running budget, and the status transitions back to the business_intake row. This is the
// body of the durable background job (./queue.ts) the process-queue cron drains.
//
// STATUS MACHINE (docs §3.5): intake -> researching (on start) -> review (on success) with
// failed as the recoverable side-state. REFRAME (P2) runs over the VERIFIED subset only (docs
// §4.4) and tags its output kind:'generated' so the prose gate still governs it; Compose (the
// map + materializer) and Apply (P0 materializer) consume the result. This phase stops at 'review'.
//
// FAIL-SAFE (docs §7): every stage degrades. A harvest that finds nothing, an extract that
// returns null (AI off / over budget), a verify that cannot reach a model — each lands the
// intake in 'review' (or 'failed' on a hard error) with a FLAGGED partial draft, never a
// crash and never a fabricated fact. The per-import USD cap (§9e) bounds total spend.
// ─────────────────────────────────────────────────────────────────────────────

import type { BusinessProfile, ProvenanceLedger } from './schema'
import { harvest, type HarvestDeps, type HarvestResult } from './harvest'
import { extractProfile, type ExtractRunResult } from './extract'
import { verify, type VerifyResult } from './verify'
import { reframe, type ReframeRunResult } from './reframe/run'
import { applyReframe } from './reframe/apply'
import * as store from './store'
import type { BusinessIntakeRow } from './intake'

/** The hard per-import USD cap (docs §9e). Configurable via env; defaults to ~$1.50. The pipeline
 *  fails the import to 'review' with partial results rather than spending past it. */
export function importCapUsd(): number {
  const raw = Number(process.env.BUSINESS_IMPORT_CAP_USD)
  return Number.isFinite(raw) && raw > 0 ? raw : 1.5
}

/** Injectable stage deps so the whole pipeline is testable without a network / model / DB. */
export interface PipelineDeps {
  harvest?: typeof harvest
  extractProfile?: typeof extractProfile
  verify?: typeof verify
  reframe?: typeof reframe
  harvestDeps?: HarvestDeps
}

/** The outcome of a research run, for the job log + the review board. */
export interface ResearchOutcome {
  ok: boolean
  status: BusinessIntakeRow['status']
  /** A short, human reason (for the job log). */
  note: string
  budgetSpent: number
  harvest?: HarvestResult['summary']
  verify?: { fieldsVerified: number; blocked: string[]; withheld: boolean }
  /** Whether reframe ran + whether its copy passed the §10 voice check (else it is flagged amber). */
  reframe?: { ran: boolean; voiceOk: boolean }
}

/**
 * The field paths an operator already edited in review, so a re-reframe leaves them alone (edit-wins,
 * docs §5). P2 reads this off a `preferences.editedFields`-style marker on the intake draft when a
 * prior run wrote one; the full persistence of the marker is the P5 seam. Reads defensively: only a
 * string[] under the draft's `_editedProse` key counts, else nothing is preserved. PURE.
 *
 * The WRITE side lives in the review board: `updateImportField` (app/(main)/admin/business-seeder/
 * actions.ts) stamps each committed prose path onto `draft._editedProse`, so a re-research carries the
 * operator's copy forward instead of overwriting it with fresh AI prose. This reader is the consumer.
 */
export function editedProsePaths(draft: Record<string, unknown> | undefined): ReadonlySet<string> {
  const raw = draft?._editedProse
  if (!Array.isArray(raw)) return new Set()
  return new Set(raw.filter((v): v is string => typeof v === 'string'))
}

/** The WRITE twin of `editedProsePaths`: the next `_editedProse` marker after one operator field action
 *  in the review board. A commit (edit / confirm) ADDS the path (the operator vouched for this value);
 *  a drop REMOVES it (they cleared it, so a re-research may regenerate). Sanitizes the prior value, is
 *  order-stable, and de-dupes. PURE — the caller passes only an EDITABLE_PROSE_FIELDS path. */
export function nextEditedProse(
  current: unknown,
  path: string,
  kind: 'edit' | 'confirm' | 'drop',
): string[] {
  const set = new Set(
    Array.isArray(current) ? current.filter((v): v is string => typeof v === 'string') : [],
  )
  if (kind === 'drop') set.delete(path)
  else set.add(path)
  return Array.from(set)
}

/** The top-level prose fields the edit-wins carry-forward covers (offering blurbs stay on the
 *  verified draft already, so only the identity-level prose needs carrying). Exported so the review
 *  board marks the SAME set it will later preserve — one source, no drift. */
export const EDITABLE_PROSE_FIELDS = ['tagline', 'about', 'story'] as const

/** Carry each PRESERVED prose value from the persisted under-review draft (`prior`) onto the fresh
 *  verified draft (`onto`), so a re-reframe keeps the operator's edit instead of the freshly verified
 *  value. Mutates `onto` in place (it is already a run-local object). Only known prose fields are
 *  carried, and only when the prior value is a non-empty string. */
function carryEditedProse(
  onto: BusinessProfile,
  prior: Record<string, unknown> | undefined,
  preserve: ReadonlySet<string>,
): void {
  if (!prior) return
  for (const field of EDITABLE_PROSE_FIELDS) {
    if (!preserve.has(field)) continue
    const value = prior[field]
    if (typeof value === 'string' && value.trim()) {
      ;(onto as unknown as Record<string, string>)[field] = value
    }
  }
}

/**
 * Run the research pipeline for one persisted intake id. Reads the row, walks harvest ->
 * extract -> verify, persists each stage, and lands the row in 'review' (success/partial) or
 * 'failed' (hard error). Idempotent-friendly: it reuses the row's cached raw_sources when present
 * (a re-run costs no new crawl) unless `forceRefetch` is set. Never throws.
 */
export async function runResearch(
  intakeId: string,
  opts: { forceRefetch?: boolean; deps?: PipelineDeps } = {},
): Promise<ResearchOutcome> {
  const deps = opts.deps ?? {}
  const doHarvest = deps.harvest ?? harvest
  const doExtract = deps.extractProfile ?? extractProfile
  const doVerify = deps.verify ?? verify
  const doReframe = deps.reframe ?? reframe

  const row = await store.getIntake(intakeId)
  if (!row) return { ok: false, status: 'failed', note: 'intake not found', budgetSpent: 0 }

  // Move to researching (guarded; a no-op if already there). If the row is already applied,
  // do not re-run.
  if (row.status === 'applied') {
    return { ok: false, status: 'applied', note: 'already applied', budgetSpent: row.budgetSpent }
  }
  await store.setStatus(intakeId, 'researching', { error: null })

  const cap = importCapUsd()
  let budgetSpent = row.budgetSpent

  try {
    // ── Stage 2: Harvest (reuse cache unless forced) ──────────────────────────────────
    let harvestResult: HarvestResult | null = null
    let rawSources = row.rawSources
    if (opts.forceRefetch || rawSources.length === 0) {
      harvestResult = await doHarvest(intakeId, row.inputs, deps.harvestDeps)
      rawSources = harvestResult.sources
      await store.saveRawSources(intakeId, rawSources)
    }

    // ── Stage 3: Extract (sonnet). Fail-safe: a null result degrades to a name-only draft. ──
    const remaining = Math.max(0, cap - budgetSpent)
    let draft: BusinessProfile
    let ledger: ProvenanceLedger
    let extractRan = false
    const extracted: ExtractRunResult =
      remaining > 0 ? await doExtract({ sources: rawSources, hints: row.inputs.hints, profileId: row.createdBy }) : null
    if (extracted) {
      draft = extracted.draft
      ledger = extracted.ledger
      budgetSpent += extracted.costUsd
      extractRan = true
    } else {
      // Degrade: a name-only flagged draft from the operator hint (never fabricate the rest).
      draft = degradedDraft(row)
      ledger = {}
    }

    // ── Stage 4: Verify (opus adversarial refuter over commercial facts). ──────────────
    let verifyResult: VerifyResult | null = null
    const verifyBudget = Math.max(0, cap - budgetSpent)
    if (extractRan && verifyBudget > 0) {
      verifyResult = await doVerify({
        draft,
        ledger,
        sources: rawSources,
        profileId: row.createdBy,
        maxSpendUsd: verifyBudget,
      })
      budgetSpent += verifyResult.costUsd
    }

    // The persisted draft is the VERIFIED subset when verify ran, else the raw extract with an
    // untouched ledger (every commercial fact then remains unverified -> withheld at apply).
    let finalDraft = verifyResult?.verifiedDraft ?? draft
    let finalLedger = verifyResult?.ledger ?? ledger

    // ── Stage 5: Reframe (sonnet + voice primer). Grounds ONLY on the VERIFIED subset (finalDraft),
    // never the raw harvest, so it cannot launder an unverified commercial fact into prose (docs
    // §4.4). Its output is folded back tagged kind:'generated', keeping it under the prose gate. ──
    let reframeResult: ReframeRunResult | null = null
    const reframeBudget = Math.max(0, cap - budgetSpent)
    if (extractRan && reframeBudget > 0) {
      // Steer the reframe TONE by the intake's seed MOOD (Importer v2). Absent ⇒ the default warm tone.
      reframeResult = await doReframe({ verified: finalDraft, profileId: row.createdBy, mood: row.inputs.mood })
      if (reframeResult) {
        budgetSpent += reframeResult.costUsd
        // Edit-wins (docs §5): never clobber a prose field an operator already edited in review.
        // Carry each edited prose value from the persisted (under-review) draft onto the fresh
        // verified draft, then pass its paths as `preserve` so applyReframe leaves them alone.
        const preserve = editedProsePaths(row.draft)
        carryEditedProse(finalDraft, row.draft, preserve)
        const folded = applyReframe(finalDraft, reframeResult.copy, finalLedger, preserve)
        finalDraft = folded.draft
        finalLedger = folded.ledger
      }
    }

    // Fold captured media into the FINAL draft (harvest already uploaded it to site-media). Media
    // is never a commercial fact, so it is not gated by verify; folding here keeps it regardless.
    if (harvestResult?.media) {
      finalDraft.media = {
        ...finalDraft.media,
        ...(harvestResult.media.logoUrl ? { logoPath: harvestResult.media.logoUrl } : {}),
        ...(harvestResult.media.heroUrl ? { heroPath: harvestResult.media.heroUrl } : {}),
        ...(harvestResult.media.gallery?.length ? { gallery: harvestResult.media.gallery } : {}),
      }
    }

    await store.saveDraft(intakeId, { draft: finalDraft, ledger: finalLedger, budgetSpent })

    // Land in review (partial results are fine; the operator resolves flags there).
    await store.setStatus(intakeId, 'review', { error: null })

    const withheld = verifyResult ? verifyResult.commercialPolicy === 'withhold' : true
    const reframedNote = reframeResult
      ? reframeResult.voice.ok
        ? '; voiced'
        : '; voiced (flagged for a voice edit)'
      : ''
    return {
      ok: true,
      status: 'review',
      note: extractRan
        ? verifyResult
          ? `researched; ${verifyResult.fieldsVerified} commercial field(s) checked${reframedNote}`
          : 'extracted (verify skipped: budget/AI)'
        : 'degraded to a flagged draft (extract unavailable)',
      budgetSpent,
      harvest: harvestResult?.summary,
      verify: verifyResult
        ? { fieldsVerified: verifyResult.fieldsVerified, blocked: verifyResult.blocked, withheld }
        : undefined,
      reframe: reframeResult ? { ran: true, voiceOk: reframeResult.voice.ok } : undefined,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await store.setStatus(intakeId, 'failed', { error: msg })
    return { ok: false, status: 'failed', note: msg, budgetSpent }
  }
}

/** A minimal, HONEST draft when extraction is unavailable: the operator's name hint (or a
 *  placeholder), nothing fabricated. Every commercial fact is absent, so nothing publishes. PURE. */
function degradedDraft(row: BusinessIntakeRow): BusinessProfile {
  const name = (row.inputs.hints?.name ?? '').trim() || 'Untitled business'
  const type = row.inputs.hints?.type === 'nonprofit' ? 'nonprofit' : 'business'
  const draft: BusinessProfile = { name, type }
  if (row.inputs.hints?.category?.trim()) draft.category = row.inputs.hints.category.trim()
  return draft
}
