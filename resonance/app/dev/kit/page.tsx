"use client";

import { useState } from "react";
import {
  Button,
  IconButton,
  Badge,
  Pill,
  Tabs,
  Field,
  Input,
  Textarea,
  Select,
  Switch,
  Checkbox,
  Card,
  Modal,
  ToastProvider,
  useToast,
  Tooltip,
  Skeleton,
  EmptyState,
  Avatar,
  AvatarStack,
  PresenceChip,
  LiveBadge,
  type AvatarSize,
} from "@/components/ui";

/**
 * Live component gallery (docs/DESIGN.md §10). Renders the real kit so we can see
 * and tab through every primitive and its states. Tokens reference: /dev/style.
 */
const PEOPLE = [
  { userId: "1", name: "Vera", config: { emoji: "🦊", color: "#fca5a5" } },
  { userId: "2", name: "Kit", config: { emoji: "🐙", color: "#93c5fd" } },
  { userId: "3", name: "Ria", config: { emoji: "🤖", color: "#c4b5fd" } },
  { userId: "4", name: "Sol", config: { emoji: "🐳", color: "#86efac" } },
  { userId: "5", name: "Max", config: { emoji: "👽", color: "#fdba74" } },
  { userId: "6", name: "Ash", config: { emoji: "🔥", color: "#f9a8d4" } },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="font-display text-xl mb-4">{title}</h2>
      <Card className="flex flex-wrap items-center gap-3">{children}</Card>
    </section>
  );
}

function ToastRow() {
  const { toast } = useToast();
  return (
    <>
      <Button variant="ghost" onClick={() => toast({ title: "Saved", tone: "neutral" })}>
        Toast
      </Button>
      <Button
        variant="ghost"
        onClick={() => toast({ title: "You're on the decks", tone: "success" })}
      >
        Success
      </Button>
      <Button
        variant="ghost"
        onClick={() => toast({ title: "Could not join", description: "Try again.", tone: "alert" })}
      >
        Alert
      </Button>
    </>
  );
}

function Gallery() {
  const [tab, setTab] = useState("decks");
  const [picked, setPicked] = useState(true);
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [open, setOpen] = useState(false);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-12">
        <h1 className="font-display text-3xl">Resonance kit</h1>
        <p className="text-base text-soft mt-1">
          The live component gallery. Tokens at{" "}
          <code className="font-mono text-pulse">/dev/style</code>.
        </p>
      </header>

      <Section title="Buttons">
        <Button>Take the decks</Button>
        <Button variant="ghost">Lurk</Button>
        <Button variant="quiet">Skip</Button>
        <Button variant="danger">Leave</Button>
        <Button size="sm">Small</Button>
        <Button loading>Joining</Button>
        <IconButton aria-label="React" variant="ghost">
          🔥
        </IconButton>
        <IconButton aria-label="Settings" shape="pill">
          ⚙️
        </IconButton>
      </Section>

      <Section title="Badges and pills">
        <Badge tone="neutral">Crew</Badge>
        <Badge tone="pulse">Host</Badge>
        <Badge tone="signal">Live</Badge>
        <Badge tone="spark">⚡ 240</Badge>
        <Badge tone="alert">Reported</Badge>
        <Pill>Synthwave</Pill>
        <Pill selected={picked} clickable onClick={() => setPicked((p) => !p)}>
          90s Hip-Hop
        </Pill>
      </Section>

      <Section title="Tabs">
        <div className="w-full">
          <Tabs
            items={[
              { id: "decks", label: "Decks" },
              { id: "chat", label: "Chat" },
              { id: "queue", label: "Queue" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <p className="mt-3 text-sm text-mute">Active: {tab}</p>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <Field label="Display name" hint="Lurkers can chat. DJing needs a name.">
            <Input placeholder="e.g. Vera" />
          </Field>
          <Field label="Theme" error="Pick a theme.">
            <Select defaultValue="">
              <option value="" disabled>
                Choose
              </option>
              <option>Synthwave</option>
              <option>Lo-fi</option>
            </Select>
          </Field>
          <Field label="Welcome message" required>
            <Textarea placeholder="Say hi to the room." />
          </Field>
          <div className="flex flex-col justify-center gap-3">
            <Switch checked={on} onCheckedChange={setOn} label="Auto-DJ when empty" />
            <Checkbox
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              label="Notify me when friends arrive"
            />
          </div>
        </div>
      </Section>

      <Section title="Surfaces and feedback">
        <Card interactive>Interactive card</Card>
        <Card glow>Glow / live</Card>
        <Button variant="ghost" onClick={() => setOpen(true)}>
          Open modal
        </Button>
        <Tooltip content="Sends a reaction">
          <Button variant="quiet">Hover or focus me</Button>
        </Tooltip>
        <ToastRow />
        <div className="flex items-center gap-2">
          <Skeleton width={40} height={40} rounded="pill" />
          <div className="space-y-1">
            <Skeleton width={120} height={12} />
            <Skeleton width={80} height={10} />
          </div>
        </div>
      </Section>

      <Section title="Empty state">
        <div className="w-full">
          <EmptyState
            icon="🎧"
            title="No rooms yet"
            description="Open one and people will find it."
            action={<Button>Open a room</Button>}
          />
        </div>
      </Section>

      <Section title="Identity">
        <div className="flex w-full flex-wrap items-center gap-4">
          {(["xs", "sm", "md", "lg", "xl"] as AvatarSize[]).map((s) => (
            <Avatar key={s} name="Vera" config={{ emoji: "🦊", color: "#fca5a5" }} size={s} />
          ))}
          <Avatar name="Kit" config={{ emoji: "🐙", color: "#93c5fd" }} size="lg" live />
        </div>
        <AvatarStack people={PEOPLE} max={4} />
        <PresenceChip
          name="Vera"
          config={{ emoji: "🦊", color: "#fca5a5" }}
          live
          subtitle="on the decks"
        />
        <LiveBadge state="live" count={12} />
        <LiveBadge state="quiet" />
      </Section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Take the decks?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Not yet
            </Button>
            <Button onClick={() => setOpen(false)}>Step up</Button>
          </>
        }
      >
        <p className="text-sm text-soft">
          You will join the rotation. The floor votes, and the crowd decides who keeps spinning.
        </p>
      </Modal>
    </main>
  );
}

export default function KitPage() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}
