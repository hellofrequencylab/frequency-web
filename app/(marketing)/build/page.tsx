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
    title: 'Build a Circle',
    description:
      'Be the reason your people have somewhere to go. Host one Circle and we hand you the format, the first-night script, and the rails. You do not have to build a community alone.',
    alternates: { canonical: '/build' },
    openGraph: {
      title: 'Build a Circle · Frequency',
      description:
        'Host one Circle. We hand you the format and you are not alone. Set out the chairs and be the reason your people have somewhere to go.',
      url: '/build',
    },
  }
}

// The /build landing renders the live published Puck document when an operator has
// published one; otherwise it falls back to the git-authored template so the page
// is live the moment this ships and stays editable/overridable in the editor.
// (Routed at /build, not /lead: the in-app Leadership home already owns /lead.)
export default async function BuildPage() {
  const data = (await getPublishedData('build')) ?? getTemplate('build')
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Build', path: '/build' }])} />
      {data && Array.isArray(data.content) && data.content.length > 0 && (
        <Render config={config} data={data} />
      )}
    </>
  )
}
