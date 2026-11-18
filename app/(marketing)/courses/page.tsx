// /courses: the library of Frequency's own courses, grouped by track (lib/courses/tracks.ts). Public and
// indexable. The page loads the courses, sets metadata and schema, and renders the kit body.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, journeyListSchema } from '@/lib/jsonld'
import { listCourses } from '@/lib/courses/library'
import { groupByTrack } from '@/lib/courses/tracks'
import { OG_SITE, SITE_NAME } from '@/lib/site'
import { FrequencyCourses } from '@/components/frequency/site/pages/courses/courses'

export const revalidate = 3600

const PATH = '/courses'
const TITLE = 'Free courses for community hosts'
const DESCRIPTION =
  'Free, self-paced courses from Frequency for people who gather others: the business side of hosting, and the craft of holding a room.'
const IMAGE = '/brand/frequency/photos/gathering-03.jpg'

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
  // The ItemList names each course by its canonical public Journey page, the same URL the Journey's own
  // HowTo node carries, so the list and the detail agree on identity.
  const ordered = shelves.flatMap((s) => s.courses)
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Courses', path: PATH }]),
          journeyListSchema(
            ordered.map((c) => ({ slug: c.slug, title: c.title })),
            `Courses on ${SITE_NAME}`,
          ),
        ]}
      />
      <FrequencyCourses shelves={shelves} />
    </>
  )
}
