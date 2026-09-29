import { z } from 'zod'

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const congregationFields = {
  name: z.string().trim().min(1, 'Enter the congregation name.').max(120),
  congregationNumber: z.string().trim().min(1, 'Enter the congregation number.').max(20),
  timezone: z.string().trim().refine(isValidTimeZone, 'Enter a valid time zone, e.g. Asia/Manila.'),
}

export const createCongregationSchema = z.object({
  ...congregationFields,
  adminName: z.string().trim().max(120).optional().default(''),
  adminEmail: z.string().trim().toLowerCase().email('Enter a valid email address for the Administrator.'),
})
export type CreateCongregationInput = z.output<typeof createCongregationSchema>

export const updateCongregationSchema = z.object({
  congregationId: z.string().uuid('Congregation not found.'),
  ...congregationFields,
})
export type UpdateCongregationInput = z.output<typeof updateCongregationSchema>

// Deleting a congregation is permanent and takes every resident record with it, so the super
// admin must type the congregation number back — checked again server-side against the stored
// number, not just in the dialog.
export const deleteCongregationSchema = z.object({
  congregationId: z.string().uuid('Congregation not found.'),
  confirmNumber: z.string().trim().min(1, 'Type the congregation number to confirm.'),
})
export type DeleteCongregationInput = z.output<typeof deleteCongregationSchema>
