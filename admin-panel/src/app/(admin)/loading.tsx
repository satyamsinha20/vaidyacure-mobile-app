/** Shown at once when an admin page is opened, until the page is ready */
export default function AdminLoading() {
  return (
    <main className="flex-1 p-3 sm:p-4 lg:p-5 overflow-y-auto max-w-[1240px] w-full mx-auto space-y-3" aria-busy="true" aria-label="Loading">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-xl bg-white border border-gray-200" />
        <div className="space-y-1.5">
          <div className="h-5 w-44 rounded-lg bg-gray-200/80 animate-pulse" />
          <div className="h-3 w-64 rounded bg-gray-200/60 animate-pulse" />
        </div>
      </div>
      <div className="h-28 rounded-2xl bg-white border border-gray-200 animate-pulse" />
      <div className="h-64 rounded-2xl bg-white border border-gray-200 animate-pulse" />
    </main>
  );
}
