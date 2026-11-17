'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { revokeOrderLineUnits } from '@/lib/hunts/merch-hooks'
import { setHuntSales } from '@/lib/hunts/pass-gate'

/** The Hunt sales kill switch (FH-036S). Staff only, dark with the rest of Hunt commerce, audited in SQL. */
export async function setHuntSalesAction(formData: FormData): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  const admin = await requireAdmin('admin')
  const open = formData.get('open') === '1'
  const reason = String(formData.get('reason') ?? '')
  const out = await setHuntSales(open, admin.profileId, reason)
  if (!out.ok) throw new Error(out.error)
  revalidatePath('/hunts/finance')
}

/**
 * Record the units of one store order line a partial refund covered (FH-038S). Staff only and dark with the
 * rest of Hunt commerce. Only those units lose their Hunt benefit; the refund itself is the store's.
 */
export async function revokeOrderUnitsAction(formData: FormData): Promise<void> {
  if (!huntSwitchOn('commerce')) return
  await requireAdmin('admin')
  const out = await revokeOrderLineUnits({
    orderId: String(formData.get('orderId') ?? '').trim(),
    lineId: String(formData.get('lineId') ?? '').trim(),
    count: Number(formData.get('count') ?? 0),
    ref: String(formData.get('ref') ?? ''),
  })
  if (!out.ok) throw new Error(out.error)
  revalidatePath('/hunts/finance')
}
