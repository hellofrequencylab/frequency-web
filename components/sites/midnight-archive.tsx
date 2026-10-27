'use client'

import { useState, type ReactNode } from 'react'
import { MidnightGlyph } from '@/components/sites/midnight-glyph'

// THE MIDNIGHT LETTER ARCHIVE (House of Fates design, the Newsletter page). A ruled list of past letters; picking
// one swaps the list for the reader view (a back link, the number and date, the title, the paragraphs and the
// sign-up again). Plain buttons, no route change, so the page keeps its place. The last paragraph is the sign-off.

export interface MidnightLetter { no: string; title: string; date: string; read: string; paragraphs: string[] }

export function MidnightArchive({ eyebrow, letters, signupTitle, signup }: { eyebrow: string; letters: MidnightLetter[]; signupTitle: string; signup: ReactNode }) {
  const [open, setOpen] = useState<number | null>(null)
  const letter = open === null ? null : letters[open]
  if (letter) {
    return (
      <section className="mn-section mn-letter-reader">
        <button type="button" className="mn-back" onClick={() => { setOpen(null); window.scrollTo(0, 0) }}>
          <MidnightGlyph name="arrow-left" size={14} />
          All letters
        </button>
        <article className="mn-letter-article">
          <div className="mn-eyebrow">{[letter.no && `No. ${letter.no}`, letter.date, letter.read].filter(Boolean).join(' · ')}</div>
          <h1 className="mn-display mn-display--h2">{letter.title}</h1>
          <div className="mn-letter-body">
            {letter.paragraphs.map((p, i) => <p key={i} data-last={i === letter.paragraphs.length - 1 ? '' : undefined}>{p}</p>)}
          </div>
          <div className="mn-letter-next">
            <div className="mn-display mn-display--sm">{signupTitle}</div>
            {signup}
          </div>
        </article>
      </section>
    )
  }
  return (
    <section className="mn-section">
      {eyebrow && <div className="mn-eyebrow mn-archive-eyebrow">{eyebrow}</div>}
      <div className="mn-archive">
        {letters.map((l, i) => (
          <button type="button" key={i} className="mn-archive-row" onClick={() => { setOpen(i); window.scrollTo(0, 0) }}>
            <span className="mn-archive-no">{l.no && `No. ${l.no}`}</span>
            <span className="mn-archive-main">
              <span className="mn-archive-title">{l.title}</span>
              <span className="mn-archive-excerpt">{l.paragraphs[0]}</span>
            </span>
            <span className="mn-eyebrow mn-archive-date">
              {l.date}
              <MidnightGlyph name="arrow-up-right" size={14} />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
