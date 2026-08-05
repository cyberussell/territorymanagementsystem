import { RefreshCw } from 'lucide-react'
import type { PartnershipWithProgress } from '@/lib/territory-management-system/modules/assignment/types'
import Card from '@/components/territory-management-system/dashboard/Card'

// Read-only status list for the workspace's own "All Partners" tab — deliberately NOT a Link
// into another partner's assignment (unlike PartnershipCard, which this mirrors visually). That
// page is a real, server-rendered navigation, and this tab exists specifically so a publisher
// mid-ministry never has to make one of those while offline (see PublisherBottomMenu — the old
// "All Partners" link back to the batch-landing page hard-failed with a blank browser page once
// offline). This only ever shows what was fetched at initial load (or the last manual Refresh),
// same offline-first snapshot pattern as SearchScopeRecordsList.
export default function PartnerStatusList({
  partnerships,
  refreshing,
  canRefresh,
  onRefresh,
}: {
  partnerships: PartnershipWithProgress[]
  refreshing: boolean
  // Disabled while offline — there's nothing to refresh against.
  canRefresh: boolean
  onRefresh: () => void
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-[#0B1B33]">All Partners</h2>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || !canRefresh}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {partnerships.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-600">No partners found for this batch.</Card>
      ) : (
        <div className="space-y-3">
          {partnerships.map((p) => {
            const pct = p.recordCount > 0 ? Math.round((p.completedCount / p.recordCount) * 100) : 0
            const endedEarly = Boolean(p.ended_early_at)
            const done = Boolean(p.finished_at || endedEarly)
            const status = endedEarly ? 'Ended Early' : done ? 'Done' : p.claimed_at ? 'In Progress' : 'Unclaimed'
            const statusClass = endedEarly
              ? 'bg-amber-50 text-amber-600'
              : done
                ? 'bg-emerald-50 text-emerald-600'
                : p.claimed_at
                  ? 'bg-blue-50 text-[#2563EB]'
                  : 'bg-slate-100 text-slate-500'
            return (
              <div
                key={p.id}
                className="relative overflow-hidden rounded-2xl border border-gray-300 bg-white p-4 shadow-[0_0_18px_-3px_rgba(148,163,184,0.6)]"
              >
                {p.hasBibleStudy && (
                  <span className="absolute right-4 top-0 h-1.5 w-12 rounded-b-full bg-[#4a6da7]" aria-label="Bible Study included" />
                )}
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[#0B1B33]">{p.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{status}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-50">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8]" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-slate-600">
                  {p.completedCount} of {p.recordCount} contact records completed
                  {p.dncCount > 0 && <span className="text-red-600"> · {p.dncCount} Do Not Call</span>}
                </p>
                {p.territories.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-400">
                    {p.territories.map((t) => `${t.name} — ${t.description}`).join(', ')}
                    {p.sections.length > 0 ? ` · Section ${p.sections.map((s) => s.label).join(', ')}` : ''}
                  </p>
                )}
                {endedEarly && (
                  <p className="mt-1 text-xs text-amber-600">Ended early — the remaining records weren&apos;t visited this session.</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
