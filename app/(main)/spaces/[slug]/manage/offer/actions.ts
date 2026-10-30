'use server'

import { redirect } from 'next/navigation'
import { getCallerProfile } from '@/lib/auth'
import { isError } from '@/lib/action-result'
import { OFFER_PAGE_SLUG } from '@/lib/launch/offer-page'
import { startOfferPage } from '../layout/actions'

/** The "Make my offer page" button (LIVE-1938). Needs a signed-in caller; startOfferPage re-gates owner/admin/editor itself.
 *  On success it opens the new page in the editor; otherwise it lands back on the starter. */
export async function startOfferPageAction(slug: string): Promise<void> {
  if (!(await getCallerProfile())) redirect('/sign-in')
  const made = await startOfferPage(slug)
  redirect(!isError(made) ? `/spaces/${slug}/edit-page?page=${OFFER_PAGE_SLUG}` : `/spaces/${slug}/manage/offer?e=1`)
}
