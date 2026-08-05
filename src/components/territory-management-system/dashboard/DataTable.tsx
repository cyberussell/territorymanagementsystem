'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import Card from './Card'

export interface DataTableColumn<T> {
  header: string
  cell: (row: T) => React.ReactNode
  className?: string
  sortValue?: (row: T) => string | number
}

const PAGE_SIZE = 15

export default function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage = 'Nothing here yet.',
  pageSize = PAGE_SIZE,
}: {
  columns: DataTableColumn<T>[]
  rows: T[]
  emptyMessage?: string
  pageSize?: number
}) {
  const [sort, setSort] = useState<{ header: string; direction: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(1)

  // Rows change identity whenever an upstream filter/search runs — jumping back to page 1
  // avoids landing on a now out-of-range page with nothing rendered.
  useEffect(() => {
    setPage(1)
  }, [rows])

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((c) => c.header === sort.header)
    if (!column?.sortValue) return rows
    const sorted = [...rows].sort((a, b) => {
      const av = column.sortValue!(a)
      const bv = column.sortValue!(b)
      if (av < bv) return -1
      if (av > bv) return 1
      return 0
    })
    if (sort.direction === 'desc') sorted.reverse()
    return sorted
  }, [rows, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function toggleSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return
    setSort((prev) => {
      if (prev?.header !== column.header) return { header: column.header, direction: 'asc' }
      if (prev.direction === 'asc') return { header: column.header, direction: 'desc' }
      return null
    })
  }

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-slate-600">{emptyMessage}</p>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-blue-100/60 bg-[#F8FBFF]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                className="whitespace-nowrap px-4 py-3 font-medium text-slate-500"
                aria-sort={
                  col.sortValue && sort?.header === col.header ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                }
              >
                {col.sortValue ? (
                  <button onClick={() => toggleSort(col)} className="inline-flex items-center gap-1 hover:text-[#2563EB]">
                    {col.header}
                    {sort?.header === col.header ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row) => (
            <tr key={row.id} className="border-b border-blue-50 last:border-0 hover:bg-[#F8FBFF]/60">
              {columns.map((col) => (
                <td key={col.header} className={`px-4 py-3 text-[#0B1B33] ${col.className ?? ''}`}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-blue-50 px-4 py-3">
          <p className="text-xs text-slate-600">
            Page {currentPage} of {pageCount} ({sortedRows.length} total)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              className="rounded-md border border-blue-100 p-1.5 text-slate-500 hover:border-[#38BDF8]/40 hover:text-[#2563EB] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage === pageCount}
              aria-label="Next page"
              className="rounded-md border border-blue-100 p-1.5 text-slate-500 hover:border-[#38BDF8]/40 hover:text-[#2563EB] disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  )
}
