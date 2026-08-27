type Span = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export function Card({
  title,
  span = 12,
  note,
  error,
  children,
}: {
  title?: string;
  span?: Span;
  note?: string;
  error?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section className={`card span-${span}`}>
      {title && <h3>{title}</h3>}
      {error ? <div className="inline-error">{error}</div> : children}
      {note && !error && <div className="card-note">{note}</div>}
    </section>
  );
}
