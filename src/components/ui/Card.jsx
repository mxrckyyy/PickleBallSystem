export function Card({ title, description, className = '', children, ...props }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`.trim()}
      {...props}
    >
      {title ? (
        <header className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}
