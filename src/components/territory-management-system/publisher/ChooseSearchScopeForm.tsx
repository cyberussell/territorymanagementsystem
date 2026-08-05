'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

// The Ministry Partner's one-time, locked-in search-area choice for an overflow batch — made
// right after claiming, required before anything else in the workspace becomes visible (see
// PublisherWorkspaceApp's gating on workspace.searchScope). Deliberately no "change later"
// affordance anywhere: once saved, this form never renders again for this partnership. The
// section is a single choice per partnership; blocks are shareable — other partnerships can
// (and often will) pick the same ones, by design (see 037_partnership_search_blocks_shareable.sql).
export default function ChooseSearchScopeForm({
  territories,
  submitting,
  error,
  onSubmit,
}: {
  territories: TerritoryStructure[]
  submitting: boolean
  error: string
  onSubmit: (sectionId: string, blockIds: string[]) => void
}) {
  const [territoryId, setTerritoryId] = useState(territories[0]?.id ?? '')
  const territory = territories.find((t) => t.id === territoryId)
  const [sectionId, setSectionId] = useState('')
  const section = territory?.sections.find((s) => s.id === sectionId)
  const [blockIds, setBlockIds] = useState<string[]>([])

  function toggleBlock(id: string) {
    setBlockIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleTerritoryChange(id: string) {
    setTerritoryId(id)
    setSectionId('')
    setBlockIds([])
  }

  function handleSectionChange(id: string) {
    setSectionId(id)
    setBlockIds([])
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-[#0B1B33]">Choose Your Search Area</h2>
      <p className="mb-4 text-xs text-slate-500">
        Pick one section and the blocks you&apos;ll search today — a one-time choice you can&apos;t change after saving.
      </p>
      <div className="space-y-4">
        {territories.length > 1 && (
          <FormField label="Territory">
            <select value={territoryId} onChange={(e) => handleTerritoryChange(e.target.value)} className={inputClass}>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {territory && (
          <FormField label="Section">
            <select value={sectionId} onChange={(e) => handleSectionChange(e.target.value)} className={inputClass}>
              <option value="" disabled>
                Select a section…
              </option>
              {territory.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.label}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {section && (
          <FormField label="Blocks">
            <div className="flex flex-wrap gap-2">
              {section.blocks.map((b) => {
                const checked = blockIds.includes(b.id)
                return (
                  <label
                    key={b.id}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                      checked ? 'border-[#2563EB] bg-blue-50 text-[#2563EB]' : 'border-blue-100 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBlock(b.id)}
                      className="h-3.5 w-3.5 rounded border-blue-200"
                    />
                    Block {b.label}
                  </label>
                )
              })}
            </div>
          </FormField>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="button"
          disabled={submitting || !sectionId || blockIds.length === 0}
          onClick={() => onSubmit(sectionId, blockIds)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            'Save Search Area'
          )}
        </button>
      </div>
    </Card>
  )
}
