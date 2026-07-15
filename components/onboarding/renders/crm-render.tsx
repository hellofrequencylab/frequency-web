// CRM render — a desktop "Resonance CRM" mockup (ADR-068). TEMPORARY, disposable SVG.
// The member list on the left, an email compose panel on the right — "send your event to your list".

import { RenderFrame, InnerCard, Bar, Label } from './frame'

// One contact row: avatar + name, with a health chip on the right.
function Contact({ y, name, health, tone, accent }: { y: number; name: string; health: string; tone: string; accent?: boolean }) {
  return (
    <>
      <InnerCard x={140} y={y} w={176} h={40} tone={accent ? 'text-primary-bg' : undefined} />
      <g className={accent ? 'text-primary' : 'text-primary-bg'}>
        <circle cx={162} cy={y + 20} r={11} fill="currentColor" />
      </g>
      <Label x={182} y={y + 24} size={10} weight={700}>{name}</Label>
      <g className={tone}>
        <rect x={264} y={y + 11} width={40} height={18} rx={9} fill="currentColor" opacity={0.2} />
      </g>
      <Label x={284} y={y + 24} size={8} weight={700} tone={tone} anchor="middle">{health}</Label>
    </>
  )
}

export function CrmRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of the Frequency CRM" title="CRM" active={3} animate={animate}>
      {/* Member list, left */}
      <Label x={140} y={96} size={9} weight={600} tone="text-subtle">YOUR LIST · 214</Label>
      <Contact y={106} name="Maya R." health="82" tone="text-success" accent />
      <Contact y={152} name="Theo K." health="60" tone="text-warning" />
      <Contact y={198} name="Priya N." health="41" tone="text-danger" />
      <Contact y={244} name="Sam D." health="74" tone="text-success" />

      {/* Compose panel, right */}
      <InnerCard x={336} y={106} w={180} h={180} />
      <Label x={352} y={128} size={10} weight={800} tone="text-primary-strong">New message</Label>
      {/* subject */}
      <g className="text-surface">
        <rect x={352} y={138} width={148} height={20} rx={7} fill="currentColor" />
      </g>
      <g className="text-border"><rect x={352} y={138} width={148} height={20} rx={7} fill="none" stroke="currentColor" strokeWidth={1.5} /></g>
      <Label x={360} y={152} size={9} weight={500} tone="text-subtle">You are invited: Sunset Sound Bath</Label>
      {/* body lines */}
      <Bar x={352} y={170} w={148} />
      <Bar x={352} y={184} w={148} />
      <Bar x={352} y={198} w={110} />
      {/* send */}
      <g className="text-primary">
        <rect x={352} y={248} width={148} height={26} rx={10} fill="currentColor" />
      </g>
      <Label x={426} y={265} size={10} weight={800} tone="text-on-primary" anchor="middle">Send to 214 →</Label>
    </RenderFrame>
  )
}
