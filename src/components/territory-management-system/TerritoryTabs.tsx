'use client'

import { useState } from 'react'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import type { TerritoryRecordWithLocation } from '@/lib/territory-management-system/modules/records/types'
import SectionBlockTree from '@/components/territory-management-system/SectionBlockTree'
import RecordForm from '@/components/territory-management-system/RecordForm'
import RecordsTable from '@/components/territory-management-system/RecordsTable'

type Tab = 'sections' | 'add' | 'records'

// Splitting these three into on-page tabs (rather than one long stacked page) is what makes a
// territory with dozens of sections manageable — only the active tab's content mounts, so
// Sections & Blocks, Add a Contact Record, and the full records table never all render at once.
// Same local-useState tab pattern as GroupLeaderTabs, without that component's mobile bottom bar
// (this is an admin dashboard page, already inside DashboardSidebar's own navigation).
export default function TerritoryTabs({
  territory,
  records,
}: {
  territory: TerritoryStructure
  records: TerritoryRecordWithLocation[]
}) {
  const [tab, setTab] = useState<Tab>('sections')
  const base = 'rounded-lg px-4 py-2 text-sm font-semibold transition'
  const active = 'bg-[#2563EB] text-white'
  const inactive = 'bg-blue-50 text-[#2563EB] hover:bg-blue-100'

  const TABS: { id: Tab; label: string }[] = [
    { id: 'sections', label: `Sections & Blocks (${territory.sections.length})` },
    { id: 'add', label: 'Add a Contact Record' },
    { id: 'records', label: `Contact Records (${records.length})` },
  ]

  return (
    <div>
      <nav
        className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-blue-100/60 bg-white/95 p-2 shadow-sm"
        aria-label="Territory sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`${base} ${tab === t.id ? active : inactive}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'sections' && <SectionBlockTree territory={territory} />}
      {tab === 'add' && <RecordForm territory={territory} />}
      {tab === 'records' && (
        <div>
          <h2 className="mb-4 font-semibold text-[#0B1B33]">Contact Records in this Territory</h2>
          <RecordsTable records={records} />
        </div>
      )}
    </div>
  )
}
