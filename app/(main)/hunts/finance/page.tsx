import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/admin/guard'
import { huntSwitchOn } from '@/lib/hunts/flags'
import { reconciliationReader } from '@/lib/hunts/finance-store'
import { HuntReconciliationPage } from '@/components/hunts/reconciliation-page'

// HUNT FINANCE (FH-040): the reconciling view. Dark until HUNTS_COMMERCE_ENABLED is on (404 like a page
// that does not exist), then platform staff only. The scope is resolved here from the session and handed
// to the reader, which applies it on every read and returns a redacted projection (a hash, never a raw
// source id). A space-owner scope is a later step; until then only staff see any row.
export const metadata: Metadata = { title: 'Hunt reconciliation', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function HuntFinancePage() {
  if (!huntSwitchOn('commerce')) notFound()
  await requireAdmin('admin')
  return <HuntReconciliationPage scope={{ role: 'platform-admin' }} reader={reconciliationReader} />
}
