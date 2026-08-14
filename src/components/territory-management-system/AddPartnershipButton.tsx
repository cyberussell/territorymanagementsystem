'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'

// Only ever rendered for a House To House batch (see GroupLeaderTabs) — a Language Searcher
// batch already starts every partner empty by design, so "add one more" has no equivalent there;
// the Group Leader generates a whole new Language Searcher batch instead. The server action
// re-verifies unassigned households still exist before adding one (see addPartnershipToBatch) —
// this button doesn't try to pre-compute that count client-side, it just surfaces the error if
// there's genuinely nothing left to hand a new partner.
export default function AddPartnershipButton({
  batchId,
  onAdd,
}: {
  batchId: string
  onAdd: (batchId: string) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    startTransition(async () => {
      const result = await onAdd(batchId)
      if (result.error) toast.error(result.error)
      else {
        toast.success('Ministry Partner added.')
        router.refresh()
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={pending}
      className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-200 bg-white py-2.5 text-sm font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/60 hover:bg-blue-50 disabled:opacity-50"
    >
      <UserPlus className="h-4 w-4" />
      {pending ? 'Adding…' : 'Add Ministry Partner'}
    </button>
  )
}
