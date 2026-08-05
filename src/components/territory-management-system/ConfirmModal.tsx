'use client'

import { AlertTriangle, Info } from 'lucide-react'

// Shared across the whole product (Admin dashboard, Group Leader dashboard, and the publisher
// workspace) — replaces window.confirm()'s "www.cyberussell.com says" browser chrome, which
// reads as an unbranded, unfamiliar warning rather than a TMS-styled prompt. 'caution' (amber
// AlertTriangle) is for anything destructive/hard-to-reverse — deletes, revokes, replacing an
// existing assignment; 'info' (blue Info) is for a plain heads-up/confirmation with no real
// downside (e.g. restoring access). See useConfirm for the usual way to drive this.
export type ConfirmVariant = 'caution' | 'info'

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'caution',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  const Icon = variant === 'info' ? Info : AlertTriangle
  const iconClass = variant === 'info' ? 'bg-blue-50 text-[#2563EB]' : 'bg-amber-50 text-amber-600'

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-gray-300 bg-white p-6 text-center shadow-xl">
        <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${iconClass}`}>
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-semibold text-[#0B1B33]">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
