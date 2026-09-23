import { describe, expect, it } from 'vitest'
import { createCongregationSchema } from './schema'

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
