import type { Metadata } from 'next'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { listPrograms } from '@/lib/programs'

export const metadata: Metadata = {
  title: 'Programs',
  description: 'Free frameworks and trainings for starting, running, and growing a circle.',
}

export default async function ProgramsPage() {
  const programs = await listPrograms()

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-text mb-1">Programs</h1>
      <p className="text-muted mb-8">
        Free frameworks and trainings to help you start, run, and grow a real circle. None
        of it is appointed from above; this is how to do it yourself.
      </p>

      {programs.length === 0 ? (
        <p className="text-muted">Programs are coming soon.</p>
      ) : (
        <ul className="space-y-3">
          {programs.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/programs/${p.slug}`}
                className="block rounded-xl border border-border bg-surface-elevated p-4 transition-colors hover:border-primary-bg"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-primary-strong">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-text">{p.title}</p>
                    {p.description && <p className="mt-0.5 text-sm text-muted">{p.description}</p>}
                    <div className="mt-1 flex items-center gap-2 text-xs text-subtle">
                      <span>{p.audience === 'host' ? 'For hosts' : 'For everyone'}</span>
                      {p.duration && (
                        <>
                          <span>·</span>
                          <span>{p.duration}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
