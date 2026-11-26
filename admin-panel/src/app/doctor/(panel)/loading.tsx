/** Shown at once when a doctor panel page is opened, until the page is ready */
export default function DoctorPanelLoading() {
  return (
    <main className="min-w-0 p-3 sm:p-5 space-y-3 max-w-[1100px]" aria-busy="true" aria-label="Loading">
      <div className="space-y-1.5">
        <div className="h-5 w-44 rounded-lg bg-gray-200/80 animate-pulse" />
        <div className="h-3 w-64 rounded bg-gray-200/60 animate-pulse" />
      </div>
      <div className="h-28 rounded-2xl bg-white border border-gray-200 animate-pulse" />
      <div className="h-64 rounded-2xl bg-white border border-gray-200 animate-pulse" />
    </main>
  );
}
