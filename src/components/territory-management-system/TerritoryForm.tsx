'use client'

import { useState } from 'react'
import { createTerritory } from '@/app/tms/actions/territories'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import { sectionLabel } from '@/lib/territory-management-system/modules/territory/labels'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

export default function TerritoryForm() {
  const { dispatch, pending, error } = useServerAction(createTerritory)
  const [sectionCount, setSectionCount] = useState(3)
  const [blocksPerSection, setBlocksPerSection] = useState(4)

  const previewCount = Math.min(Math.max(sectionCount, 1), 6)
  const previewSections = Array.from({ length: previewCount }, (_, i) => sectionLabel(i + 1))

  return (
    <Card className="max-w-2xl p-6">
      <form action={dispatch} className="space-y-4">
        <FormField label="Territory Number">
          <input name="name" required maxLength={120} className={inputClass} placeholder="e.g. Territory 12" />
        </FormField>
        <FormField label="Barangay Name">
          <textarea name="description" required maxLength={500} rows={3} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Number of sections">
            <input
              name="sectionCount"
              type="number"
              min={1}
              max={100}
              required
              value={sectionCount}
              onChange={(e) => setSectionCount(Math.max(1, Number(e.target.value) || 1))}
              className={inputClass}
            />
          </FormField>
          <FormField label="Blocks per section">
            <input
              name="blocksPerSection"
              type="number"
              min={1}
              max={100}
              required
              value={blocksPerSection}
              onChange={(e) => setBlocksPerSection(Math.max(1, Number(e.target.value) || 1))}
              className={inputClass}
            />
          </FormField>
        </div>
        <div className="rounded-lg border border-blue-100 bg-[#F8FBFF] p-3 text-sm text-slate-500">
          Will create sections {previewSections.join(', ')}
          {sectionCount > 6 ? `, … (${sectionCount} total)` : ''} — each with blocks 1–{blocksPerSection}. You can add,
          rename, or remove sections and blocks afterward.
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create Territory'}
        </button>
      </form>
    </Card>
  )
}
