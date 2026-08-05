// Shared by records/queries.ts — the single point every record write (admin Add/Edit, publisher
// field-add/edit, publisher Move/Correction recommendations, CSV import) passes through, so Plus
// Code/Resident Name/Address casing is normalized consistently regardless of entry point.

// Plus Codes are always uppercase per the Open Location Code spec (digits 2-9 and the letters
// 23456789CFGHJMPQRVWX, plus '+') — normalizes whatever case a user typed before it's saved.
export function formatPlusCode(plusCode: string): string {
  return plusCode.trim().toUpperCase()
}

// Proper-cases a name or address on save (e.g. "juan dela cruz" -> "Juan Dela Cruz", "123 main
// st" -> "123 Main St") — capitalizes the first letter and every letter following a
// space/hyphen/apostrophe/period, lowercases everything else. Deliberately not applied to the
// Unit field (e.g. "Apt 3B" shouldn't get mangled).
export function formatProperCase(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-'.])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}
