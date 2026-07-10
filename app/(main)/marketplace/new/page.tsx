import { redirect } from 'next/navigation'

// Posting a General listing lives on /market (the Studio listing builder). This alias keeps
// any old /marketplace/new link working. Housing has its own form at /marketplace/housing/new.
export default function NewListingRedirect() {
  redirect('/classifieds')
}
