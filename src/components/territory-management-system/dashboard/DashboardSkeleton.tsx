// Generic loading placeholder for every TMS dashboard route — a page-header bar plus a grid of
// card-shaped blocks covers the shape of every screen in this product (stat cards, tables,
// forms all render as roughly card-sized rectangles), so one skeleton suffices instead of a
// bespoke one per page. Mirrors the pattern already proven in the Laundry Management System.
export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-blue-100/60" />
        <div className="h-4 w-72 rounded-lg bg-blue-50" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-blue-100/60 bg-white" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-blue-100/60 bg-white" />
    </div>
  )
}
