import { useState } from 'react'
import { MapPin, RefreshCw } from 'lucide-react'
import type { TerritoryRecordWithLocation } from '@/lib/territory-management-system/modules/records/types'
import Card from '@/components/territory-management-system/dashboard/Card'
import ConfirmModal from '@/components/territory-management-system/ConfirmModal'

// Whatever records already exist in an overflow batch's chosen search area (see
// getRecordsInBlocks/025_overflow_search_scope.sql) — read-only by design (these were never
// assigned to this partnership, and someone else did the original data entry), shown so a
// publisher searching the area can check "has someone already logged this address" before
// adding a new one. The manual Refresh button re-fetches live rather than relying on the
// initial page load, since the whole point is catching a record added moments ago by someone
// else still working the same area.
//
// "Juan & Maria" / "Juan & Maria and Pedro & Ana" / "Juan & Maria, Pedro & Ana, and Rosa" — an
// Oxford-comma list, matching how a Ministry Partner's own name is written (multiple people, one
// partnership name per entry).
function formatPartnerNames(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

// Deliberately not tappable into a detail/edit view — these records aren't this partnership's
// to update. The only action is "View on Map" (opens Google Maps directly), gated behind a
// branded popup naming specifically who else currently has this block locked for search today
// (see getPartnersSearchingBlocks) — falls back to a generic heads-up when no one else does.
export default function SearchScopeRecordsList({
  sectionLabel,
  blockLabels,
  records,
  blockPartners,
  refreshing,
  onRefresh,
  showAreaLabel = true,
}: {
  sectionLabel: string
  blockLabels: string[]
  records: TerritoryRecordWithLocation[]
  // Which OTHER Ministry Partner(s), by name, currently have each block locked for search today
  // — keyed by block id, absent/empty when no one else does. See PartnershipWorkspace's own
  // searchScopeBlockPartners field for the full explanation.
  blockPartners: Record<string, string[]>
  refreshing: boolean
  onRefresh: () => void
  // The caller may already show the Section/Block line as part of a page-level "Area To
  // Search" header (see PublisherWorkspaceApp's List tab) — set false there to avoid repeating
  // it right underneath.
  showAreaLabel?: boolean
}) {
  const [mapConfirmFor, setMapConfirmFor] = useState<TerritoryRecordWithLocation | null>(null)
  const confirmPartnerNames = mapConfirmFor?.block?.id ? (blockPartners[mapConfirmFor.block.id] ?? []) : []

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-[#0B1B33]">Existing Records in This Area</h2>
          {showAreaLabel && (
            <p className="text-xs text-slate-500">
              Section {sectionLabel} — Block{blockLabels.length === 1 ? '' : 's'} {blockLabels.join(', ')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {records.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-600">
          No records here yet — search the area and add any households you find.
        </Card>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const content = (
              <>
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#0B1B33]">
                    {r.address || r.plus_code || 'Unlabeled record'}
                    {r.unit ? `, ${r.unit}` : ''}
                  </p>
                  {r.resident_name && <p className="truncate text-xs text-slate-600">{r.resident_name}</p>}
                  <p className="truncate text-xs text-slate-400">
                    Sec {r.section?.label ?? '—'} / Blk {r.block?.label ?? '—'}
                  </p>
                </div>
                {r.plus_code && (
                  <span
                    aria-hidden="true"
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-[#2563EB]"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Map
                  </span>
                )}
              </>
            )
            // The whole card is the tap target (not just the Map pill) — tapping anywhere opens
            // the ownership + map popup below. Only tappable when there's a Plus Code to show on
            // a map at all; otherwise it's a plain, non-interactive row.
            return r.plus_code ? (
              <button
                key={r.id}
                type="button"
                onClick={() => setMapConfirmFor(r)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-blue-100/60 bg-white p-3 text-left shadow-sm transition hover:border-[#38BDF8]/40"
              >
                {content}
              </button>
            ) : (
              <div key={r.id} className="flex w-full items-center justify-between gap-3 rounded-xl border border-blue-100/60 bg-white p-3 shadow-sm">
                {content}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmModal
        open={mapConfirmFor !== null}
        title="Not your assigned record"
        message={
          confirmPartnerNames.length > 0
            ? `This block is currently being searched by ${formatPartnerNames(confirmPartnerNames)}. You can still view its location on the map.`
            : 'No other Ministry Partner currently has this block locked for search — you may be the only one working this area today. You can still view its location on the map.'
        }
        confirmLabel="Open Maps"
        variant="info"
        onConfirm={() => {
          if (mapConfirmFor?.plus_code) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapConfirmFor.plus_code)}`, '_blank', 'noopener,noreferrer')
          }
          setMapConfirmFor(null)
        }}
        onCancel={() => setMapConfirmFor(null)}
      />
    </div>
  )
}
