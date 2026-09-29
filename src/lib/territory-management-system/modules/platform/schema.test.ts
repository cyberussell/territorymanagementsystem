import { describe, expect, it } from 'vitest'
import { createCongregationSchema, deleteCongregationSchema, updateCongregationSchema } from './schema'

const valid = { name: 'Example Congregation', congregationNumber: '12345', timezone: 'Asia/Manila', adminName: '', adminEmail: 'Admin@Example.com ' }

describe('createCongregationSchema', () => {
  it('accepts a valid congregation and normalizes the admin email', () => {
    const result = createCongregationSchema.safeParse(valid)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.adminEmail).toBe('admin@example.com')
  })

  it('rejects an unknown time zone', () => {
    expect(createCongregationSchema.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false)
  })

  it('requires a congregation number', () => {
    expect(createCongregationSchema.safeParse({ ...valid, congregationNumber: ' ' }).success).toBe(false)
  })
})

const congregationId = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

describe('updateCongregationSchema', () => {
  const validUpdate = { congregationId, name: ' Renamed ', congregationNumber: '12345', timezone: 'Asia/Tokyo' }

  it('accepts a valid update and trims the name', () => {
    const result = updateCongregationSchema.safeParse(validUpdate)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe('Renamed')
  })

  it('rejects a non-uuid congregation id', () => {
    expect(updateCongregationSchema.safeParse({ ...validUpdate, congregationId: 'abc' }).success).toBe(false)
  })

  it('rejects an unknown time zone', () => {
    expect(updateCongregationSchema.safeParse({ ...validUpdate, timezone: 'Mars/Olympus' }).success).toBe(false)
  })
})

describe('deleteCongregationSchema', () => {
  it('requires the typed confirmation', () => {
    expect(deleteCongregationSchema.safeParse({ congregationId, confirmNumber: '  ' }).success).toBe(false)
  })

  it('trims the typed confirmation', () => {
    const result = deleteCongregationSchema.safeParse({ congregationId, confirmNumber: ' 12345 ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.confirmNumber).toBe('12345')
  })
})
