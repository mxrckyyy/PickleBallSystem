import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';

const VARIANTS = {
  info: { classes: 'border-blue-200 bg-blue-50 text-blue-900', Icon: Info },
  success: { classes: 'border-emerald-200 bg-emerald-50 text-emerald-900', Icon: CheckCircle2 },
  warning: { classes: 'border-amber-200 bg-amber-50 text-amber-900', Icon: TriangleAlert },
  danger: { classes: 'border-red-200 bg-red-50 text-red-900', Icon: AlertCircle },
};

/** Inline status message used for error / empty / warning states. */
export function Alert({ variant = 'info', title, children, className = '', ...props }) {
  const { classes, Icon } = VARIANTS[variant] ?? VARIANTS.info;
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${classes} ${className}`.trim()}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5' : ''}>{children}</div> : null}
      </div>
    </div>
  );
}
