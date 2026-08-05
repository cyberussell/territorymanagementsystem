'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import type { PartnershipWithProgress } from '@/lib/territory-management-system/modules/assignment/types'
import type { PartnershipAssignedRecordSummary } from '@/lib/territory-management-system/modules/assignment/queries'
import Card from '@/components/territory-management-system/dashboard/Card'
import { useConfirm } from '@/lib/territory-management-system/hooks/useConfirm'

// Groups a flat assigned-record list by Plus Code — same address = same household, i.e. "linked
// contacts." Records with no Plus Code at all each get their own single-entry group rather than
// being lumped together under one blank key.
function groupByHousehold(records: PartnershipAssignedRecordSummary[]): { key: string; address: string; names: string[] }[] {
  const groups = new Map<string, { address: string; names: string[] }>()
  let blankIndex = 0
  for (const r of records) {
    const key = r.plusCode || `__blank_${blankIndex++}`
    const existing = groups.get(key)
    const name = r.residentName || r.address || 'Unlabeled record'
    if (existing) {
      existing.names.push(name)
    } else {
      groups.set(key, { address: r.address || r.plusCode || 'Unlabeled record', names: [name] })
    }
  }
  return Array.from(groups.entries()).map(([key, v]) => ({ key, ...v }))
}

// Presentational — reused by both the Group Leader's own Partners tab (GroupLeaderTabs, which
// passes onEndPartnership and onLoadAssignedRecords) and the public, unauthenticated Progress
// page ("Today's Assignment Progress", which doesn't). Both being optional is what keeps the End
// Ministry action AND the assigned-records accordion off that public page — the real
// enforcement for the former is server-side in endPartnershipAction itself, and the latter
// simply never gets a way to fetch the data since the public page passes no loader at all.
export default function PartnershipList({
  partnerships,
  onEndPartnership,
  onLoadAssignedRecords,
}: {
  partnerships: PartnershipWithProgress[]
  onEndPartnership?: (partnershipId: string) => Promise<void>
  // Lazy-loaded per partnership the first time its card is tapped, not fetched upfront for every
  // partnership on the tab — see getPartnershipAssignedRecordsAction.
  onLoadAssignedRecords?: (partnershipId: string) => Promise<PartnershipAssignedRecordSummary[]>
}) {
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [recordsByPartnership, setRecordsByPartnership] = useState<Record<string, PartnershipAssignedRecordSummary[]>>({})
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleToggle(partnershipId: string) {
    if (expandedId === partnershipId) {
      setExpandedId(null)
      return
    }
    setExpandedId(partnershipId)
    if (!onLoadAssignedRecords || recordsByPartnership[partnershipId]) return
    setLoadingId(partnershipId)
    try {
      const records = await onLoadAssignedRecords(partnershipId)
      setRecordsByPartnership((prev) => ({ ...prev, [partnershipId]: records }))
    } finally {
      setLoadingId(null)
    }
  }

  if (partnerships.length === 0) {
    return <Card className="p-8 text-center text-sm text-slate-600">No Partners yet.</Card>
  }

  async function handleEnd(id: string, name: string) {
    const ok = await confirm({
      title: 'End ministry for today?',
      message: `End ${name}'s ministry for today? Any records they haven't gotten to will simply stay assigned as-is.`,
      confirmLabel: 'End Ministry',
      variant: 'caution',
    })
    if (!ok) return
    startTransition(() => {
      onEndPartnership?.(id)
    })
  }

  return (
    <>
      {ConfirmDialog}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {partnerships.map((p) => {
          const pct = p.recordCount > 0 ? Math.round((p.completedCount / p.recordCount) * 100) : 0
          // finished_at/ended_early_at (see 018_partnership_finished_at.sql) both mean "genuinely
          // done." Ending early on a zero-record ("searching a fresh territory") partnership isn't
          // a distinct/lesser status worth flagging — a publisher can stop searching any time,
          // whether they've added zero or many new records, so that case just reads as "Done."
          // But ending early on a partnership that DOES have assigned records left unvisited is
          // real, useful information for the Group Leader — surfaced as its own "Ended Early"
          // status with an explanatory note, same as before.
          const endedEarlyWithRecords = Boolean(p.ended_early_at) && p.recordCount > 0
          const done = Boolean(p.finished_at || p.ended_early_at)
          const status = endedEarlyWithRecords ? 'Ended Early' : done ? 'Done' : p.claimed_at ? 'Claimed' : 'Unclaimed'
          const statusClass = endedEarlyWithRecords
            ? 'bg-amber-50 text-amber-600'
            : done
              ? 'bg-emerald-50 text-emerald-600'
              : p.claimed_at
                ? 'bg-blue-50 text-[#2563EB]'
                : 'bg-slate-100 text-slate-500'
          const expanded = expandedId === p.id
          return (
            <Card key={p.id} className="relative overflow-hidden p-4">
              {p.hasBibleStudy && (
                <span className="absolute right-4 top-0 h-1.5 w-12 rounded-b-full bg-[#4a6da7]" aria-label="Bible Study included" />
              )}
              {onLoadAssignedRecords ? (
                <button
                  type="button"
                  onClick={() => handleToggle(p.id)}
                  aria-expanded={expanded}
                  className="mb-2 flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="flex min-w-0 items-center gap-1">
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span className="truncate font-semibold text-[#0B1B33]">{p.name}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{status}</span>
                </button>
              ) : (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-semibold text-[#0B1B33]">{p.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{status}</span>
                </div>
              )}
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8] transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-600">
                {p.completedCount > 0
                  ? `${p.completedCount} contact recorded. Note: For admin's approval`
                  : 'No contact record has been added'}
                {p.recordCount - p.completedCount > 0 ? ` · ${p.recordCount - p.completedCount} remaining` : ''}
                {p.dncCount > 0 && <span className="text-red-600"> · {p.dncCount} Do Not Call</span>}
              </p>
              {p.territories.length > 0 && (
                <p className="mt-0.5 text-xs text-slate-400">
                  {p.territories.map((t) => `${t.name} — ${t.description}`).join(', ')}
                  {p.sections.length > 0 ? ` · Section ${p.sections.map((s) => s.label).join(', ')}` : ''}
                </p>
              )}
              {endedEarlyWithRecords && (
                <p className="mt-1 text-xs text-amber-600">Ended early — the remaining records weren&apos;t visited this session.</p>
              )}
              {expanded && onLoadAssignedRecords && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  {loadingId === p.id ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading assigned records…
                    </div>
                  ) : (recordsByPartnership[p.id]?.length ?? 0) === 0 ? (
                    <p className="text-xs text-slate-400">No contact records assigned.</p>
                  ) : (
                    <div className="space-y-2">
                      {groupByHousehold(recordsByPartnership[p.id] ?? []).map((group) => (
                        <div key={group.key} className="rounded-lg bg-[#F8FBFF] p-2">
                          <p className="truncate text-xs font-medium text-[#0B1B33]">{group.address}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {group.names.join(', ')}
                            {group.names.length > 1 ? ` (${group.names.length} linked contacts)` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {onEndPartnership && !done && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleEnd(p.id, p.name)}
                  className="mt-3 w-full rounded-lg border border-red-200 bg-white py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                >
                  End Ministry
                </button>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
