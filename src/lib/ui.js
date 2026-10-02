const VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:bg-brand-700',
  secondary: 'bg-slate-900 text-white hover:bg-slate-800',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

const SIZES = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/** Class string for elements that must look like a Button but are links (`<Link>`, `<a>`). */
export function buttonClasses({ variant = 'primary', size = 'md', className = '' } = {}) {
  return [
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}
