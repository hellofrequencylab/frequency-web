import type { Metadata } from 'next'
import { promises as fs } from 'fs'
import path from 'path'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { StreamTemplate } from '@/components/templates'

// "What's new" renders the human-facing CHANGELOG (docs/CHANGELOG.md) directly,
// so the public version history IS the changelog: one source, auto-updated on
// every release. Keep CHANGELOG entries written for humans (Keep a Changelog);
// technical detail belongs in git history, not here.
export const metadata: Metadata = {
  title: "What's new | Help",
  description: 'Recent changes and improvements to Frequency.',
  alternates: { canonical: '/help/changelog' },
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
    <StreamTemplate
      title="What's new"
      description="Recent changes and improvements to Frequency."
    >
      <div className="max-w-3xl">
        <HelpMarkdown>{content}</HelpMarkdown>
      </div>
    </StreamTemplate>
  )
}
