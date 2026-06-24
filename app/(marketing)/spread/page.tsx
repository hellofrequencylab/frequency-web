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
    title: 'Spread the word',
    description:
      'Take a role in building community around you. Bring one person, host one thing once, or share the idea. Small moves are how a community actually grows.',
    alternates: { canonical: '/spread' },
    openGraph: {
      title: 'Spread the word · Frequency',
      description:
        'You do not have to do everything. Bring one person, host once, or pass the idea along. A community grows one introduction at a time.',
      url: '/spread',
    },
  }
}

// The /spread landing renders the live published Puck document when an operator has
// published one; otherwise it falls back to the git-authored template so the page
// is live the moment this ships and stays editable/overridable in the editor.
export default async function SpreadPage() {
  const data = (await getPublishedData('spread')) ?? getTemplate('spread')
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Spread', path: '/spread' }])} />
      {data && Array.isArray(data.content) && data.content.length > 0 && (
        <Render config={config} data={data} />
      )}
    </>
  )
}
