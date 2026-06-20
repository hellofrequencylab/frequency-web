"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import { useBlocks } from "@/components/moderation/useBlocks";
import { AppShell } from "@/components/shell/AppShell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Textarea,
} from "@/components/ui";

type Report = {
  id: string;
  reporterUserId: string;
  subjectUserId: string | null;
  venueId: string | null;
  reason: string;
  detail: string | null;
  status: string;
  createdAt: string;
};

async function fetchReports(): Promise<Report[]> {
  const res = await authedFetch("/api/reports", { cache: "no-store" });
  if (!res.ok) return [];
  const j = (await res.json()) as { reports: Report[] };
  return j.reports;
}

/**
 * Dev surface for moderation & safety. File a report, manage your block list,
 * and view open reports. Built for testing the moderation primitives; the
 * member-facing surfaces compose these same APIs later.
 */
export default function ModerationPage() {
  const { blocked, block, unblock } = useBlocks();
  const [reports, setReports] = useState<Report[]>([]);

  const [subject, setSubject] = useState("");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [blockId, setBlockId] = useState("");
  const [note, setNote] = useState("");

  const reloadReports = () => {
    void (async () => {
      setReports(await fetchReports());
    })();
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      const r = await fetchReports();
      if (active) setReports(r);
    })();
    return () => {
      active = false;
    };
  }, []);

  const submitReport = async () => {
    if (!reason.trim()) return;
    const res = await authedFetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectUserId: subject.trim() || undefined,
        reason: reason.trim(),
        detail: detail.trim() || undefined,
      }),
    });
    if (res.ok) {
      setSubject("");
      setReason("");
      setDetail("");
      setNote("Report filed.");
      reloadReports();
    } else {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setNote(j.error ?? "Could not file the report.");
    }
  };

  const addBlock = async () => {
    if (!blockId.trim()) return;
    await block(blockId.trim());
    setBlockId("");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl text-text">Moderation</h1>
          <p className="text-sm text-mute">
            File a report, manage your block list, and review open reports.
          </p>
        </header>

        <Card as="section" padding="lg" className="space-y-4">
          <h2 className="font-display text-lg text-text">File a report</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitReport();
            }}
            className="space-y-3"
          >
            <Field label="Subject user id" hint="Optional">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="subject user id"
              />
            </Field>
            <Field label="Reason">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. harassment"
              />
            </Field>
            <Field label="Detail" hint="Optional">
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="What happened?"
                rows={3}
              />
            </Field>
            <Button type="submit" variant="primary">
              File report
            </Button>
          </form>
          {note && <p className="text-sm text-mute">{note}</p>}
        </Card>

        <Card as="section" padding="lg" className="space-y-4">
          <h2 className="font-display text-lg text-text">Your blocks</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void addBlock();
            }}
            className="flex items-end gap-2"
          >
            <Field label="User id to block" className="flex-1">
              <Input
                value={blockId}
                onChange={(e) => setBlockId(e.target.value)}
                placeholder="user id"
              />
            </Field>
            <Button type="submit" variant="ghost">
              Block
            </Button>
          </form>
          <div className="space-y-2">
            {blocked.map((id) => (
              <div
                key={id}
                className="flex items-center justify-between gap-3 rounded-sm border bg-base px-3 py-2"
              >
                <code className="truncate font-mono text-xs text-soft">{id}</code>
                <Button variant="quiet" size="sm" onClick={() => void unblock(id)}>
                  Unblock
                </Button>
              </div>
            ))}
            {blocked.length === 0 && (
              <p className="text-sm text-mute">You have not blocked anyone.</p>
            )}
          </div>
        </Card>

        <section className="space-y-3">
          <h2 className="font-display text-lg text-text">Open reports</h2>
          <div className="space-y-3">
            {reports.map((r) => (
              <Card key={r.id} as="article" padding="md" className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text">{r.reason}</span>
                  <Badge tone="neutral">{r.status}</Badge>
                </div>
                {r.detail && <p className="text-sm text-soft">{r.detail}</p>}
                <p className="text-xs text-mute">
                  {r.subjectUserId ? `subject ${r.subjectUserId} · ` : ""}
                  {r.venueId ? `venue ${r.venueId} · ` : ""}
                  by {r.reporterUserId}
                </p>
              </Card>
            ))}
            {reports.length === 0 && (
              <Card padding="none">
                <EmptyState
                  title="No open reports"
                  description="Filed reports show up here while they are open."
                />
              </Card>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
