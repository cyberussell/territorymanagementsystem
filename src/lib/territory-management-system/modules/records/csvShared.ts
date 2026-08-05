// Shared between the server-only CSV parser (csv.ts) and the client-side CsvImportDialog's
// header-mapping step — deliberately has no 'server-only' guard so both sides can import it.

export const IMPORT_FIELDS = [
  'territoryName',
  'section',
  'block',
  'plusCode',
  'householdMembers',
  'residentName',
  'notes',
  'address',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  territoryName: 'Territory Name',
  section: 'Section',
  block: 'Block',
  plusCode: 'Plus Code',
  householdMembers: 'Household Number',
  residentName: 'Name',
  notes: 'Notes',
  address: 'Address',
}

// territoryName is only required for the global (no pre-selected territory) import — see
// CsvImportDialog/importRecordsAction's requireTerritoryName.
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ['section', 'block', 'plusCode', 'householdMembers']
export const OPTIONAL_IMPORT_FIELDS: readonly ImportField[] = ['residentName', 'notes', 'address']

const HEADER_ALIASES: Record<ImportField, readonly string[]> = {
  territoryName: ['Territory Name', 'Territory'],
  section: ['Section'],
  block: ['Block'],
  plusCode: ['Plus Code'],
  householdMembers: ['Household Number', 'Household Members'],
  residentName: ['Name', 'Resident Name'],
  notes: ['Note', 'Notes'],
  address: ['Address'],
}

export type HeaderMap = Partial<Record<ImportField, string>>

// Best-effort default mapping from detected CSV headers to import fields, by case-insensitive
// alias match — prefills the mapping step so the common case (headers that already match) needs
// zero clicks, and doubles as parseRecordsCsv's own fallback if it's ever called with no
// explicit map.
export function guessHeaderMap(headers: string[]): HeaderMap {
  const map: HeaderMap = {}
  for (const field of IMPORT_FIELDS) {
    const match = headers.find((h) => HEADER_ALIASES[field].some((alias) => alias.toLowerCase() === h.toLowerCase()))
    if (match) map[field] = match
  }
  return map
}
