'use client'

// /create-a-space, the builder: four moves (name, look, tools, host) beside the live preview, under a progress meter.
// A move is a card when open, a one-line row once done (tap to edit), and a dim number until its turn. The state
// lives in the island above (create-space-studio.tsx) so the hero and this section show one Space. Saving it with
// an account is the fifth move and comes in the next pass. Styles: create-space.css (cs-bld-*).
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { BookOpen, Check, Clock, Heart, Mail, ShoppingBag, Ticket, Users, UsersRound } from 'lucide-react'
import { SpacePreview } from '@/components/frequency/site/pages/create-space/space-preview'
import {
  BUILDER_MOVES, cleanHandleInput, handleFromName, handleOf, hasProgress, isValidHandle, meterLabel, meterOf, nextOpenMove,
  progressOf, startingModeFor, trackFraction,
} from '@/lib/create-space/builder'
import type { BuilderDraft, BuilderMove } from '@/lib/create-space/builder'
import { PREVIEW_KITS, deriveSite, kitAccents, kitImagery } from '@/lib/create-space/preview-site'
import { WIZARD_INTENTS } from '@/lib/spaces/create-wizard'

const GOAL_ICON = { bookings: Clock, classes: UsersRound, programs: BookOpen, events: Ticket, products: ShoppingBag, community: Users, email: Mail, donations: Heart } as const

const TITLES: Record<BuilderMove, { todo: string; label: string }> = {
  name: { todo: 'Name your Space', label: 'Name' },
  look: { todo: 'Make it look like you', label: 'Look' },
  goals: { todo: 'What will happen there', label: 'Tools' },
  host: { todo: "Who's hosting", label: 'Host' },
}

