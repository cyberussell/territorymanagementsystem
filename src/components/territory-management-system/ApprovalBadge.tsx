import type { RecordStatus } from '@/lib/territory-management-system/modules/records/types'

export default function ApprovalBadge({ status }: { status: RecordStatus }) {
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
        Pending
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
      Approved
    </span>
  )
}
