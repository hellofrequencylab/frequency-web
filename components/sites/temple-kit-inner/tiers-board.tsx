'use client'

import { useState } from 'react'

// THE TEMPLE KIT MEMBERSHIP BOARD (design: MembershipPage). The Monthly | Yearly switch is the one client piece:
// the rungs arrive from the server block already resolved (links through the site map), and the switch only picks
// which price each card reads. The switch is not drawn when no rung carries a yearly price.

export interface TierCard {
  name: string
  summary: string
  monthly: string
  yearly: string
  intro: string
  perks: string[]
  featured: boolean
  badge: string
  href: string | null
  ctaLabel: string
  sigil: string
}

const SIGILS: Record<string, string> = {
  half: 'M12 4a8 8 0 1 0 0 16zM12 4a8 8 0 0 1 0 16',
  ring: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  square: 'M6 6h12v12H6z',
}

export function TempleKitTiersBoard({ tiers, monthlyLabel, yearlyLabel, yearlyNote }: { tiers: TierCard[]; monthlyLabel: string; yearlyLabel: string; yearlyNote: string }) {
  const [yearly, setYearly] = useState(false)
  const canSwitch = tiers.some((t) => t.yearly)
  return (
    <div className="tki-tiers">
      {canSwitch && (
        <div className="tki-tabs" role="group" aria-label="Billing">
          {[[false, monthlyLabel], [true, yearlyLabel]].map(([v, label]) => (
            <button key={String(v)} type="button" className="tki-tab" aria-pressed={yearly === v} onClick={() => setYearly(v as boolean)}>{label as string}</button>
          ))}
        </div>
      )}
      <ul className="tki-tier-grid">
        {tiers.map((t, i) => {
          const price = yearly && t.yearly ? t.yearly : t.monthly
          const per = yearly && t.yearly ? yearlyLabel : monthlyLabel
          return (
            <li key={i} className={`tki-tier${t.featured ? ' tki-tier--featured' : ''}`}>
              <div className="tki-tier-top">
                <span className="tki-tier-sigil" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d={SIGILS[t.sigil] ?? SIGILS.ring} /></svg>
                </span>
                {t.featured && t.badge && <span className="tki-badge">{t.badge}</span>}
              </div>
              <h3 className="tki-tier-name">{t.name}</h3>
              {t.summary && <p className="tki-tier-summary">{t.summary}</p>}
              {price && (
                <div className="tki-tier-price">
                  <span className="tki-tier-amount">{price}</span>
                  <span className="tki-eyebrow">/ {per.toLowerCase()}</span>
                </div>
              )}
              {yearly && t.yearly && yearlyNote ? <span className="tki-tier-note">{yearlyNote}</span> : !yearly && t.intro ? <span className="tki-tier-note">{t.intro}</span> : null}
              {t.perks.length > 0 && (
                <ul className="tki-points">
                  {t.perks.map((x, j) => (
                    <li key={j}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                      {x}
                    </li>
                  ))}
                </ul>
              )}
              {t.href && t.ctaLabel && <a className={`hs-btn ${t.featured ? 'hs-btn-primary' : 'hs-btn-soft'} tki-tier-cta`} href={t.href}>{t.ctaLabel}</a>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
