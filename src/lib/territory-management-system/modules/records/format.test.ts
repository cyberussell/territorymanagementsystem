import { describe, it, expect } from 'vitest'
import { formatPlusCode, formatProperCase } from './format'

describe('formatPlusCode', () => {
  it('uppercases a lowercase plus code', () => {
    expect(formatPlusCode('7fg8+4v')).toBe('7FG8+4V')
  })

  it('trims surrounding whitespace', () => {
    expect(formatPlusCode('  7FG8+4V  ')).toBe('7FG8+4V')
  })

  it('leaves an empty string as-is', () => {
    expect(formatPlusCode('')).toBe('')
  })
})

describe('formatProperCase', () => {
  it('title-cases a lowercase name', () => {
    expect(formatProperCase('juan dela cruz')).toBe('Juan Dela Cruz')
  })

  it('title-cases an all-caps name', () => {
    expect(formatProperCase('JUAN DELA CRUZ')).toBe('Juan Dela Cruz')
  })

  it('capitalizes after hyphens and apostrophes', () => {
    expect(formatProperCase("mary-jane o'brien")).toBe("Mary-Jane O'Brien")
  })

  it('title-cases an address, leaving numbers untouched', () => {
    expect(formatProperCase('123 main st, brgy. san jose')).toBe('123 Main St, Brgy. San Jose')
  })

  it('leaves an empty string as-is', () => {
    expect(formatProperCase('')).toBe('')
  })
})
