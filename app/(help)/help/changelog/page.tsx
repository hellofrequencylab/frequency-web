import type { Metadata } from 'next'
import { promises as fs } from 'fs'
import path from 'path'
import { HelpMarkdown } from '@/components/help/help-markdown'

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

  return (
    <article className="max-w-3xl">
      <HelpMarkdown>{body}</HelpMarkdown>
    </article>
  )
}
