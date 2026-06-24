import type { Metadata } from 'next'
import { Render } from '@measured/puck/rsc'
import { config } from '@/lib/page-editor/config'
import { getPublishedData } from '@/lib/page-editor/data'
import { getTemplate } from '@/lib/page-editor/templates'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'

export const revalidate = 3600

export function generateMetadata(): Metadata {
  return {
    title: 'Start a practice',
    description:
      'Start where you are, today. Practices, Journeys, and the Mindless timer all work on your own, in five minutes before your coffee. Do one practice today and earn your first Zap.',
    alternates: { canonical: '/practice' },
    openGraph: {
      title: 'Start a practice · Frequency',
      description:
        'Five minutes counts. Do one Practice today, set the Mindless timer, and walk a Journey on your own. Start where you are.',
      url: '/practice',
    },
  }
}

// The /practice landing renders the live published Puck document when an operator
// has published one; otherwise it falls back to the git-authored template so the
// page is live the moment this ships and stays editable/overridable in the editor.
export default async function PracticePage() {
  const data = (await getPublishedData('practice')) ?? getTemplate('practice')
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Practice', path: '/practice' }])} />
      {data && Array.isArray(data.content) && data.content.length > 0 && (
        <Render config={config} data={data} />
      )}
    </>
  )
}
