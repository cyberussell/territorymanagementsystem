import 'server-only'
import Papa from 'papaparse'
import type { TerritoryRecordWithLocation } from './types'
import { type HeaderMap, type ImportField, IMPORT_FIELD_LABELS, REQUIRED_IMPORT_FIELDS, guessHeaderMap } from './csvShared'

const EXPORT_COLUMNS = [
  'Territory',
  'Section',
  'Block',
  'Address',
  'Unit',
  'Resident Name',
  'Plus Code',
  'Household Members',
  'Notes',
  'Do Not Call',
  'Status',
  'Created At',
] as const

export function recordsToCsv(records: TerritoryRecordWithLocation[]): string {
  const rows = records.map((r) => ({
    Territory: r.territory?.name ?? '',
    Section: r.section?.label ?? '',
    Block: r.block?.label ?? '',
    Address: r.address,
    Unit: r.unit,
    'Resident Name': r.resident_name,
    'Plus Code': r.plus_code ?? '',
    'Household Members': r.household_members ?? '',
    Notes: r.notes,
    'Do Not Call': r.do_not_call ? 'yes' : 'no',
    Status: r.status,
    'Created At': r.created_at,
  }))
  // escapeFormulae guards against CSV/Excel formula injection — a resident name or note
  // starting with =, +, -, or @ would otherwise execute as a formula when the export is
  // opened in a spreadsheet app.
  return Papa.unparse(rows, { columns: [...EXPORT_COLUMNS], escapeFormulae: true })
}

export interface CsvImportRow {
  territoryName: string
  section: string
  block: string
  address: string
  residentName: string
  plusCode: string
  householdMembers: number
  notes: string
}

export interface CsvImportResult {
  rows: CsvImportRow[]
  errors: string[]
}

function pick(row: Record<string, string>, headerMap: HeaderMap, field: ImportField): string {
  const key = headerMap[field]
  if (!key || row[key] === undefined) return ''
  return (row[key] ?? '').trim()
}

// requireTerritoryName is true for the global Records-page import (no territory pre-selected,
// so every row must name its own territory) and false for the per-territory import launched
// from a Territory's own page (territoryId is already fixed, a Territory Name column if
// present is ignored). headerMap comes from the CsvImportDialog's user-confirmed field-mapping
// step — when it's missing (shouldn't happen via the real UI, but keeps this function safe to
// call directly) it falls back to guessing from header text the same way the old parser did.
export function parseRecordsCsv(
  csvText: string,
  options: { requireTerritoryName: boolean; headerMap?: HeaderMap }
): CsvImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true })
  const errors: string[] = parsed.errors.map((e) => `Row ${e.row ?? '?'}: ${e.message}`)

  const headers = parsed.meta.fields ?? []
  const headerMap = options.headerMap ?? guessHeaderMap(headers)

  const requiredFields: ImportField[] = [...REQUIRED_IMPORT_FIELDS, ...(options.requireTerritoryName ? (['territoryName'] as const) : [])]
  const missingLabels = requiredFields.filter((f) => !headerMap[f]).map((f) => IMPORT_FIELD_LABELS[f])
  if (missingLabels.length > 0) {
    errors.unshift(`Missing required column(s): ${missingLabels.join(', ')}.`)
    return { rows: [], errors }
  }

  const rows: CsvImportRow[] = []
  parsed.data.forEach((row, index) => {
    const rowNum = index + 2
    const territoryName = pick(row, headerMap, 'territoryName')
    const section = pick(row, headerMap, 'section')
    const block = pick(row, headerMap, 'block')
    const plusCode = pick(row, headerMap, 'plusCode')
    if (!section || !block) {
      errors.push(`Row ${rowNum}: Section and Block are required.`)
      return
    }
    if (!plusCode) {
      errors.push(`Row ${rowNum}: Plus Code is required.`)
      return
    }
    if (options.requireTerritoryName && !territoryName) {
      errors.push(`Row ${rowNum}: Territory Name is required.`)
      return
    }

    const householdMembersRaw = pick(row, headerMap, 'householdMembers')
    const householdMembers = Number(householdMembersRaw)
    if (!householdMembersRaw || !Number.isInteger(householdMembers) || householdMembers < 0) {
      errors.push(`Row ${rowNum}: Household Number must be a whole number.`)
      return
    }

    rows.push({
      territoryName,
      section,
      block,
      address: pick(row, headerMap, 'address'),
      residentName: pick(row, headerMap, 'residentName'),
      plusCode,
      householdMembers,
      notes: pick(row, headerMap, 'notes'),
    })
  })

  return { rows, errors }
}
