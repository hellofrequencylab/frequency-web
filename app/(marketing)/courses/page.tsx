// /courses: Creator Lab, Frequency's training library (owner 2026-11-18: one named library, tracks, one page per
// course). Public and indexable. The page loads the courses, sets metadata and schema, and renders the kit body.
//
// SCHEMA. The ItemList names each course by its ONE home (courseHref: /courses/<slug>, or a hand-built sales
// page), each of which carries a Course node. That pair is Google's Course list summary-page pattern, which
// needs at least three courses marked up.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, courseListSchema } from '@/lib/jsonld'
import { listCourses } from '@/lib/courses/library'
import { courseHref, groupByTrack, LIBRARY_NAME } from '@/lib/courses/tracks'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { FrequencyCourses } from '@/components/frequency/site/pages/courses/courses'

export const revalidate = 3600

const PATH = '/courses'
const TITLE = `${LIBRARY_NAME}: free training for people who gather others`
const DESCRIPTION =
  'Creator Lab is Frequency’s free training library for community hosts: live workshops and short self-paced courses on the business of community and the craft of holding a room.'
const IMAGE = '/brand/frequency/photos/boc-circle-dusk.jpg'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    ...OG_SITE,
    title: `${TITLE} · ${SITE_NAME}`,
    description: DESCRIPTION,
    url: PATH,
    type: 'website',
    images: [{ url: IMAGE }],
  },
  twitter: { card: 'summary_large_image', title: `${TITLE} · ${SITE_NAME}`, description: DESCRIPTION },
}

export default async function CoursesPage() {
  const courses = await listCourses()
  const shelves = groupByTrack(courses)
  const ordered = shelves.flatMap((s) => s.courses)
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: LIBRARY_NAME, path: PATH }]),
          courseListSchema(
            ordered.map((c) => ({ path: courseHref(c.slug), name: c.title })),
            `${LIBRARY_NAME} on ${SITE_NAME}`,
          ),
        ]}
      />
      <FrequencyCourses shelves={shelves} />
    </>
  )
}
