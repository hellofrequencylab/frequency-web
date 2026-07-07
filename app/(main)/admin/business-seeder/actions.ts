'use server'

// ─────────────────────────────────────────────────────────────────────────────
// SMART BUSINESS IMPORTER — the operator START action (P1, docs/BUSINESS-IMPORTER.md §5/§8).
// The minimal operator trigger for P1: capture inputs, create the business_intake row, and
// enqueue the durable research job. The full Operator Seeder CONSOLE (input step + review /
// approve board) is P3 (docs §8); this is the thin seam that kicks off research so the P1
// pipeline (harvest -> extract -> verify) can be exercised end to end.
//
// AUTHZ: gated on requireStaffCap('structure', 'write') — seeding a business Space is a
// structure operation. The action establishes the operator (getMyProfileId) and binds the
// created row to them (created_by). It does NOT touch the admin client directly; all writes
// go through the service-role-gated store (lib/importer/store), which binds every write to
// the intake id.
// ─────────────────────────────────────────────────────────────────────────────

import { after } from 'next/server'
import { requireStaffCap } from '@/lib/staff'
import { getMyProfileId } from '@/lib/auth'
import { createIntake } from '@/lib/importer/store'
import { enqueueResearch } from '@/lib/importer/queue'
import { runResearch } from '@/lib/importer/pipeline'
import type { IntakeInputs } from '@/lib/importer/intake'

/** The trimmed inputs an operator submits to start an import. */
export interface StartImportInput {
  websiteUrl?: string
  pastedContent?: string
  nameHint?: string
  categoryHint?: string
  cityHint?: string
  type?: 'business' | 'nonprofit'
  socialHandles?: IntakeInputs['socialHandles']
  /** Run the research inline (behind after()) for a faster operator turnaround, in addition to
   *  enqueuing it durably. Defaults to enqueue-only. */
  runInline?: boolean
}

export type StartImportResult = { ok: true; intakeId: string } | { ok: false; error: string }

/**
 * Start an operator-seeded import: create the intake row (status 'intake') and enqueue the
 * durable research job. Returns the intake id so the operator can watch it land in 'review'.
 * A seeded import is always a DEMO (unlisted/draft, consent.isDemo=true, docs §7): the operator
 * consciously flips it live later.
 */
export async function startBusinessImport(input: StartImportInput): Promise<StartImportResult> {
  await requireStaffCap('structure', 'write')
  const operatorId = await getMyProfileId()
  if (!operatorId) return { ok: false, error: 'No operator profile.' }

  const websiteUrl = (input.websiteUrl ?? '').trim()
  const pastedContent = (input.pastedContent ?? '').trim()
  const nameHint = (input.nameHint ?? '').trim()
  if (!websiteUrl && !pastedContent && !nameHint) {
    return { ok: false, error: 'Give at least a website, a paste, or a name to research.' }
  }

  const inputs: IntakeInputs = {
    consent: { isDemo: true }, // operator seeds are demos by default (docs §7)
  }
  if (websiteUrl) inputs.websiteUrl = websiteUrl
  if (pastedContent) inputs.pastedContent = pastedContent
  if (input.socialHandles) inputs.socialHandles = input.socialHandles
  const hints: NonNullable<IntakeInputs['hints']> = {}
  if (nameHint) hints.name = nameHint
  if ((input.categoryHint ?? '').trim()) hints.category = input.categoryHint!.trim()
  if ((input.cityHint ?? '').trim()) hints.city = input.cityHint!.trim()
  if (input.type === 'nonprofit' || input.type === 'business') hints.type = input.type
  if (Object.keys(hints).length) inputs.hints = hints

  const intakeId = await createIntake({ createdBy: operatorId, mode: 'operator', inputs })
  if (!intakeId) return { ok: false, error: 'Could not create the intake record.' }

  // Durable path: enqueue the research job (the process-queue cron drains it).
  await enqueueResearch(intakeId)

  // Optional faster turnaround: also run inline behind after() so the response returns
  // immediately while research proceeds (the durable job is the safety net if this is dropped).
  if (input.runInline) {
    after(() => runResearch(intakeId))
  }

  return { ok: true, intakeId }
}
