import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { lessonStructure } from '@/lib/journeys/lesson-markdown'
import '@/app/themes/active/members-c'

// A lesson body, set as a lesson. The player used to print the body as one pre-wrapped string, so a
// Markdown list read as lines that start with a dash and every paragraph weighed the same. This is
// the lesson's reading surface: real lists, headings, a pull quote for a blockquote, and the shapes
// lib/journeys/lesson-markdown.ts names (a lede, a titled group, a timed run of show, prompts to
// fill in). A Server Component, so react-markdown never ships to the client: the play page renders
// one per open lesson and hands the player a node map (the same pattern as the practice detail).
// The look is `.mc-prose` in app/themes/frequency/members-c.css.

type Kids = { children?: ReactNode; className?: string }

export function LessonProse({ children }: { children: string }) {
  return (
    <div className="mc-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, lessonStructure]}
        components={{
          // The lesson's own title is the page's h1, so an author's "# Heading" starts at h2.
          h1: ({ children }: Kids) => <h2>{children}</h2>,
          a: ({ href, children }: Kids & { href?: string }) => {
            const target = href ?? '#'
            return target.startsWith('/') ? (
              <Link href={target}>{children}</Link>
            ) : (
              <a href={target} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          },
          // A wide table scrolls inside its own box, never the page.
          table: ({ children }: Kids) => (
            <div className="mc-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
