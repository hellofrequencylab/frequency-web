import * as React from "react";
import { cn } from "./cn";

/**
 * Checkbox — an accessible checkbox for Resonance.
 *
 * A real native `<input type="checkbox">` (visually hidden but focusable and in
 * the tab order) paired with a styled box. Checked state shows a visible check
 * glyph and the indeterminate state a dash glyph, so state is never color-only.
 * The box fills with the Pulse accent when checked/indeterminate.
 *
 * Accessibility:
 * - Native input keeps full keyboard support (Space toggles) and form semantics.
 * - When a `label` is given it is associated via htmlFor/id (auto via useId).
 * - The global `:focus-visible` Pulse ring shows on the box via `peer-focus-visible`.
 * - `indeterminate` is reflected to the DOM input property (not just visuals).
 * - 44px min hit target via the wrapping row.
 * - Tokens only; no hardcoded hex.
 */

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Optional visible label rendered next to the box. */
  label?: React.ReactNode;
  /** Tri-state visual; reflected to the input's `indeterminate` property. */
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, indeterminate, disabled, className, id, checked, ...rest },
  ref,
) {
  const autoId = React.useId();
  const controlId = id ?? `${autoId}-checkbox`;

  const innerRef = React.useRef<HTMLInputElement | null>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <span className={cn("inline-flex min-h-11 items-center gap-3", className)}>
      <span className="relative inline-flex">
        <input
          ref={innerRef}
          id={controlId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-checked={indeterminate ? "mixed" : undefined}
          className="peer absolute inset-0 m-0 h-5 w-5 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          aria-hidden="true"
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-sm border bg-base text-text",
            "[&>.rs-check]:opacity-0 peer-checked:[&>.rs-check]:opacity-100",
            "peer-checked:border-pulse peer-checked:bg-pulse",
            "peer-disabled:opacity-50",
            // Pulse ring follows the hidden input's focus state.
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pulse",
            indeterminate && "border-pulse bg-pulse",
          )}
        >
          {indeterminate ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <path d="M3 6h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              className="rs-check"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 6.5l2.5 2.5 4.5-5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      </span>
      {label && (
        <label htmlFor={controlId} className={cn("text-sm text-soft", disabled && "opacity-50")}>
          {label}
        </label>
      )}
    </span>
  );
});
