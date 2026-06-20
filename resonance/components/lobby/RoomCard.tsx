import Link from "next/link";
import type { VenueSummary } from "@/lib/dj/types";
import { venueHue } from "@/lib/theme/venue-hue";
import { Card, Badge, LiveBadge, Pill } from "@/components/ui";

/**
 * RoomCard — the lobby venue tile (DESIGN.md §10). One venue rendered as a lit
 * Card: the name in the display face, theme and media type as a Badge and muted
 * meta, the live signal via LiveBadge, and a row of actions (enter / walk / play
 * / decorate) as Pill links to the same routes. The whole card is tappable to
 * enter; it glows when the room is live so the floor reads as occupied at a
 * glance.
 */
const ACTIONS: { label: string; href: (id: string) => string }[] = [
  { label: "enter", href: (id) => `/dev/room/${id}` },
  { label: "walk", href: (id) => `/dev/space/${id}` },
  { label: "play", href: (id) => `/dev/games/${id}` },
  { label: "decorate", href: (id) => `/dev/decorate/${id}` },
];

export function RoomCard({ venue: v }: { venue: VenueSummary }) {
  const live = v.isPlaying || v.djs > 0;
  const isLive = v.here > 0 || live;

  return (
    <Card
      glow={isLive}
      className="flex flex-col gap-3"
      style={{ "--venue-h": venueHue(v.theme) } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/dev/room/${v.id}`}
            className="font-display text-lg text-text hover:text-pulse"
          >
            {v.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {v.theme && <Badge>{v.theme}</Badge>}
            <span className="text-xs text-mute">{v.mediaType}</span>
          </div>
        </div>
        <LiveBadge
          state={isLive ? "live" : "quiet"}
          count={v.here > 0 ? v.here : undefined}
          className="shrink-0"
        />
      </div>

      {live && v.djs > 0 && (
        <p className="text-xs text-mute">{v.djs} on deck</p>
      )}

      <nav aria-label={`${v.name} rooms`} className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <Link key={a.label} href={a.href(v.id)} className="rounded-pill">
            <Pill>{a.label}</Pill>
          </Link>
        ))}
      </nav>
    </Card>
  );
}
