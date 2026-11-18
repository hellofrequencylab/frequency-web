// /courses/<slug>/certify under the Frequency design: what Certified asks for, where the holder stands, and
// the one form.

import Link from 'next/link'
import { LIBRARY_NAME } from '@/lib/courses/tracks'
import type { CredentialLevel } from '@/lib/courses/credentials-types'
import { ActionPanel, DetailBody, DirHero, DirPage, photo } from '../discover/dir-parts'
import { CertifyForm } from './certify-form'

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const STATUS: Record<string, string> = {
  submitted: 'Waiting for review',
  certified: 'Certified',
  returned: 'Sent back with a note',
}

export function FrequencyCertify({
  slug,
  title,
  coursePath,
  submissions,
  credentials,
}: {
  slug: string
  title: string
  coursePath: string
  submissions: { id: string; status: string; reviewerNote: string | null; createdAt: string }[]
  credentials: { id: string; level: CredentialLevel; issuedAt: string }[]
}) {
  const certified = credentials.find((c) => c.level === 'certified')
  const waiting = submissions.some((s) => s.status === 'submitted')
  return (
    <DirPage side="p">
      <DirHero
        crumbs={[
          { label: 'Home', href: '/' },
          { label: LIBRARY_NAME, href: '/courses' },
          { label: title, href: coursePath },
          { label: 'Certified' },
        ]}
        image={photo('boc-writing-cushions.jpg')}
        title="Send in your Community Book."
        lede={`Your four pages from ${title}, filled in from real gatherings. A Frequency reviewer reads every one.`}
      />
      <DetailBody
        main={
          <>
            <section>
              <h2>What to send</h2>
              <ul className="dd-list">
                <li>Your sit-down page: your purpose, your time and place, your three active things.</li>
                <li>Your opening: your purpose line, your three agreements, your check-in question.</li>
                <li>Your run sheet from a gathering you actually ran.</li>
                <li>Your money page: your break-even and your price.</li>
              </ul>
              <p className="dd-prose">
                Paste the pages, or links to them (a shared doc, photos of your notebook). Missed a live session?
                Watch the replay and do that week’s homework first.
              </p>
            </section>
            {(submissions.length > 0 || credentials.length > 0) && (
              <section>
                <h2>Where you stand</h2>
                <ul className="dd-list">
                  {credentials.map((c) => (
                    <li key={c.id}>
                      <Link href={`/credentials/${c.id}`}>{c.level === 'certified' ? 'Certified' : 'Attended'}</Link>
                      <small>{dateFmt.format(new Date(c.issuedAt))}</small>
                    </li>
                  ))}
                  {submissions.map((s) => (
                    <li key={s.id}>
                      <span>
                        Community Book: {STATUS[s.status] ?? s.status}
                        {s.reviewerNote ? `. ${s.reviewerNote}` : ''}
                      </span>
                      <small>{dateFmt.format(new Date(s.createdAt))}</small>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        }
        side={
          <ActionPanel title={certified ? 'You’re Certified' : waiting ? 'It’s with a reviewer' : 'Send it in'}>
            {certified ? (
              <Link className="btn fq-iri-btn" href={`/credentials/${certified.id}`}>
                See your credential
              </Link>
            ) : waiting ? (
              <p>You’ll hear back by email. You can send a new one if it comes back with a note.</p>
            ) : (
              <CertifyForm slug={slug} />
            )}
            <p className="dd-fine">
              Free for Community Books submitted by February 28, 2027, then included with the Business plan. A
              certificate of completion and competency, not an accredited certification.
            </p>
          </ActionPanel>
        }
      />
    </DirPage>
  )
}
