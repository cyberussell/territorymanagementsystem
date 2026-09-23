import { z } from 'zod'

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const createCongregationSchema = z.object({
  name: z.string().trim().min(1, 'Enter the congregation name.').max(120),
  congregationNumber: z.string().trim().min(1, 'Enter the congregation number.').max(20),
  timezone: z.string().trim().refine(isValidTimeZone, 'Enter a valid time zone, e.g. Asia/Manila.'),
  adminName: z.string().trim().max(120).optional().default(''),
  adminEmail: z.string().trim().toLowerCase().email('Enter a valid email address for the Administrator.'),
})
export type CreateCongregationInput = z.output<typeof createCongregationSchema>
