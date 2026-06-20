"use client";

import { useState } from "react";
import { authedFetch } from "@/lib/api/fetch";
import { AppShell } from "@/components/shell/AppShell";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  ToastProvider,
  useToast,
} from "@/components/ui";

/**
 * Account data controls (build plan: Data governance). Download a JSON export of
 * your own data, or delete it. Deletion is gated behind typing DELETE so it
 * cannot fire by accident, and the result shows what was removed per table.
 */
function AccountSurface() {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState<Record<string, number> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      setConfirmOpen(false);
      toast({ title: "Your data is deleted.", tone: "success" });
    } finally {
      setBusy(null);
    }
  };

  const armed = confirm === "DELETE";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl text-text">Your data</h1>
        <p className="text-sm text-mute">
          Download everything Resonance stores about you, or delete it. Both
          actions only ever touch your own account.
        </p>
      </header>

      <Card as="section" padding="lg" className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg text-text">Download my data</h2>
          <p className="text-sm text-mute">
            Exports your rows across every table as a single JSON file.
          </p>
        </div>
        <Button
          variant="primary"
          loading={busy === "export"}
          disabled={busy !== null}
          onClick={() => void download()}
        >
          {busy === "export" ? "Preparing" : "Download my data"}
        </Button>
      </Card>

      <Card as="section" padding="lg" className="space-y-3 border-alert/40">
        <div className="space-y-1">
          <h2 className="font-display text-lg text-alert">Delete my data</h2>
          <p className="text-sm text-mute">
            This removes your profile, tickets, votes, queue items, inventory,
            scores, ledger entries, and the events you host. It cannot be undone.
            Type DELETE to confirm.
          </p>
        </div>
        <Field label="Type DELETE to confirm">
          <Input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
          />
        </Field>
        <Button
          variant="danger"
          disabled={!armed || busy !== null}
          onClick={() => setConfirmOpen(true)}
        >
          Delete my data
        </Button>
      </Card>

      {error && (
        <Card as="section" padding="md" className="border-alert/40">
          <p className="text-sm text-alert">{error}</p>
        </Card>
      )}

      {deleted && (
        <Card as="section" padding="lg" className="space-y-3">
          <h2 className="font-display text-lg text-text">Deleted</h2>
          <dl className="divide-y divide-[var(--color-line)] text-sm">
            {Object.entries(deleted).map(([table, count]) => (
              <div key={table} className="flex items-center justify-between py-1.5">
                <dt className="text-soft">{table}</dt>
                <dd className="text-mute">
                  {count < 0 ? "skipped" : `${count} rows`}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (busy !== "delete") setConfirmOpen(false);
        }}
        title="Delete your data"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={busy === "delete"}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy === "delete"}
              disabled={!armed || busy !== null}
              onClick={() => void purge()}
            >
              Delete my data
            </Button>
          </>
        }
      >
        <p className="text-sm text-soft">
          This permanently removes your data across every table. It cannot be
          undone.
        </p>
      </Modal>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AppShell>
      <ToastProvider>
        <AccountSurface />
      </ToastProvider>
    </AppShell>
  );
}
