'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import DataTable from '@/components/territory-management-system/dashboard/DataTable'
import TableSearchInput from '@/components/territory-management-system/dashboard/TableSearchInput'
import type { TerritoryWithCounts } from '@/lib/territory-management-system/modules/territory/types'

export default function TerritoriesTable({ territories }: { territories: TerritoryWithCounts[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return territories
    const q = search.trim().toLowerCase()
    return territories.filter((t) => t.name.toLowerCase().includes(q))
  }, [territories, search])

  return (
    <div className="space-y-4">
      <TableSearchInput value={search} onChange={setSearch} placeholder="Search territories…" />
      <DataTable
        columns={[
          {
            header: 'Territory Number',
            cell: (t) => (
              <Link
                href={`/tms/dashboard/territories/${t.id}`}
                className="font-medium hover:text-[#2563EB]"
              >
                {t.name}
              </Link>
            ),
            sortValue: (t) => t.name,
          },
          {
            header: 'Barangay Name',
            cell: (t) => t.description || '—',
            sortValue: (t) => t.description,
          },
          {
            header: 'Status',
            cell: (t) => (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                  t.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {t.status === 'active' ? 'Active' : 'Inactive'}
              </span>
            ),
          },
          { header: 'Sections', cell: (t) => t.section_count, sortValue: (t) => t.section_count },
          { header: 'Blocks', cell: (t) => t.block_count, sortValue: (t) => t.block_count },
          { header: 'Contact Records', cell: (t) => t.record_count, sortValue: (t) => t.record_count },
        ]}
        rows={filtered}
        emptyMessage="No territories match your search."
      />
    </div>
  )
}
