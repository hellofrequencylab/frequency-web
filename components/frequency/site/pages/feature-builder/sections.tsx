// The sections under every feature builder's hero (LIVE-2481): what you get, and the questions people ask. Kit sections
// only (cs-sec from create-space.css), tokens only. Each page hands in its own words.
import type { ReactNode } from 'react'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'

export interface GetItem { name: string; body: string; icon: FqIconName }
export interface FaqItem { q: string; a: string }

export function WhatYouGet({ id, title, items }: { id: string; title: ReactNode; items: readonly GetItem[] }) {
  return (
    <section className="cs-sec cs-sec-rule" aria-labelledby={`${id}-h`}>
      <div className="cs-sec-in">
        <div className="cs-sec-intro">
          <span className="cs-sec-eyebrow">What you get</span>
          <h2 id={`${id}-h`} className="cs-sec-h">{title}</h2>
        </div>
        <ul className="cs-tools">
          {items.map((g) => (
            <li key={g.name} className="cs-tool">
              <span className="fq-icon-tile"><FqIcon name={g.icon} /></span>
              <b className="cs-tool-h">{g.name}</b>
              <p className="cs-tool-p">{g.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function Questions({ id, items }: { id: string; items: readonly FaqItem[] }) {
  return (
    <section className="cs-sec" aria-labelledby={`${id}-h`}>
      <div className="cs-sec-in cs-faq">
        <div className="cs-sec-intro">
          <span className="cs-sec-eyebrow">Questions</span>
          <h2 id={`${id}-h`} className="cs-sec-h">Before you <em className="fq-iri-text">start.</em></h2>
        </div>
        <div className="cs-faq-list">
          {items.map((f) => (
            <details key={f.q} className="cs-q">
              <summary className="cs-q-s">{f.q}<FqIcon name="plus" className="cs-q-i" /></summary>
              <p className="cs-q-a">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
