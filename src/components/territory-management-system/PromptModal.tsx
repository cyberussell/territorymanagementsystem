'use client'

import { useState } from 'react'
import { AlertTriangle, KeyRound } from 'lucide-react'
import { inputClass } from '@/components/territory-management-system/dashboard/FormField'

// 'danger' (red) is for a typed confirmation of something permanent — deleting a whole
// congregation from the platform console — so it can't be mistaken for the blue password-reset
// prompt. It's stronger than ConfirmModal's amber 'caution', which covers everyday deletes.
export type PromptVariant = 'default' | 'danger'

// Branded replacement for window.prompt() — same "www.cyberussell.com says" problem as
// window.confirm(), but for the spots in TMS (Group Leader password reset, congregation delete)
// that need a single free-text field rather than a yes/no choice.
export default function PromptModal({
  open,
  title,
  message,
  placeholder,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: PromptVariant
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

  const danger = variant === 'danger'
  const Icon = danger ? AlertTriangle : KeyRound

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" role="dialog" aria-modal="true">
      <div
        className={`w-full max-w-sm rounded-2xl border bg-white p-6 text-center shadow-xl ${danger ? 'border-red-300' : 'border-gray-300'}`}
      >
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${danger ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-[#2563EB]'}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <h2 className={`mt-4 font-semibold ${danger ? 'text-red-700' : 'text-[#0B1B33]'}`}>{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} mt-4 text-center ${danger ? 'focus:border-red-400' : ''}`}
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
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-gradient-to-r from-[#2563EB] to-[#38BDF8] hover:brightness-110'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
