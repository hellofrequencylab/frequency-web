'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { huntSwitchOn } from '@/lib/hunts/flags'
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
