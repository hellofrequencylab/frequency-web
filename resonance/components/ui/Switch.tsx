import * as React from "react";
import { cn } from "./cn";

/**
 * Switch — an accessible on/off toggle for Resonance.
 *
 * Built as a real `<button role="switch">` with `aria-checked`, so it is keyboard
 * operable (Space/Enter activate the button natively) and announced as a switch.
 * The knob animates with `var(--dur-fast) var(--ease-out)`.
 *
 * Checked state is conveyed two ways, never color alone:
 * - the track fills with the Pulse accent, AND
 * - the knob slides to the trailing edge (position change).
 *
 * Accessibility:
 * - When a `label` is given it renders beside the control and is associated by
 *   wrapping; the switch also carries an `aria-label` fallback when no label node
 *   is provided via `aria-label`/`aria-labelledby` on the rest props.
 * - 44px min hit target via the wrapping control row.
 * - Tokens only; no hardcoded hex.
 */

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "type"> {
  /** Controlled checked state. */
  checked: boolean;
  /** Fired with the next checked value on toggle. */
  onCheckedChange?: (checked: boolean) => void;
  /** Alias of onCheckedChange for form-style call sites. */
  onChange?: (checked: boolean) => void;
  /** Optional visible label rendered next to the switch. */
  label?: React.ReactNode;
  disabled?: boolean;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, onChange, label, disabled, className, id, ...rest },
  ref,
) {
  const autoId = React.useId();
  const controlId = id ?? `${autoId}-switch`;
  const labelId = `${autoId}-label`;

  function toggle() {
    if (disabled) return;
    onCheckedChange?.(!checked);
    onChange?.(!checked);
  }

  const button = (
    <button
      ref={ref}
      type="button"
      role="switch"
      id={controlId}
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        // 44px min target; track is the visual element inside.
        "inline-flex min-h-11 shrink-0 items-center disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-pill border",
          checked ? "bg-pulse" : "bg-raised",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0.5 h-5 w-5 rounded-pill bg-text",
            checked && "translate-x-5",
          )}
          style={{ transition: "transform var(--dur-fast) var(--ease-out)" }}
        />
      </span>
    </button>
  );

  if (!label) return button;

  return (
    <span className="inline-flex items-center gap-3">
      {button}
      <label
        id={labelId}
        htmlFor={controlId}
        className={cn("text-sm text-soft", disabled && "opacity-50")}
      >
        {label}
      </label>
    </span>
  );
});
