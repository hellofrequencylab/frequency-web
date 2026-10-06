'use server'

// The client-callable seam for per-segment custom contact fields (LIVE-662), the sibling of
// lib/spaces/segments-actions.ts. Authorization and
// validation live in lib/crm/segment-fields.ts; these wrappers re-expose them and revalidate the CRM.

import { revalidatePath } from 'next/cache'
import {
  setSegmentFieldKeys as setSegmentFieldKeysImpl,
  addSpaceCustomField as addSpaceCustomFieldImpl,
  saveContactCustomFields as saveContactCustomFieldsImpl,
} from '@/lib/crm/segment-fields'
import type { ActionResult } from '@/lib/action-result'

function revalidateCrm(slug: string) {
  revalidatePath(`/spaces/${slug}/crm`)
}

export async function setSegmentFieldKeys(
  spaceId: string,
  slug: string,
  segmentId: string,
  keys: string[],
): Promise<ActionResult> {
  const res = await setSegmentFieldKeysImpl(spaceId, segmentId, keys)
  if (!('error' in res)) revalidateCrm(slug)
  return res
}

export async function addSpaceCustomField(
  spaceId: string,
  slug: string,
  label: string,
  valueType: string,
  options?: string[],
): Promise<ActionResult<{ key: string }>> {
  const res = await addSpaceCustomFieldImpl(spaceId, label, valueType, options)
  if (!('error' in res)) revalidateCrm(slug)
  return res
}

export async function saveContactCustomFields(
  spaceId: string,
  slug: string,
  contactId: string,
  values: Record<string, string>,
): Promise<ActionResult> {
  const res = await saveContactCustomFieldsImpl(spaceId, contactId, values)
  if (!('error' in res)) revalidateCrm(slug)
  return res
}
