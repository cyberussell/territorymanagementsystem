'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { addBlockAction, addSectionAction, deleteBlockAction, deleteSectionAction } from '@/app/tms/actions/territories'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import Card from '@/components/territory-management-system/dashboard/Card'
import ConfirmDeleteButton from '@/components/territory-management-system/dashboard/ConfirmDeleteButton'

export default function SectionBlockTree({ territory }: { territory: TerritoryStructure }) {
  const { dispatch: addSection, pending: addingSection } = useServerAction(addSectionAction, ['SAVED'])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#0B1B33]">Sections & Blocks</h2>
        <form action={addSection}>
          <input type="hidden" name="territoryId" value={territory.id} />
          <button
            type="submit"
            disabled={addingSection}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-sm font-medium text-[#2563EB] hover:border-[#38BDF8]/40 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add Section
          </button>
        </form>
      </div>

      {territory.sections.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-600">No sections yet.</Card>
      ) : (
        territory.sections.map((section) => <SectionCard key={section.id} section={section} territoryId={territory.id} />)
      )}
    </div>
  )
}

// Collapsed by default — a territory with dozens of sections (each with dozens of blocks) would
// otherwise render every single block pill in the DOM at once. Only the section's name and block
// count show until it's expanded.
function SectionCard({
  section,
  territoryId,
}: {
  section: TerritoryStructure['sections'][number]
  territoryId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const { dispatch: addBlock, pending: addingBlock } = useServerAction(addBlockAction, ['SAVED'])

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          )}
          <h3 className="font-semibold text-[#0B1B33]">Section {section.label}</h3>
          <span className="text-sm text-slate-500">
            {section.blocks.length} block{section.blocks.length === 1 ? '' : 's'}
          </span>
        </button>
        <ConfirmDeleteButton
          action={() => deleteSectionAction(section.id, territoryId)}
          confirmMessage={`Delete Section ${section.label} and all its blocks? Any contact records inside will be deleted too.`}
          label="Delete section"
        />
      </div>

      {expanded && (
        <div className="mt-4">
          <div className="mb-3">
            <form action={addBlock} className="flex items-center">
              <input type="hidden" name="territoryId" value={territoryId} />
              <input type="hidden" name="sectionId" value={section.id} />
              <button
                type="submit"
                disabled={addingBlock}
                className="inline-flex items-center gap-1 text-sm font-medium text-[#2563EB] hover:underline disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Block
              </button>
            </form>
          </div>
          {section.blocks.length === 0 ? (
            <p className="text-sm text-slate-600">No blocks yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {section.blocks.map((block) => (
                <div
                  key={block.id}
                  className="flex items-center gap-2 rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-1.5 text-sm text-[#0B1B33]"
                >
                  Block {block.label}
                  <ConfirmDeleteButton
                    action={() => deleteBlockAction(block.id, territoryId)}
                    confirmMessage={`Delete Block ${block.label}? Any contact records inside will be deleted too.`}
                    ariaLabel={`Delete Block ${block.label}`}
                    className="text-slate-400 hover:text-red-500"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
