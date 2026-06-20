import * as React from "react";
import { cn } from "./cn";

/**
 * Field — labeled form controls for Resonance.
 *
 * Exposes `Field` (a label + optional hint/error wrapper around one control) and
 * the controls `Input`, `Textarea`, `Select`. Controls sit on `bg-base`/`bg-raised`
 * with a line-token `border`, 44px min height, and `text-mute` placeholders. They
 * keep the global `:focus-visible` Pulse ring (outlines are never removed).
 *
 * Accessibility:
 * - Every control is associated with its `<label>` via `htmlFor`/`id`; ids are
 *   generated with `React.useId` when not supplied.
 * - `required` is conveyed in text ("Required"), not color alone.
 * - On `error`, the control gets `aria-invalid` and the message is wired through
 *   `aria-describedby`; hints are described the same way. The border restyles to
 *   the alert token, but the error text carries the meaning.
 * - Tokens only; no hardcoded hex.
 */

type FieldOwnProps = {
  /** Visible label text, associated to the control via htmlFor/id. */
  label: React.ReactNode;
  /** Optional helper text shown below the control (when no error). */
  hint?: React.ReactNode;
  /** Error message. When set, the control reads as invalid. */
  error?: React.ReactNode;
  /** Marks the control required and shows a "Required" affordance in text. */
  required?: boolean;
  /** Explicit id for the control; auto-generated when omitted. */
  id?: string;
};

export interface FieldProps extends FieldOwnProps {
  /**
   * The control. Receives `id`, `aria-describedby`, `aria-invalid`, and `required`
   * injected from the Field so a11y wiring stays in one place.
   */
  children: React.ReactElement<ControlInjectedProps>;
  /** Class applied to the field wrapper. */
  className?: string;
}

type ControlInjectedProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
};

/** Shared control props: the inputs render bare so `Field` owns label/error. */
type ControlA11yProps = {
  error?: boolean;
};

const controlBase =
  "min-h-11 w-full rounded-sm border bg-base px-3 py-2 text-sm text-text " +
  "placeholder:text-mute transition-colors " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function controlClasses(error?: boolean, extra?: string) {
  // Error restyles the border to the alert token; focus ring stays global.
  return cn(controlBase, error && "border-alert", extra);
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, ControlA11yProps {}

/** Single-line text input. Pass `error` to flag the invalid border. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, ...rest },
  ref,
) {
  return <input ref={ref} className={controlClasses(error, className)} {...rest} />;
});

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    ControlA11yProps {}

/** Multi-line text input. Grows with `rows`; same token surface as Input. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={controlClasses(error, cn("min-h-[6rem] resize-y", className))}
      {...rest}
    />
  );
});

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>,
    ControlA11yProps {}

/**
 * Native `<select>` (kept native for a11y) styled to match, with a chevron drawn
 * in the trailing slot. The element keeps full keyboard and screen-reader support.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, error, children, ...rest },
  ref,
) {
  return (
    <span className="relative block">
      <select
        ref={ref}
        className={controlClasses(error, cn("cursor-pointer appearance-none pr-9", className))}
        {...rest}
      >
        {children}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-mute"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </span>
  );
});

/**
 * Field — wraps a control with a label and hint/error, owning the a11y wiring.
 * Clones its single child control to inject `id`, `aria-describedby`,
 * `aria-invalid`, and `required`.
 */
export function Field({ label, hint, error, required, id, children, className }: FieldProps) {
  const autoId = React.useId();
  const controlId = id ?? `${autoId}-control`;
  const hintId = `${autoId}-hint`;
  const errorId = `${autoId}-error`;

  const describedBy =
    cn(error ? errorId : undefined, hint ? hintId : undefined) || undefined;

  const control = React.cloneElement(children, {
    id: controlId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    required: required || children.props.required,
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={controlId} className="text-sm font-medium text-soft">
        {label}
        {required && (
          <span className="ml-1 text-xs font-normal text-mute">(Required)</span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-mute">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-alert">
          {error}
        </p>
      )}
    </div>
  );
}
