import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Card } from "@/components/ui";

const ROOMS = [
  {
    type: "DJ rooms",
    blurb: "Take a seat and spin. The floor votes, and the crowd decides who keeps the decks.",
  },
  {
    type: "Watch parties",
    blurb: "One host runs the video. Everyone watches together, in sync, to the second.",
  },
  {
    type: "Lounges",
    blurb: "Always-on music. Walk in and something is already playing.",
  },
];

const SURFACES = [
  { href: "/dev/lobby", label: "Lobby", note: "Browse rooms, open a new one, and step inside." },
  { href: "/dev/discover", label: "Discover", note: "What is happening across every world right now." },
  { href: "/dev/events", label: "Events", note: "What is coming up. RSVP or grab a ticket." },
  { href: "/dev/market", label: "Market", note: "Spend Zaps on frames, colors, and badges." },
  { href: "/dev/earnings", label: "Earnings", note: "What your cosmetics have earned you in Zaps." },
  { href: "/dev/moderation", label: "Moderation", note: "Report a problem or block someone." },
  { href: "/dev/account", label: "Your data", note: "Download or delete the data we hold for you." },
  { href: "/dev/dj", label: "Quick room", note: "Jump straight into one DJ room." },
  { href: "/dev/sync", label: "Sync demo", note: "The raw playback clock. Two windows, one follows." },
];

export default function Home() {
  return (
    <AppShell>
      <div className="space-y-10">
        <header className="space-y-3">
          <h1 className="font-display text-3xl text-text">Resonance</h1>
          <p className="max-w-prose text-lg text-soft">
            A little world you can drop into. Pick a room, take the decks, or just hang.
          </p>
          <div>
            <Link
              href="/dev/lobby"
              className="inline-flex min-h-11 items-center justify-center rounded-sm border border-transparent bg-pulse px-4 text-sm font-medium text-text transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-[var(--color-pulse-strong)]"
            >
              Enter the lobby
            </Link>
          </div>
        </header>

        <section className="space-y-3">
          <h2 className="font-display text-xl text-text">Three kinds of room</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {ROOMS.map((r) => (
              <Card key={r.type} className="space-y-1">
                <h3 className="font-display text-lg text-text">{r.type}</h3>
                <p className="text-sm text-mute">{r.blurb}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl text-text">Jump in</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SURFACES.map((s) => (
              <Link key={s.href} href={s.href} className="rounded-md">
                <Card interactive className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-text">{s.label}</span>
                    <span className="block text-sm text-mute">{s.note}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-mute">
                    →
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <p className="text-xs text-mute">
          Built one section at a time. Roadmap in{" "}
          <code className="font-mono">docs/BUILD-PLAN.md</code>.
        </p>
      </div>
    </AppShell>
  );
}
