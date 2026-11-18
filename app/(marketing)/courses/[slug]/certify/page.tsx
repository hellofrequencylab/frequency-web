// /courses/<slug>/certify: send in a Community Book for Certified review (owner 2026-11-17). Signed-in
// members only; a visitor gets the sign-in door back to this page. Shows the holder's own submissions and
// credentials for the course, then the form. Not indexed.
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getPublicJourney } from '@/lib/journey-plans'
import { isFrequencyCourse } from '@/lib/courses/library'
import { courseHref, offersCertified } from '@/lib/courses/tracks'
import { listCredentialsFor, mySubmissions } from '@/lib/courses/credentials'
import { FrequencyCertify } from '@/components/frequency/site/pages/courses/certify'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Send in your Community Book', robots: { index: false } }

export default async function CertifyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!offersCertified(slug)) notFound()
  const found = await getPublicJourney(slug)
  if (!found || !(await isFrequencyCourse(found.plan))) notFound()
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=${encodeURIComponent(`/courses/${slug}/certify`)}`)
  const [subs, creds] = await Promise.all([mySubmissions(found.plan.id, profileId), listCredentialsFor(profileId)])
  return (
    <FrequencyCertify
      slug={slug}
      title={found.plan.title}
      coursePath={courseHref(slug)}
      submissions={subs}
      credentials={creds.filter((c) => c.planId === found.plan.id)}
    />
  )
}
