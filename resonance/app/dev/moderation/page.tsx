"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/api/fetch";
import { useBlocks } from "@/components/moderation/useBlocks";

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
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <p>
        <Link href="/">← Back</Link>
      </p>
      <h1>Moderation</h1>

      <section style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}>
        <h3>File a report</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitReport();
          }}
          style={{ display: "grid", gap: "0.5rem" }}
        >
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="subject user id (optional)"
            style={{ padding: "0.4rem" }}
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="reason (e.g. harassment)"
            style={{ padding: "0.4rem" }}
          />
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="detail (optional)"
            rows={3}
            style={{ padding: "0.4rem" }}
          />
          <button type="submit" style={{ justifySelf: "start" }}>
            File report
          </button>
        </form>
        {note && <p style={{ color: "#888", fontSize: 13 }}>{note}</p>}
      </section>

      <section style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}>
        <h3>Your blocks</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addBlock();
          }}
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <input
            value={blockId}
            onChange={(e) => setBlockId(e.target.value)}
            placeholder="user id to block"
            style={{ flex: 1, minWidth: "12rem", padding: "0.4rem" }}
          />
          <button type="submit">Block</button>
        </form>
        <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
          {blocked.map((id) => (
            <div
              key={id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid #f0f0f0",
                borderRadius: 6,
                padding: "0.4rem 0.6rem",
              }}
            >
              <code style={{ fontSize: 12 }}>{id}</code>
              <button onClick={() => void unblock(id)}>Unblock</button>
            </div>
          ))}
          {blocked.length === 0 && (
            <p style={{ color: "#888", fontSize: 13 }}>You have not blocked anyone.</p>
          )}
        </div>
      </section>

      <section style={{ border: "1px solid #e4e4e7", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}>
        <h3>Open reports</h3>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {reports.map((r) => (
            <div
              key={r.id}
              style={{
                border: "1px solid #f0f0f0",
                borderRadius: 6,
                padding: "0.6rem 0.75rem",
              }}
            >
              <div>
                <b>{r.reason}</b>{" "}
                <span style={{ color: "#888", fontSize: 12 }}>· {r.status}</span>
              </div>
              {r.detail && <div style={{ fontSize: 13, color: "#555" }}>{r.detail}</div>}
              <div style={{ fontSize: 12, color: "#888", marginTop: "0.3rem" }}>
                {r.subjectUserId ? `subject ${r.subjectUserId} · ` : ""}
                {r.venueId ? `venue ${r.venueId} · ` : ""}
                by {r.reporterUserId}
              </div>
            </div>
          ))}
          {reports.length === 0 && (
            <p style={{ color: "#888", fontSize: 13 }}>No open reports.</p>
          )}
        </div>
      </section>
    </main>
  );
}
