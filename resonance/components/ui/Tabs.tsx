"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Tabs — an accessible tab strip (DESIGN.md §10, §8).
 *
 * Simple data-driven API: pass `items`, an optional controlled `value` +
 * `onChange`, and render the matching panel yourself (Tabs owns the strip and
 * accessibility wiring, not the panel content). Renders the optional
 * `children` as the active panel inside a `role="tabpanel"` when provided.
 *
 * Controlled:   <Tabs items={items} value={v} onChange={setV} />
 * Uncontrolled: <Tabs items={items} defaultValue="now" onChange={...} />
 *
 * Accessibility: roving tabindex, Left/Right/Home/End arrow navigation,
 * `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, and `aria-controls`
 * wiring. The active tab is marked with a Pulse underline AND heavier weight,
 * never color alone. 44px touch targets.
 */
export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled selected id. Omit to use `defaultValue` (uncontrolled). */
  value?: string;
  /** Initial selected id when uncontrolled. Defaults to the first item. */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Accessible name for the tablist (e.g. "Room views"). */
  "aria-label"?: string;
  className?: string;
  /** Active panel content, wrapped in a role="tabpanel". */
  children?: React.ReactNode;
}

export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
  className,
  children,
  "aria-label": ariaLabel,
}: TabsProps) {
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const [internal, setInternal] = useState<string>(
    defaultValue ?? items[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const active = isControlled ? value : internal;

  function select(id: string) {
    if (!isControlled) setInternal(id);
    onChange?.(id);
  }

  function focusTab(index: number) {
    tabRefs.current[index]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const enabled = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => !it.disabled);
    if (enabled.length === 0) return;

    const pos = enabled.findIndex(({ i }) => i === index);
    let next: number | null = null;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = enabled[(pos + 1) % enabled.length].i;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = enabled[(pos - 1 + enabled.length) % enabled.length].i;
    } else if (e.key === "Home") {
      next = enabled[0].i;
    } else if (e.key === "End") {
      next = enabled[enabled.length - 1].i;
    }

    if (next !== null) {
      e.preventDefault();
      focusTab(next);
      select(items[next].id);
    }
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex items-stretch gap-1 border-b"
      >
        {items.map((item, index) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              type="button"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => !item.disabled && select(item.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "relative inline-flex min-h-11 items-center px-3 text-sm",
                "-mb-px border-b-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-pulse font-semibold text-text"
                  : "border-transparent font-normal text-mute hover:text-soft",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {children !== undefined && active && (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active}`}
          aria-labelledby={`${baseId}-tab-${active}`}
          tabIndex={0}
        >
          {children}
        </div>
      )}
    </div>
  );
}
