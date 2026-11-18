// /courses/<slug>: the ONE home of a Creator Lab course (owner 2026-11-18). Public and indexable. The body is
// the standard course page (components/frequency/site/pages/courses/course.tsx); a course with a hand-built
// sales page (lib/courses/tracks.ts) redirects there instead, so it never has two homes.
//
// The course's public Journey page (/discover/journeys/<slug>) stays for shares and QR codes and names this
// page as its canonical. Schema here: Course (one per course, the node Google's Course list and Course info
// results read) and the breadcrumb; FAQPage comes from the body's questions.
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { listCourses } from '@/lib/courses/library'
import { coursePageSchema, loadCoursePage } from '@/lib/courses/course-page'
import { LIBRARY_NAME, salesPageFor } from '@/lib/courses/tracks'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { FrequencyCourse } from '@/components/frequency/site/pages/courses/course'

export const revalidate = 3600

export async function generateStaticParams() {
  const courses = await listCourses().catch(() => [])
  return courses.filter((c) => !salesPageFor(c.slug)).map((c) => ({ slug: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = await loadCoursePage(slug)
  if (!page) return { title: 'Course not found' }
  const { view } = page
  const full = view.summary ?? `${view.title}, a free course in ${LIBRARY_NAME} from ${SITE_NAME}.`
  const description = full.length > 155 ? `${full.slice(0, 152).trimEnd()}…` : full
  const title = `${view.title} · ${LIBRARY_NAME}`
  return {
    title,
    description,
    alternates: { canonical: view.path },
    openGraph: {
      ...OG_SITE,
      title: `${title} · ${SITE_NAME}`,
      description,
      url: view.path,
      type: 'website',
      ...(view.image ? { images: [{ url: view.image }] } : {}),
    },
    twitter: { card: 'summary_large_image', title: `${title} · ${SITE_NAME}`, description },
  }
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sales = salesPageFor(slug)
  if (sales) permanentRedirect(sales)
  const page = await loadCoursePage(slug)
  if (!page) notFound()
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: LIBRARY_NAME, path: '/courses' },
            { name: page.view.title, path: page.view.path },
          ]),
          coursePageSchema(page),
        ]}
      />
      <FrequencyCourse v={page.view} />
    </>
  )
}
