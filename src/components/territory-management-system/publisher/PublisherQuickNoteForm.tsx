'use client'

import { useState } from 'react'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

export interface QuickNoteFields {
  name: string
  phone: string
  notes: string
}

// The unstructured alternative to the full Add Record / Recommend New Location forms — no
// territory/section/block/address/Plus Code, just enough for the Admin to follow up manually.
// Used from two places: the "My Added Records" tab (an alternative to the full territory-scoped
// PublisherRecordForm) and MarkMovedForm's "Unlocated" chooser (an alternative to the full
// Recommend New Location form, which is left untouched — this is purely additive).
export default function PublisherQuickNoteForm({
  heading,
  description,
  sending,
  onSubmit,
  onCancel,
}: {
  heading: string
  description: string
  sending: boolean
  onSubmit: (fields: QuickNoteFields) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !notes.trim()) return
    onSubmit({ name: name.trim(), phone: phone.trim(), notes: notes.trim() })
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-[#0B1B33]">{heading}</h2>
      <p className="mb-4 text-xs text-slate-500">{description}</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} className={inputClass} />
        </FormField>
        <FormField label="Phone" optional>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={30}
            type="tel"
            className={inputClass}
            placeholder="09XXXXXXXXX"
          />
        </FormField>
        <FormField label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} required maxLength={1000} rows={4} className={inputClass} />
        </FormField>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="flex-1 rounded-lg border border-blue-100 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-[#38BDF8]/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !name.trim() || !notes.trim()}
            className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send to Admin'}
          </button>
        </div>
      </form>
    </Card>
  )
}
