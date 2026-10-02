export function Skeleton({ className = '', ...props }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-slate-200 ${className}`.trim()}
      {...props}
    />
  );
}
