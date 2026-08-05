// Single source of truth for section/block auto-labeling, mirrored by the SQL
// tms_section_label() function used inside create_territory_structure(). Kept in sync
// intentionally — the RPC generates the initial batch atomically in Postgres, while these
// are used client/server-side for previewing a new territory's structure before submit and
// for the manual "add section"/"add block" actions that extend an existing territory.

export function sectionLabel(n: number): string {
  if (n < 1) throw new Error('Section index must be >= 1.')
  let result = ''
  let i = n
  while (i > 0) {
    i -= 1
    result = String.fromCharCode(65 + (i % 26)) + result
    i = Math.floor(i / 26)
  }
  return result
}

export function blockLabel(n: number): string {
  if (n < 1) throw new Error('Block index must be >= 1.')
  return String(n)
}
