import { describe, it, expect } from 'vitest'
import { buildEditSummary } from './history'

function fields(overrides: Partial<Parameters<typeof buildEditSummary>[0]> = {}) {
  return {
    address: '123 Main St',
    unit: '',
    residentName: 'Juan Dela Cruz',
    plusCode: '8J74+FF9',
    householdMembers: 2,
    doNotCall: false,
    notes: '',
    ...overrides,
  }
}

describe('buildEditSummary', () => {
  it('returns an empty string when nothing changed', () => {
    expect(buildEditSummary(fields(), fields())).toBe('')
  })

  it('reports a changed Plus Code', () => {
    expect(buildEditSummary(fields(), fields({ plusCode: '8J74+GG8' }))).toBe('Plus Code: 8J74+FF9 → 8J74+GG8')
  })

  it('reports multiple changed fields joined with a semicolon', () => {
    expect(buildEditSummary(fields(), fields({ plusCode: '8J74+GG8', householdMembers: 3 }))).toBe(
      'Plus Code: 8J74+FF9 → 8J74+GG8; Household members: 2 → 3'
    )
  })

  it('shows (blank) for an empty or null value', () => {
    expect(buildEditSummary(fields(), fields({ unit: 'Apt 3B' }))).toBe('Unit: (blank) → Apt 3B')
    expect(buildEditSummary(fields({ householdMembers: 2 }), fields({ householdMembers: null }))).toBe('Household members: 2 → (blank)')
  })

  it('reports Do Not Call as Yes/No', () => {
    expect(buildEditSummary(fields(), fields({ doNotCall: true }))).toBe('Do Not Call: No → Yes')
  })

  it('flags notes as updated without quoting the content', () => {
    expect(buildEditSummary(fields(), fields({ notes: 'New note' }))).toBe('Notes updated')
  })
})
