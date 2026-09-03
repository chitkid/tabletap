/**
 * Every block reserves the height the real thing will take, so the menu does not jump when it
 * arrives. No shimmer and no pulse: motion is an M6 deliverable.
 */
export default function MenuLoading() {
  return (
    <div
      role="status"
      aria-label="Loading the menu"
      className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-28"
    >
      <div className="h-9 w-1/2 animate-none rounded-md bg-muted" />
      <div className="h-11 w-full animate-none rounded-full bg-muted" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div key={row} className="min-h-32 animate-none rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}
