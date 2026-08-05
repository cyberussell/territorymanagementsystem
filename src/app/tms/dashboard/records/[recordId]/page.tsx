import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { getRecordById, listVisits, listRecordHistory } from '@/lib/territory-management-system/modules/records/queries'
import { getPassedFromForRecord } from '@/lib/territory-management-system/modules/assignment/queries'
import { overrideLatestVisitAction, undoLastVisitAction } from '@/app/tms/actions/records'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import ApprovalBadge from '@/components/territory-management-system/ApprovalBadge'
import RecordApprovalActions from '@/components/territory-management-system/RecordApprovalActions'
import RecordEditForm from '@/components/territory-management-system/RecordEditForm'
import VisitLogForm from '@/components/territory-management-system/VisitLogForm'
import VisitHistoryList from '@/components/territory-management-system/VisitHistoryList'
import VisitResultBadge from '@/components/territory-management-system/VisitResultBadge'
import RecordHistoryList from '@/components/territory-management-system/RecordHistoryList'

export const dynamic = 'force-dynamic'

export default async function RecordDetailPage({ params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params
  const { supabase, congregation } = await requireAdmin()
  const record = await getRecordById(supabase, congregation.id, recordId)
  if (!record) notFound()
  const visits = await listVisits(supabase, recordId)
  const latestVisit = visits[0] ?? null
  const passedFrom = await getPassedFromForRecord(supabase, recordId)
  const history = await listRecordHistory(supabase, recordId)

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${record.address || record.plus_code || 'Unlabeled record'}${record.unit ? `, ${record.unit}` : ''}`}
        subtitle={`${record.territory?.name ?? '—'} / Section ${record.section?.label ?? '—'} / Block ${record.block?.label ?? '—'}`}
        action={
          <div className="flex items-center gap-3">
            <VisitResultBadge result={latestVisit?.result ?? 'initial_visit'} />
            <ApprovalBadge status={record.status} />
            {record.status === 'pending' && <RecordApprovalActions recordId={record.id} />}
          </div>
        }
      />
      {passedFrom && (
        <p className="text-sm font-medium text-amber-600">
          Passed by {passedFrom.name} on {new Date(passedFrom.at).toLocaleDateString('en-US', { dateStyle: 'medium' })}
        </p>
      )}
      {(record.added_by_profile || record.edited_by_profile) && (
        <p className="text-sm text-slate-500">
          {record.added_by_profile && (
            <>
              Added by {record.added_by_profile.full_name || 'Admin'} on{' '}
              {new Date(record.admin_added_at!).toLocaleDateString('en-US', { dateStyle: 'medium' })}
            </>
          )}
          {record.added_by_profile && record.edited_by_profile && ' · '}
          {record.edited_by_profile && (
            <>
              Last edited by {record.edited_by_profile.full_name || 'Admin'} on{' '}
              {new Date(record.admin_edited_at!).toLocaleDateString('en-US', { dateStyle: 'medium' })}
            </>
          )}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecordEditForm record={record} />
        <VisitLogForm recordId={record.id} latestResult={latestVisit?.result} doNotCall={record.do_not_call} />
      </div>
      <div>
        <h2 className="mb-4 font-semibold text-[#0B1B33]">Visit History</h2>
        <VisitHistoryList
          visits={visits}
          onUndoLast={undoLastVisitAction.bind(null, record.id)}
          onOverride={overrideLatestVisitAction.bind(null, record.id)}
        />
      </div>
      <div>
        <h2 className="mb-4 font-semibold text-[#0B1B33]">Record History</h2>
        <RecordHistoryList entries={history} />
      </div>
    </div>
  )
}
