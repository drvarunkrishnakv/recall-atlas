/** A soft shimmer in the shape of a page (a title, a few lines, a table) while it loads. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <article className="page skeleton" role="status" aria-label={label}>
      <span className="sk sk-pills" />
      <span className="sk sk-title" />
      <span className="sk sk-line" />
      <span className="sk sk-line" />
      <span className="sk sk-line short" />
      <span className="sk sk-block" />
      <span className="sk sk-line" />
      <span className="sk sk-line short" />
    </article>
  );
}
