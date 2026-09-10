/**
 * Shown the instant a portal page is requested, before its data arrives —
 * the shape of a page, in the portal's own colours, instead of a blank main
 * area. Pure markup: no data, no client code.
 */
export function PortalLoading() {
  return (
    <div className="p-6 space-y-6" aria-busy="true" aria-label="جارٍ التحميل">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded-xl skeleton" />
        <div className="h-4 w-80 max-w-full rounded-lg skeleton" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl skeleton" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="h-72 rounded-2xl skeleton" />
    </div>
  )
}
