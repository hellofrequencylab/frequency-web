// /credentials/<id>: one credential, checkable by anyone with the link (owner 2026-11-18: the certificate as
// the authority play). Shows the holder's display name, the course, the level and the date, and nothing
// else. Not indexed: it names a person, and it is meant to be shared, not found.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublicCredential, levelLabel } from '@/lib/courses/credentials'
import { courseHref } from '@/lib/courses/tracks'
import { OG_SITE, SITE_NAME, SITE_OG_IMAGE } from '@/lib/site'
import { FrequencyCredential } from '@/components/frequency/site/pages/courses/credential'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const c = await getPublicCredential(id)
  if (!c) return { title: 'Credential not found', robots: { index: false } }
  const title = `${c.holder.name}: ${levelLabel(c.level)}, ${c.course.title}`
  const description = `${levelLabel(c.level)} in ${c.course.title}, a Creator Lab course from ${SITE_NAME}.`
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { ...OG_SITE, title: `${title} · ${SITE_NAME}`, description, url: `/credentials/${c.id}`, type: 'website', images: [{ url: SITE_OG_IMAGE }] },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description },
  }
}

export default async function CredentialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const c = await getPublicCredential(id)
  if (!c) notFound()
  return <FrequencyCredential c={c} coursePath={courseHref(c.course.slug)} />
}
