'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { inputClass } from '@/components/territory-management-system/dashboard/FormField'

// Branded replacement for window.prompt() — same "www.cyberussell.com says" problem as
// window.confirm(), but for the one spot in TMS (Group Leader password reset) that needs a
// single free-text field rather than a yes/no choice.
export default function PromptModal({
  open,
  title,
  message,
  placeholder,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')

  if (!open) return null

  function handleConfirm() {
    onConfirm(value)
    setValue('')
  }

  function handleCancel() {
    setValue('')
    onCancel()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-gray-300 bg-white p-6 text-center shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-[#2563EB]">
          <KeyRound className="h-6 w-6" />
        </div>
        <h2 className="mt-4 font-semibold text-[#0B1B33]">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} mt-4 text-center`}
          autoFocus
        />
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 rounded-lg border border-gray-300 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
