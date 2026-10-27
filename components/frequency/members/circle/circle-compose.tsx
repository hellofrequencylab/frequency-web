'use client'

import { useState, type ComponentProps } from 'react'
import { Composer } from '@/components/feed/composer'

// THE CIRCLE'S COMPOSER WITH ITS STARTER PROMPTS (templates/circles/Circles.dc.html, the New member
// view): three chips that put an opening line in the box. The box is the real Composer, untouched;
// a chip re-keys it with that line as its starting text, so the member edits what is there and posts
// through the same path as any post. With no prompts it is just the Composer.
export function FqCircleCompose({
  prompts = [],
  ...composer
}: ComponentProps<typeof Composer> & { prompts?: { label: string; text: string }[] }) {
  const [seed, setSeed] = useState<{ text: string; n: number }>({ text: '', n: 0 })
  return (
    <>
      {prompts.length > 0 && (
        <div className="fqc-prompts" role="group" aria-label="Ways to start">
          {prompts.map((p) => (
            <button key={p.label} type="button" className="fqc-chip" onClick={() => setSeed((s) => ({ text: p.text, n: s.n + 1 }))}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <Composer key={seed.n} {...composer} initialBody={seed.text || composer.initialBody} />
    </>
  )
}
