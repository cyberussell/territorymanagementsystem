import { AlertTriangle, Check, Lock, Users } from 'lucide-react'
import type { PartnershipRecordDetail } from '@/lib/territory-management-system/modules/assignment/types'
import { isDoNotCallLocked, VISIT_RESULT_LABELS } from '@/lib/territory-management-system/modules/records/schema'
import Card from '@/components/territory-management-system/dashboard/Card'

// Deliberately no status-based tinting here (Russell: "Remove all the colors in the card list.
// All white.") — every card in this scrolling list gets the same plain style regardless of
// status, so nothing competes for attention while skimming. The colored full-panel treatment
// only happens on PublisherRecordDetailView (the single record you've tapped into).
const CARD_CONTAINER = 'border-blue-100/60 bg-white hover:border-[#38BDF8]/40'

// Selecting a record is an in-memory view-state change (onSelect), not a route navigation —
// the whole point of the offline-first workspace is that nothing after the initial load needs
// the network to render.
export default function AssignedRecordsList({
  records,
  failedRecordIds,
  onSelect,
}: {
  records: PartnershipRecordDetail[]
  // completed_at is set optimistically the moment a visit is logged, before it's actually
  // confirmed synced — if that sync later comes back rejected (not just delayed), a plain
  // checkmark would misrepresent it as done. Surface those separately so the publisher knows
  // to open the record and see what went wrong.
  failedRecordIds: Set<string>
  onSelect: (recordId: string) => void
}) {
  if (records.length === 0) {
    return <Card className="p-6 text-center text-sm text-slate-600">No contact records assigned.</Card>
  }

  // One card per Plus Code, not per record — a household with multiple contact records used to
  // render as several near-identical adjacent cards, which read as duplicates rather than one
  // stop with more than one person there. Grouped in list order (already sequence-sorted by the
  // server, and the assignment engine always keeps a household's records adjacent — see
  // engine.ts), so the first record encountered per Plus Code is always the lowest-sequence one
  // and becomes the card's primary. A blank/null Plus Code never merges with another blank one —
  // each such record stays its own singleton group, same rule as engine.ts/getBatchSummary.
  const groups: PartnershipRecordDetail[][] = []
  const groupIndexByPlusCode = new Map<string, number>()
  for (const r of records) {
    if (r.record.plus_code && groupIndexByPlusCode.has(r.record.plus_code)) {
      groups[groupIndexByPlusCode.get(r.record.plus_code)!].push(r)
      continue
    }
    if (r.record.plus_code) groupIndexByPlusCode.set(r.record.plus_code, groups.length)
    groups.push([r])
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const primary = group[0]
        const householdCount = group.length
        // A record locked under the Do Not Call cooldown is only truly "nothing to do here"
        // once every member of the household is locked — one locked resident shouldn't hide
        // that a co-resident still needs a visit.
        const allLocked = group.every((r) => isDoNotCallLocked(r.record.do_not_call, r.record.do_not_call_at))
        const anyFailed = group.some((r) => failedRecordIds.has(r.record.id))
        // Matches the Group Leader's "X of 6" rule (see getBatchSummary/engine.ts): the stop at
        // this address counts as done once ANY one resident there has a logged visit, not only
        // once every resident individually does — the household disclosure on the record detail
        // page still shows each person's own status for anyone who wants that detail.
        const anyCompleted = group.some((r) => r.completed_at)
        return (
          <button
            key={primary.id}
            type="button"
            onClick={() => onSelect(primary.record.id)}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left shadow-sm transition ${CARD_CONTAINER}`}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-medium text-[#0B1B33]">
                <span className="truncate">
                  {primary.sequence}. {primary.record.address || primary.record.plus_code || 'Unlabeled record'}
                  {primary.record.unit ? `, ${primary.record.unit}` : ''}
                </span>
                {householdCount > 1 && (
                  <span
                    className="flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#2563EB]"
                    title={`${householdCount} contact records at this address`}
                  >
                    <Users className="h-3 w-3" />
                    {householdCount}
                  </span>
                )}
              </p>
              {primary.record.resident_name && <p className="truncate text-xs text-slate-600">{primary.record.resident_name}</p>}
              <p className="truncate text-xs text-slate-400">
                {primary.record.territory ? `${primary.record.territory.name} — ${primary.record.territory.description}` : '—'}
                {' · '}
                Sec {primary.record.section?.label ?? '—'} / Blk {primary.record.block?.label ?? '—'}
                {primary.record.do_not_call ? ` · Do Not Call${allLocked ? ' (Locked)' : ''}` : ''}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {primary.visits[0] ? VISIT_RESULT_LABELS[primary.visits[0].result] : VISIT_RESULT_LABELS.initial_visit}
                {primary.visits[0]?.notes ? `: ${primary.visits[0].notes}` : ''}
              </p>
              {primary.passed_from_name && (
                <p className="mt-0.5 truncate text-xs font-medium text-amber-600">Passed by {primary.passed_from_name}</p>
              )}
            </div>
            {anyFailed ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500" title="Sync failed — open to see why">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            ) : allLocked ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500" title="Locked — Do Not Call cooldown">
                <Lock className="h-3.5 w-3.5" />
              </span>
            ) : anyCompleted ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Check className="h-4 w-4" />
              </span>
            ) : (
              <span className="h-6 w-6 shrink-0 rounded-full border-2 border-blue-100" />
            )}
          </button>
        )
      })}
    </div>
  )
}
