import Link from "next/link";

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
  { href: "/dev/events", label: "Events", note: "What is coming up. RSVP or grab a ticket." },
  { href: "/dev/market", label: "Market", note: "Spend Zaps on frames, colors, and badges." },
  { href: "/dev/dj", label: "Quick room", note: "Jump straight into one DJ room." },
  { href: "/dev/sync", label: "Sync demo", note: "The raw playback clock. Two windows, one follows." },
];

export default function Home() {
  return (
    <main style={{ padding: "3rem 1.5rem", maxWidth: "44rem", margin: "0 auto", fontFamily: "system-ui" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Resonance</h1>
      <p style={{ color: "#555", fontSize: 18, marginTop: 0 }}>
        A little world you can drop into. Pick a room, take the decks, or just hang.
      </p>

      <Link
        href="/dev/lobby"
        style={{
          display: "inline-block",
          marginTop: "1rem",
          padding: "0.6rem 1.1rem",
          borderRadius: 8,
          background: "#111",
          color: "#fff",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Enter the lobby →
      </Link>

      <h2 style={{ marginTop: "2.5rem" }}>Three kinds of room</h2>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {ROOMS.map((r) => (
          <div key={r.type} style={card}>
            <b>{r.type}</b>
            <p style={{ margin: "0.25rem 0 0", color: "#555", fontSize: 14 }}>{r.blurb}</p>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: "2.5rem" }}>Jump in</h2>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "inherit" }}
          >
            <span>
              <b>{s.label}</b>
              <span style={{ color: "#888", fontSize: 13 }}> · {s.note}</span>
            </span>
            <span aria-hidden style={{ color: "#bbb" }}>→</span>
          </Link>
        ))}
      </div>

      <p style={{ color: "#aaa", fontSize: 12, marginTop: "2.5rem" }}>
        Built one section at a time. Roadmap in <code>docs/BUILD-PLAN.md</code>.
      </p>
    </main>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "0.85rem 1rem",
};
