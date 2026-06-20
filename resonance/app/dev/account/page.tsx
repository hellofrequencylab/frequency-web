"use client";

import { useState } from "react";
import Link from "next/link";
import { authedFetch } from "@/lib/api/fetch";

/**
 * Account data controls (build plan: Data governance). Download a JSON export of
 * your own data, or delete it. Deletion is gated behind typing DELETE so it
 * cannot fire by accident, and the result shows what was removed per table.
 */
export default function AccountPage() {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<Record<string, number> | null>(null);

  const download = async () => {
    setError("");
    setBusy("export");
    try {
      const res = await authedFetch("/api/account/export", { cache: "no-store" });
      if (!res.ok) {
        setError("Export failed. Make sure you are signed in.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resonance-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  const purge = async () => {
    setError("");
    setDeleted(null);
    setBusy("delete");
    try {
      const res = await authedFetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        deleted?: Record<string, number>;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Delete failed. Make sure you are signed in.");
        return;
      }
      setDeleted(body.deleted ?? {});
      setConfirm("");
    } finally {
      setBusy(null);
    }
  };

  const armed = confirm === "DELETE";

  return (
    <main style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Your data</h1>
      <p style={{ fontSize: 13 }}>
        <Link href="/">Home</Link>
      </p>
      <p style={{ fontSize: 14, color: "#555" }}>
        Download everything Resonance stores about you, or delete it. Both actions
        only ever touch your own account.
      </p>

      <section style={{ margin: "1.5rem 0" }}>
        <h2 style={{ fontSize: 16 }}>Download my data</h2>
        <p style={{ fontSize: 13, color: "#666" }}>
          Exports your rows across every table as a single JSON file.
        </p>
        <button onClick={() => void download()} disabled={busy !== null}>
          {busy === "export" ? "Preparing..." : "Download my data"}
        </button>
      </section>

      <section
        style={{
          margin: "1.5rem 0",
          border: "1px solid #fecaca",
          borderRadius: 8,
          padding: "1rem",
          background: "#fef2f2",
        }}
      >
        <h2 style={{ fontSize: 16, color: "#b91c1c" }}>Delete my data</h2>
        <p style={{ fontSize: 13, color: "#666" }}>
          This removes your profile, tickets, votes, queue items, inventory,
          scores, ledger entries, and the events you host. It cannot be undone.
          Type DELETE to confirm.
        </p>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="DELETE"
          style={{
            padding: "0.4rem 0.6rem",
            border: "1px solid #d4d4d8",
            borderRadius: 6,
            marginRight: "0.5rem",
          }}
        />
        <button
          onClick={() => void purge()}
          disabled={!armed || busy !== null}
          style={{ color: armed ? "#b91c1c" : undefined }}
        >
          {busy === "delete" ? "Deleting..." : "Delete my data"}
        </button>
      </section>

      {error && (
        <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>
      )}

      {deleted && (
        <section style={{ margin: "1rem 0" }}>
          <h2 style={{ fontSize: 16 }}>Deleted</h2>
          <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              {Object.entries(deleted).map(([table, count]) => (
                <tr key={table}>
                  <td style={{ padding: "0.15rem 1rem 0.15rem 0", color: "#555" }}>
                    {table}
                  </td>
                  <td style={{ padding: "0.15rem 0" }}>
                    {count < 0 ? "skipped" : `${count} rows`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
