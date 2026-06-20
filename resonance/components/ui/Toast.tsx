"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Toast — transient, non-blocking feedback (DESIGN.md §10).
 *
 * Three pieces:
 *   - `ToastProvider` — wrap the app (or a subtree). Owns the queue and renders
 *     the visual stack in the corner.
 *   - `useToast()`    — returns `{ toast, dismiss }`. Call `toast({ title, ... })`
 *     from anywhere under the provider to enqueue one.
 *   - the stack view  — bottom-right, auto-dismissing, each toast dismissible.
 *
 * tone (`neutral` | `success` | `alert`) shows an icon AND a color, never color
 * alone (DESIGN.md §8). `success` reads on `--signal`, `alert` on `--alert`.
 *
 * a11y: the live region is `role="status"` + `aria-live="polite"` so screen
 * readers announce new toasts without stealing focus. Each toast has a labelled
 * dismiss button. Entrance uses the base motion token and collapses under the
 * global reduced-motion guard.
 */
export type ToastTone = "neutral" | "success" | "alert";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms. Default 5000. Pass 0 to keep until dismissed. */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, "description">> {
  id: string;
  description?: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Access the toast API. Must be called under a `ToastProvider`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>.");
  }
  return ctx;
}

const TONE_STYLES: Record<ToastTone, string> = {
  neutral: "text-soft",
  success: "text-signal",
  alert: "text-alert",
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  // Decorative; the title carries the meaning. Stroke uses the tone color via
  // currentColor on the parent.
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5 shrink-0",
    "aria-hidden": true,
  };
  if (tone === "success") {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  if (tone === "alert") {
    return (
      <svg {...common}>
        <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </svg>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (item.duration <= 0) return;
    timer.current = setTimeout(() => onDismiss(item.id), item.duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3",
        "rounded-md border bg-raised p-3 text-text shadow-[var(--shadow-soft)]",
        "motion-safe:animate-[rs-toast-in_var(--dur-base)_var(--ease-out)]",
      )}
    >
      <span className={TONE_STYLES[item.tone]}>
        <ToneIcon tone={item.tone} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{item.title}</p>
        {item.description && <p className="mt-0.5 text-xs text-mute">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-mute transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-hover hover:text-text"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: ToastItem = {
      id,
      title: options.title,
      description: options.description,
      tone: options.tone ?? "neutral",
      duration: options.duration ?? 5000,
    };
    setItems((prev) => [...prev, item]);
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-end justify-end gap-2 p-4"
      >
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
      <style>{`
        @keyframes rs-toast-in { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
      `}</style>
    </ToastContext.Provider>
  );
}
