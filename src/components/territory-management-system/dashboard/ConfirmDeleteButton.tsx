'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { useConfirm } from '@/lib/territory-management-system/hooks/useConfirm'

// Reusable across territory/section/block/record deletes — a plain server-action form
// would submit with no way to confirm first, and these are irreversible.
export default function ConfirmDeleteButton({
  action,
  confirmMessage,
  label,
  ariaLabel,
  className,
}: {
  action: () => Promise<void>
  confirmMessage: string
  label?: string
  // Required accessible name for icon-only usages (no visible label text) — e.g. "Delete
  // block B" — falls back to the visible label, then a generic "Delete" for the rest.
  ariaLabel?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const { confirm, ConfirmDialog } = useConfirm()

  async function handleClick() {
    if (!(await confirm({ title: 'Delete this?', message: confirmMessage, confirmLabel: 'Delete', variant: 'caution' }))) return
    startTransition(() => {
      action()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label={ariaLabel ?? label ?? 'Delete'}
        className={className ?? 'inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-600 disabled:opacity-50'}
      >
        <Trash2 className="h-4 w-4" />
        {label}
      </button>
      {ConfirmDialog}
    </>
  )
}
