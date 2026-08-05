'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approveRecordAction, rejectRecordAction } from '@/app/tms/actions/records'
import { useConfirm } from '@/lib/territory-management-system/hooks/useConfirm'

export default function RecordApprovalActions({ recordId }: { recordId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { confirm, ConfirmDialog } = useConfirm()

  function handleApprove() {
    startTransition(async () => {
      await approveRecordAction(recordId)
      router.refresh()
    })
  }

  async function handleReject() {
    const ok = await confirm({
      title: 'Reject this record?',
      message: 'Reject and delete this pending contact record?',
      confirmLabel: 'Reject',
      variant: 'caution',
    })
    if (!ok) return
    startTransition(async () => {
      await rejectRecordAction(recordId)
      router.push('/tms/dashboard/records')
    })
  }

  return (
    <div className="flex items-center gap-3">
      {ConfirmDialog}
      <button
        onClick={handleApprove}
        disabled={pending}
        className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={handleReject}
        disabled={pending}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
      >
        Reject
      </button>
    </div>
  )
}
