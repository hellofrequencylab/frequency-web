import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * EmptyState — the designed empty state for any list or surface (DESIGN.md §7).
 *
 * Server-safe. Per the spec, every list has one of these: a line of copy and the
 * one action, never a bare blank. Centered and muted so it recedes until there is
 * something to show.
 *
 * Props:
 *   - `icon`        — an optional decorative glyph/illustration slot (rendered
 *                     `aria-hidden`; meaning lives in the title, not the icon).
 *   - `title`       — the short headline (required). Caller supplies copy.
 *   - `description` — an optional supporting line.
 *   - `action`      — an optional slot for a single Button (the one obvious move).
 *
 * Copy is passed by the caller; built-in strings here stay plain and em-dash-free
 * per the voice rule. a11y: the title renders as a real heading.
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action, className, ...rest }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center",
        className,
      )}
      {...rest}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-pill bg-raised text-2xl text-mute [&>svg]:h-6 [&>svg]:w-6"
        >
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-display text-lg text-soft">{title}</h3>
        {description && <p className="mx-auto max-w-xs text-sm text-mute">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
