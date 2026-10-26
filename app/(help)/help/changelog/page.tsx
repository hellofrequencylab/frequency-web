import type { Metadata, ResolvingMetadata } from 'next'
import { helpPageMetadata } from '@/lib/help/metadata'
import { SITE_NAME } from '@/lib/site'
import { promises as fs } from 'fs'
import path from 'path'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { FrequencyHelpChangelog } from '@/components/frequency/site/pages/help/frequency-help-pages'

// "What's new" renders the human-facing CHANGELOG (docs/CHANGELOG.md) directly,
// so the public version history IS the changelog: one source, auto-updated on
// every release. Keep CHANGELOG entries written for humans (Keep a Changelog);
// technical detail belongs in git history, not here.
const HELP_METADATA: Metadata = {
  title: "What's new · Help",
  description: 'Recent changes and improvements to Frequency.',
  alternates: { canonical: '/help/changelog' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    title: `What's new · Help · ${SITE_NAME}`,
    description: 'Recent changes and improvements to Frequency.',
    url: '/help/changelog',
  },
}

export async function generateMetadata(
  _props: { params: Promise<Record<string, never>> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  return helpPageMetadata(HELP_METADATA, parent)
}

export default async function ChangelogPage() {
  let body = "# What's new\n\nNothing here yet."
  try {
    body = await fs.readFile(path.join(process.cwd(), 'docs', 'CHANGELOG.md'), 'utf8')
  } catch {
    // fall back to the placeholder above
  }

  // The shared header now carries the "What's new" title, so drop a leading H1
  // from the markdown to avoid a duplicate heading.
  const content = body.replace(/^#\s+.*(?:\r?\n)+/, '')
  return (
    <>
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Help', path: '/help' },
          { name: "What's new", path: '/help/changelog' },
        ])}
      />
      <FrequencyHelpChangelog body={content} />
    </>
  )
}