const lower = (t: string, i: number) => (i === 0 ? t : t.charAt(0).toLowerCase() + t.slice(1))
const joinList = (items: readonly string[]) => {
  const a = items.map(lower)
  return a.length < 2 ? (a[0] ?? '') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`
}

interface BuilderProps {
  draft: BuilderDraft
  update: (patch: Partial<BuilderDraft>) => void
  markDone: (move: BuilderMove, patch?: Partial<BuilderDraft>) => void
  reset: () => void
  vars: Record<string, string>
  accentFill: string
  /** The visitor came without a kit: offer the full-size Theme Kit pages. */
  cold: boolean
}

function Rows({ children }: { children: ReactNode }) {
  return <div className="cs-bld-steps">{children}</div>
}

function DoneRow({ move, value, onEdit }: { move: BuilderMove; value: string; onEdit: () => void }) {
  return (
    <button type="button" className="cs-bld-done" onClick={onEdit}>
      <span className="cs-bld-tick"><Check aria-hidden="true" /></span>
      <span className="cs-bld-done-k">{TITLES[move].label}</span>
      <span className="cs-bld-done-v">{value}</span>
      <span className="cs-bld-done-e">Edit</span>
    </button>
  )
}

function TodoRow({ n, label }: { n: number; label: string }) {
  return (
    <div className="cs-bld-todo">
      <span className="cs-bld-n">{n}</span>
      <span>{label}</span>
    </div>
  )
}

function Card({ n, title, em, lead, children }: { n: string; title: string; em: string; lead: string; children: ReactNode }) {
  return (
    <div className="cs-bld-card fq-iri-rim">
      <div className="cs-bld-head">
        <span className="cs-bld-count">{n}</span>
        <h3 className="cs-bld-h">{title} <em>{em}</em></h3>
        <p className="cs-bld-lead">{lead}</p>
      </div>
      {children}
    </div>
  )
}

export function CreateSpaceBuilder({ draft, update, markDone, reset, vars, accentFill, cold }: BuilderProps) {
  const [open, setOpen] = useState<number>(() => nextOpenMove(draft.done, -1) ?? BUILDER_MOVES.length)
  const [handleOpen, setHandleOpen] = useState(false)
  const [nameErr, setNameErr] = useState('')
  const [hostErr, setHostErr] = useState(false)
  const [toast, setToast] = useState('')
  const [moved, setMoved] = useState(false)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const go = (i: number) => { setMoved(true); setNameErr(''); setHostErr(false); setOpen(i) }
  const advance = (done: Record<BuilderMove, boolean>, from: number) => go(nextOpenMove(done, from) ?? BUILDER_MOVES.length)

  const accents = kitAccents(draft.kit)
  const accent = accents[draft.accentAt] ?? accents[0]
  const kitLabel = PREVIEW_KITS.find((k) => k.id === draft.kit)?.label ?? draft.kit
  const kitHint = PREVIEW_KITS.find((k) => k.id === draft.kit)?.hint ?? ''
  const handle = handleOf(draft)
  const handleOk = isValidHandle(handle)
  const siteName = draft.name.trim() || 'Your Space'
  const mode = startingModeFor(draft.goals)
  const site = deriveSite({ name: draft.name, handle, hostName: draft.hostName, intents: draft.goals, kit: draft.kit })
  const imagery = kitImagery(draft.kit)
  const pct = progressOf(draft)
  const meter = meterOf(draft, true)
  const building = BUILDER_MOVES.some((m) => !draft.done[m])
  const finish = (move: BuilderMove, patch?: Partial<BuilderDraft>) => {
    markDone(move, patch)
    return { ...draft.done, [move]: true }
  }

  const saveName = () => {
    if (!draft.name.trim()) { setNameErr('Give your Space a name first.'); return }
    if (!handleOk) { setNameErr('Handles use letters, numbers and single hyphens, at least two characters.'); setHandleOpen(true); return }
    advance(finish('name'), 0)
    setToast('Name saved')
  }
  const saveLook = () => { advance(finish('look', { kitChosen: true }), 1); setToast(`${kitLabel} kit`) }
  const saveGoals = (later: boolean) => {
    const patch = later ? { goals: [] } : undefined
    advance(finish('goals', patch), 2)
    setToast(later || !draft.goals.length ? 'Starting simple' : `${mode.tools.length} tools switched on`)
  }
  const saveHost = () => {
    if (!draft.hostName.trim()) { setHostErr(true); return }
    advance(finish('host'), 3)
    setToast('Host added')
  }
  const onEnter = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); fn() } }

  const value: Record<BuilderMove, string> = {
    name: `${siteName} · /${handle}`,
    look: `${kitLabel} · ${accent.name}`,
    goals: draft.goals.length ? joinList(WIZARD_INTENTS.filter((i) => draft.goals.includes(i.id)).map((i) => i.label)) : 'Starting simple',
    host: draft.hostName.trim(),
  }
  const caption = pct >= 90 ? 'Built, and all yours.' : draft.name.trim() ? `${siteName}, coming together.` : 'Your Space, as you build it.'

  const stepFor = (move: BuilderMove, i: number): ReactNode => {
    const done = draft.done[move]
    if (open === i) {
      if (move === 'name') {
        return (
          <Card key={move} n="1 of 5" title="What's your Space" em="called?" lead="Watch your website and Spotlight change as you type.">
            <input
              autoFocus={moved}
              className="cs-bld-name"
              value={draft.name}
              onChange={(e) => { setNameErr(''); update({ name: e.target.value }) }}
              onKeyDown={onEnter(saveName)}
              placeholder="Saltwater Collective"
              maxLength={80}
              autoComplete="organization"
              aria-label="Space name"
            />
            <div className="cs-bld-handle">
              <span className="cs-bld-url">frequency.community/<b>{handle}</b></span>
              <button type="button" className="cs-bld-text" onClick={() => setHandleOpen((v) => !v)} aria-expanded={handleOpen}>Change handle</button>
            </div>
            {handleOpen ? (
              <span className="cs-bld-slug">
                <span>/spaces/</span>
                <input
                  value={draft.slug || handleFromName(draft.name)}
                  onChange={(e) => { setNameErr(''); update({ slug: cleanHandleInput(e.target.value) }) }}
                  onKeyDown={onEnter(saveName)}
                  aria-label="Handle"
                  placeholder="yourhandle"
                  maxLength={40}
                />
              </span>
            ) : null}
            {nameErr ? <p role="alert" className="cs-bld-err">{nameErr}</p> : null}
            <div className="cs-bld-foot">
              <span className="cs-bld-hint">Press Enter to keep going</span>
              <button type="button" className="btn fq-iri-btn cs-bld-next" onClick={saveName}>Looks good<span aria-hidden="true">→</span></button>
            </div>
          </Card>
        )
      }
      if (move === 'look') {
        return (
          <Card key={move} n="2 of 5" title="Make it look like" em="you." lead="One Theme Kit dresses your website, Spotlight and email. Then pick your accent.">
            <div role="radiogroup" aria-label="Theme Kit" className="cs-bld-kits">
              {PREVIEW_KITS.map((k) => {
                const on = k.id === draft.kit
                const first = kitAccents(k.id)[0]
                return (
                  <button
                    key={k.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={on ? 'cs-bld-kit is-on' : 'cs-bld-kit'}
                    onClick={() => update({ kit: k.id, accentAt: 0, kitChosen: true })}
                  >
                    <span className="cs-bld-swatch"><i style={{ background: first.fill }} /></span>
                    <span>{k.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="cs-bld-tag">{kitHint}</p>
            <div className="cs-bld-accent">
              <span className="cs-bld-accent-k">Accent · <span>{accent.name}</span></span>
              <div role="radiogroup" aria-label="Accent" className="cs-bld-dots">
                {accents.map((a, ai) => (
                  <button
                    key={a.name}
                    type="button"
                    role="radio"
                    aria-checked={ai === draft.accentAt}
                    aria-label={a.name}
                    className="cs-bld-dot"
                    style={{ background: a.fill }}
                    onClick={() => update({ accentAt: ai })}
                  />
                ))}
              </div>
            </div>
            {cold && !draft.kitChosen ? <p className="cs-bld-hint">Want to see them full size? <Link href="/themes">Choose a Theme Kit</Link></p> : null}
            <div className="cs-bld-foot cs-bld-foot-end">
              <button type="button" className="btn fq-iri-btn cs-bld-next" onClick={saveLook}>Use this look<span aria-hidden="true">→</span></button>
            </div>
          </Card>
        )
      }
      if (move === 'goals') {
        return (
          <Card key={move} n="3 of 5 · tap any" title="What will happen" em="there?" lead="You're not picking a niche. We switch on the tools that fit, and you can add more any time.">
            <div role="group" aria-label="What will happen there" className="cs-bld-goals">
              {WIZARD_INTENTS.map((g) => {
                const on = draft.goals.includes(g.id)
                const Icon = GOAL_ICON[g.id]
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={on}
                    title={g.hint}
                    className={on ? 'cs-bld-goal is-on' : 'cs-bld-goal'}
                    onClick={() => update({ goals: on ? draft.goals.filter((x) => x !== g.id) : WIZARD_INTENTS.filter((i) => i.id === g.id || draft.goals.includes(i.id)).map((i) => i.id) })}
                  >
                    <Icon aria-hidden="true" />{g.label}
                  </button>
                )
              })}
            </div>
            <div className="cs-bld-tools">
              <span className="cs-bld-tools-k">Switching on · {mode.label} setup</span>
              <div className="cs-bld-tools-row">{mode.tools.map((t) => <span key={t} className="cs-bld-tool">{t}</span>)}</div>
            </div>
            <div className="cs-bld-foot">
              <button type="button" className="cs-bld-text" onClick={() => saveGoals(true)}>Decide later</button>
              <button type="button" className="btn fq-iri-btn cs-bld-next" onClick={() => saveGoals(false)}>Switch them on<span aria-hidden="true">→</span></button>
            </div>
          </Card>
        )
      }
      return (
        <Card key={move} n="4 of 5" title="Who's" em="hosting?" lead="Your name goes on your Spotlight and your host profile. Add a photo later.">
          <div className="cs-bld-who">
            <span className="cs-bld-avatar">{(draft.hostName.trim()[0] ?? '?').toUpperCase()}</span>
            <input
              autoFocus={moved}
              value={draft.hostName}
              onChange={(e) => { setHostErr(false); update({ hostName: e.target.value }) }}
              onKeyDown={onEnter(saveHost)}
              placeholder="Your name"
              maxLength={80}
              autoComplete="name"
              aria-label="Your name"
            />
          </div>
          {hostErr ? <p role="alert" className="cs-bld-err">Add the name people will know you by.</p> : null}
          <div className="cs-bld-foot">
            <span className="cs-bld-hint">Press Enter to keep going</span>
            <button type="button" className="btn fq-iri-btn cs-bld-next" onClick={saveHost}>That&apos;s me<span aria-hidden="true">→</span></button>
          </div>
        </Card>
      )
    }
    return done ? <DoneRow key={move} move={move} value={value[move]} onEdit={() => go(i)} /> : <TodoRow key={move} n={i + 1} label={TITLES[move].todo} />
  }

  const trackW = `calc((100% - 22px) * ${trackFraction(meter)})`

  return (
    <section id="get-started" className="cs-bld" aria-labelledby="cs-bld-h" style={vars as CSSProperties}>
      <div className="cs-bld-in">
        <div className="cs-bld-col">
          <div className="cs-bld-intro">
            <span className="cs-eyebrow">Let&apos;s get started</span>
            <h2 id="cs-bld-h" className="cs-bld-title">Start with a <em className="fq-iri-text">name.</em></h2>
            <p className="cs-bld-sub">Five quick moves build your Space, website and Spotlight. Then the setup walk adds your story, photos and first offering, and you&apos;re open.</p>
          </div>

          <div role="progressbar" aria-label="Your Space, built" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="cs-bld-meter">
            <div className="ig-ring" style={{ '--fq-v': pct, '--fq-s': '76px', '--fq-w': '6px' } as CSSProperties}>
              <span><b>{pct}<small>%</small></b></span>
            </div>
            <div className="cs-bld-meter-main">
              <div className="cs-bld-meter-top">
                <span className="ig-k">{meterLabel(draft)}</span>
                <span className="cs-bld-toast" aria-live="polite">{toast ? <span className="ig-d up">{toast}</span> : null}</span>
                {hasProgress(draft) ? <button type="button" className="cs-bld-reset" onClick={() => { reset(); go(0) }}>Start over</button> : null}
              </div>
              <div className="cs-bld-track">
                <span className="cs-bld-rail" aria-hidden="true" />
                <span className="cs-bld-fill" aria-hidden="true" style={{ width: trackW }} />
                {meter.map((m) => (
                  <div key={m.label} className="cs-bld-stop">
                    {m.on ? <span className="cs-bld-pip is-on"><Check aria-hidden="true" /></span> : m.now ? <span className="cs-bld-pip is-now" /> : <span className="cs-bld-pip" />}
                    <span className={m.on || m.now ? 'cs-bld-stop-l is-lit' : 'cs-bld-stop-l'}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Rows>
            {BUILDER_MOVES.map((m, i) => stepFor(m, i))}
            <TodoRow n={5} label="Save it and claim your handle" />
          </Rows>
          {!building ? <p className="cs-bld-hint">Everything is set. Saving it with a free account comes next.</p> : null}
        </div>

        <div className="cs-bld-stage">
          <div className="cs-bld-pvwrap">
            <div className="cs-glow" aria-hidden="true" style={{ background: `radial-gradient(closest-side, ${accentFill}, transparent)` }} />
            <SpacePreview kit={draft.kit} vars={vars} site={site} imagery={imagery} />
          </div>
          <p className="cs-bld-caption">{caption}</p>
        </div>
      </div>
    </section>
  )
}
