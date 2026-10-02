import { forwardRef, useId } from 'react';

/**
 * Labelled text input with error/hint wiring.
 * Errors are announced via aria-invalid + aria-describedby (accessibility).
 */
export const Input = forwardRef(function Input(
  { label, hint, error, required = false, id: idProp, className = '', type = 'text', ...props },
  ref,
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required ? (
            <span className="ml-1 text-red-600" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <input
        ref={ref}
        id={id}
        type={type}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          'h-11 w-full rounded-lg border bg-white px-3 text-sm text-slate-900',
          'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-600/40',
          'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500',
          error ? 'border-red-400 focus:ring-red-300' : 'border-slate-300',
        ].join(' ')}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
