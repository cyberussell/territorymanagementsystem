import Link from 'next/link'
import type { PartnershipWithProgress } from '@/lib/territory-management-system/modules/assignment/types'

export default function PartnershipCard({
  partnership,
  batchToken,
}: {
  partnership: PartnershipWithProgress
  batchToken: string
}) {
  const pct = partnership.recordCount > 0 ? Math.round((partnership.completedCount / partnership.recordCount) * 100) : 0
  // finished_at/ended_early_at (see 018_partnership_finished_at.sql) are the real "genuinely
  // done" signal — completedCount >= recordCount alone can't be trusted (vacuously true for a
  // zero-record partnership) and this badge previously never checked completion at all, only
  // claimed_at, so a 100%-done or early-ended partnership stayed stuck on "In Progress" forever.
  const endedEarly = Boolean(partnership.ended_early_at)
  const done = Boolean(partnership.finished_at || endedEarly)
  const status = endedEarly ? 'Ended Early' : done ? 'Done' : partnership.claimed_at ? 'In Progress' : 'Unclaimed'
  const statusClass = endedEarly
    ? 'bg-amber-50 text-amber-600'
    : done
      ? 'bg-emerald-50 text-emerald-600'
      : partnership.claimed_at
        ? 'bg-blue-50 text-[#2563EB]'
        : 'bg-slate-100 text-slate-500'

  return (
    <Link
      href={`/tms/assignment/${batchToken}/${partnership.claim_token}`}
      className="relative block overflow-hidden rounded-2xl border border-gray-300 bg-white p-4 shadow-[0_0_18px_-3px_rgba(148,163,184,0.6)] transition hover:border-[#38BDF8]/40"
    >
      {partnership.hasBibleStudy && (
        <span className="absolute right-4 top-0 h-1.5 w-12 rounded-b-full bg-[#4a6da7]" aria-label="Bible Study included" />
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-[#0B1B33]">{partnership.name}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{status}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-50">
        <div className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-600">
        {partnership.recordCount > 0
          ? `${partnership.completedCount} of ${partnership.recordCount} contact records completed`
          : 'No Added Records Yet'}
        {partnership.dncCount > 0 && <span className="text-red-600"> · {partnership.dncCount} Do Not Call</span>}
      </p>
      {partnership.territories.length > 0 && (
        <p className="mt-0.5 text-xs text-slate-400">
          {partnership.territories.map((t) => `${t.name} — ${t.description}`).join(', ')}
          {partnership.sections.length > 0 ? ` · Section ${partnership.sections.map((s) => s.label).join(', ')}` : ''}
        </p>
      )}
      {endedEarly && (
        <p className="mt-1 text-xs text-amber-600">Ended early — the remaining records weren&apos;t visited this session.</p>
      )}
    </Link>
  )
}
