'use client'

import { useState } from 'react'
import { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

// Owned entirely by the parent shell (onRename) — it decides whether to enqueue-and-flush or
// just enqueue, depending on connectivity, so this form has no idea whether it's online.
// The auto-generated name every partnership starts with ("Ministry Partner 1", set at batch
// creation — see createAssignment) is a real stored value, not a placeholder, so it always
// pre-filled the input and the actual placeholder ("Put your names") never had a chance to
// show. Starting the field empty in that specific case lets the placeholder do its job; once a
// partnership has a real name, editing it still pre-fills normally.
const DEFAULT_NAME_PATTERN = /^Ministry Partner \d+$/

export default function PartnershipRenameForm({
  currentName,
  onRename,
}: {
  currentName: string
  onRename: (name: string) => void
}) {
  const [name, setName] = useState(DEFAULT_NAME_PATTERN.test(currentName) ? '' : currentName)
  const dirty = name.trim() !== currentName && name.trim().length > 0

  return (
    <Card className="p-4">
      {/* Stacked, not side-by-side — on a narrow phone with the on-screen keyboard up, a
          beside-the-input Save button had no reliable room and effectively disappeared. A full-
          width button on its own row below always renders, keyboard or not. */}
      <div className="flex flex-col gap-3">
        <div>
          <label className="text-sm font-medium text-slate-600">Names of Ministry Partners</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Put your names"
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => onRename(name.trim())}
          className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </Card>
  )
}
