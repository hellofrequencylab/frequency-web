// /courses/<slug>/week-1: the free piece of a Creator Lab course. The first part of the course, every step
// in full, open to anyone with no account and no email (owner 2026-11-18: each free course is a real slice of
// the paid one). Indexable: it is the best answer to "how do I start" the course teaches. Its canonical is
// itself; it links back up to the course's one home.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { loadCoursePage } from '@/lib/courses/course-page'
import { firstPart } from '@/lib/courses/first-part'
import { LIBRARY_NAME } from '@/lib/courses/tracks'
import { OG_SITE, SITE_NAME, SITE_OG_IMAGE as OG_IMAGE } from '@/lib/site'
import { FrequencyCourseWeek } from '@/components/frequency/site/pages/courses/course-week'

export const revalidate = 3600

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = await loadCoursePage(slug)
  const part = page ? firstPart(page.items) : null
  if (!page || !part) return { title: 'Course not found' }
  const title = `${part.title} · ${page.view.title}`
  const description = `Read ${part.title} of ${page.view.title} free, no account needed. Part of ${LIBRARY_NAME}, Frequency’s free training library.`
  const path = `/courses/${slug}/week-1`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...OG_SITE, title: `${title} · ${SITE_NAME}`, description, url: path, type: 'article', images: [{ url: page.view.image || OG_IMAGE }] },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description },
  }
}

export default async function CourseWeekOnePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await loadCoursePage(slug)
  const part = page ? firstPart(page.items) : null
  if (!page || !part) notFound()
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: LIBRARY_NAME, path: '/courses' },
          { name: page.view.title, path: page.view.path },
          { name: part.title, path: `/courses/${slug}/week-1` },
        ])}
      />
      <FrequencyCourseWeek v={page.view} part={part} />
    </>
  )
}
