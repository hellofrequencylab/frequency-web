// Booking render — a desktop "booking page" mockup (ADR-068). TEMPORARY, disposable SVG.

import { RenderFrame, InnerCard, Label } from './frame'

function DayChip({ x, dow, day, accent }: { x: number; dow: string; day: string; accent?: boolean }) {
  const cx = x + 33
  return (
    <>
      <InnerCard x={x} y={106} w={66} h={56} tone={accent ? 'text-primary' : undefined} />
      <Label x={cx} y={128} size={8} weight={700} tone={accent ? 'text-on-primary' : 'text-subtle'} anchor="middle">{dow}</Label>
      <Label x={cx} y={148} size={16} weight={800} tone={accent ? 'text-on-primary' : 'text-primary-strong'} anchor="middle">{day}</Label>
    </>
  )
}

function Slot({ x, y, time, accent }: { x: number; y: number; time: string; accent?: boolean }) {
  return (
    <>
      <InnerCard x={x} y={y} w={182} h={34} tone={accent ? 'text-primary' : undefined} />
      <Label x={x + 20} y={y + 22} size={11} weight={700} tone={accent ? 'text-on-primary' : 'text-text'}>{time}</Label>
      {accent && (
        <g className="text-on-primary">
          <path d={`M${x + 152} ${y + 17}l4 4 8-9`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </>
  )
}

export function BookingRender({ animate = true }: { animate?: boolean }) {
  return (
    <RenderFrame label="A preview of Frequency booking" title="Booking" active={2} animate={animate}>
      <Label x={140} y={96} size={9} weight={600} tone="text-subtle">PICK A TIME · JUNE</Label>
      <DayChip x={140} dow="MON" day="16" />
      <DayChip x={218} dow="TUE" day="17" accent />
      <DayChip x={296} dow="WED" day="18" />
      <DayChip x={374} dow="THU" day="19" />
      <DayChip x={452} dow="FRI" day="20" />

      <Label x={140} y={190} size={9} weight={600} tone="text-subtle">AVAILABLE TIMES</Label>
      <Slot x={140} y={200} time="9:00 AM" />
      <Slot x={334} y={200} time="10:30 AM" accent />
      <Slot x={140} y={244} time="1:00 PM" />
      <Slot x={334} y={244} time="2:30 PM" />

      <g className="text-primary">
        <rect x={140} y={294} width={376} height={38} rx={12} fill="currentColor" />
      </g>
      <Label x={328} y={318} size={12} weight={800} tone="text-on-primary" anchor="middle">Confirm · Tue 10:30 AM</Label>
    </RenderFrame>
  )
}
