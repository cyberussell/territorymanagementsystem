import Link from 'next/link'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { listWeeklyVisitNotes } from '@/lib/territory-management-system/modules/records/queries'
import { endOfDayUtcExclusive, notesWeekRange, startOfDayUtc } from '@/lib/territory-management-system/modules/reports/date'
import { dismissWeeklyNoteAction, overrideLatestVisitAction, undoLastVisitAction } from '@/app/tms/actions/records'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import Card from '@/components/territory-management-system/dashboard/Card'
import VisitHistoryList from '@/components/territory-management-system/VisitHistoryList'

export const dynamic = 'force-dynamic'

function formatWeekLabel(start: string, end: string): string {
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const year = new Date(`${end}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}, ${year}`
}

// Weekday + date + time, e.g. "Mon, Jul 13, 2026 · 2:34 PM" — deliberately more detail than
// VisitHistoryList's own date line (which omits the weekday) since this page's whole point is
// scanning many records at once to decide who to consult, not reading one record's timeline.
function formatVisitedAt(visitedAt: string): string {
  return new Date(visitedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Admin-only. Every record whose current latest logged visit has a note AND falls within this
// week's Monday–Sunday window — see notesWeekRange for the "still shows last week through
// Monday, only rolls over on Tuesday" rule. Each row reuses VisitHistoryList exactly as the
// per-record detail page does (badge, date, notes, Override/Undo), just scoped to one visit at a
// time instead of a record's full history, so an admin can review and act on a whole week's
// worth of notes without opening every record individually.
export default async function WeeklyNotesPage() {
  const { supabase, congregation } = await requireAdmin()
  const week = notesWeekRange(congregation.timezone)
  const rangeStartIso = startOfDayUtc(week.start, congregation.timezone)
  const rangeEndIso = endOfDayUtcExclusive(week.end, congregation.timezone)
  const rows = await listWeeklyVisitNotes(supabase, congregation.id, rangeStartIso, rangeEndIso)

  return (
    <div>
      <PageHeader
        title="Weekly Notes"
        subtitle={`Notes from visits logged ${formatWeekLabel(week.start, week.end)} · Monday–Sunday, refreshes every Tuesday`}
      />
      {rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-400">No visit notes for this week yet.</Card>
      ) : (
        <div className="space-y-6">
          {rows.map(({ record, visit }) => (
            <div key={record.id}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div>
                  <Link
                    href={`/tms/dashboard/records/${record.id}`}
                    className="text-sm font-medium text-[#0B1B33] hover:underline"
                  >
                    {record.address || record.plus_code || 'Unlabeled record'}
                    {record.unit ? `, ${record.unit}` : ''}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {record.territory?.name ?? '—'} / Sec {record.section?.label ?? '—'} / Blk {record.block?.label ?? '—'}
                    {record.resident_name ? ` · ${record.resident_name}` : ''}
                  </p>
                </div>
                {/* Ministry Partner name + full visit day/time, up front so an admin scanning a
                    long list can spot who to consult without reading every note first. */}
                <div className="text-right">
                  <p className="text-xs font-semibold text-[#2563EB]">{visit.created_by_name ?? visit.partner_name ?? 'Unknown'}</p>
                  <p className="text-xs text-slate-400">{formatVisitedAt(visit.visited_at)}</p>
                </div>
              </div>
              <VisitHistoryList
                visits={[visit]}
                onUndoLast={undoLastVisitAction.bind(null, record.id)}
                onOverride={overrideLatestVisitAction.bind(null, record.id)}
              />
              {/* Only hides this note from this list (dismissWeeklyNote) — the record's actual
                  Visit History, Override, and Undo above are unaffected. */}
              <form action={dismissWeeklyNoteAction.bind(null, visit.id)} className="mt-2 flex justify-end">
                <button type="submit" className="text-xs font-medium text-slate-400 hover:text-slate-600 hover:underline">
                  Dismiss
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
