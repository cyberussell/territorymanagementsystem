import { requireGroupLeader } from '@/lib/territory-management-system/modules/auth/queries'
import { getApprovedRecordCounts, getBatchesForGroupLeaderAndDate } from '@/lib/territory-management-system/modules/assignment/queries'
import { listTerritories } from '@/lib/territory-management-system/modules/territory/queries'
import { getBatchStats, getCombinedBatchStats, getTerritoryVisitHistory } from '@/lib/territory-management-system/modules/reports/queries'
import { getAssignmentBatchQrDataUrl, getAssignmentBatchUrl } from '@/lib/territory-management-system/modules/assignment/qr'
import { formatLongDate, todayInTimezone } from '@/lib/territory-management-system/modules/assignment/date'
import GroupLeaderTabs, { type BatchView } from '@/components/territory-management-system/GroupLeaderTabs'
import AssignmentForm from '@/components/territory-management-system/AssignmentForm'
import TerritoryVisitHistoryList from '@/components/territory-management-system/TerritoryVisitHistoryList'

export const dynamic = 'force-dynamic'

// "Today's assignment" now means "my own batch(es) today" — a Group Leader can have more than
// one (013_group_leader_assignment_ownership.sql gave each Group Leader their own batch;
// 023_multiple_batches_per_group_leader.sql lifted the one-per-day limit so a Group Leader can
// also generate an overflow batch for extra publishers without disturbing their original one).
export default async function GroupLeaderDashboardPage() {
  const { supabase, congregation, userId, userName } = await requireGroupLeader()
  const today = todayInTimezone(congregation.timezone)
  const batches = await getBatchesForGroupLeaderAndDate(supabase, congregation.id, userId, today)

  const [territories, approvedCounts] = await Promise.all([
    listTerritories(supabase, congregation.id),
    getApprovedRecordCounts(supabase, congregation.id),
  ])
  const activeTerritories = territories
    .filter((t) => t.status === 'active')
    .map((t) => ({ id: t.id, name: t.name, barangayName: t.description, approvedCount: approvedCounts[t.id] ?? 0 }))

  // "Worked in the last month" list — fetched regardless of whether today's assignment exists
  // yet, since territory coverage over time is useful information on both the pre-assignment
  // screen below and the tabbed Dashboard view (see GroupLeaderTabs).
  const oneMonthAgo = new Date()
  oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1)
  const territoryHistory = await getTerritoryVisitHistory(supabase, congregation.id, oneMonthAgo.toISOString())

  // Campaign-day scenario: no assignment yet today — lead with the generation form itself
  // rather than a passive "nothing here" message, since this is the Group Leader's very first
  // decision most days.
  if (batches.length === 0) {
    return (
      <div className="space-y-8">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[#0B1B33]">Select Territory For Today</h1>
          <p className="mt-1 text-base font-medium text-slate-600">{formatLongDate(today)}</p>
          <p className="mt-0.5 text-sm text-slate-500">{userName}</p>
        </div>
        <AssignmentForm territories={activeTerritories} hasExistingBatch={false} />
        <TerritoryVisitHistoryList entries={territoryHistory} />
      </div>
    )
  }

  const batchViews = (
    await Promise.all(
      batches.map(async (batch): Promise<BatchView | null> => {
        const stats = await getBatchStats(supabase, congregation.id, batch.id, congregation.timezone)
        if (!stats) return null
        // Inverted (orange on black) for an overflow batch's QR so it's visually distinct from
        // the original assignment's plain black-on-white QR at a glance.
        const qrDataUrl = await getAssignmentBatchQrDataUrl(
          batch.access_token,
          batch.is_overflow ? '#F97316' : undefined,
          batch.is_overflow ? '#000000' : undefined
        )
        return {
          batchId: batch.id,
          qrDataUrl,
          publicUrl: getAssignmentBatchUrl(batch.access_token),
          requestedPartnershipCount: batch.requested_partnership_count,
          isOverflow: batch.is_overflow,
          stats,
        }
      })
    )
  ).filter((v): v is BatchView => v !== null)
  if (batchViews.length === 0) return null

  // Union of every territory already covered by one of today's batches, for the overflow form's
  // territory picker (deliberately narrower than activeTerritories above, which lists every
  // active territory in the congregation — the overflow batch can only ever extend a territory
  // already assigned today, never start a brand new one).
  const todaysTerritoryIds = new Set(batchViews.flatMap((v) => v.stats.territories.map((t) => t.id)))
  const todaysTerritories = activeTerritories.filter((t) => todaysTerritoryIds.has(t.id))

  // Combined regular-assignment + auxiliary/overflow-batch totals for today, so the Group
  // Leader's Dashboard/Visits/Partners tabs (and the post-completion Home tab summary) show one
  // "today" total instead of forcing a per-batch view — see getCombinedBatchStats.
  const combinedStats = await getCombinedBatchStats(
    supabase,
    congregation.id,
    batchViews.map((v) => v.stats),
    today,
    congregation.timezone
  )

  return (
    <GroupLeaderTabs
      batches={batchViews}
      activeTerritories={activeTerritories}
      todaysTerritories={todaysTerritories}
      combinedStats={combinedStats}
      territoryHistory={territoryHistory}
    />
  )
}
