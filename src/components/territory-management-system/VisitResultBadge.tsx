import { VISIT_RESULT_LABELS, VISIT_RESULT_STYLES } from '@/lib/territory-management-system/modules/records/schema'
import type { VisitResult } from '@/lib/territory-management-system/modules/records/types'

export default function VisitResultBadge({ result }: { result: VisitResult }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${VISIT_RESULT_STYLES[result]}`}>
      {VISIT_RESULT_LABELS[result]}
    </span>
  )
}
