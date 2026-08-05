import { z } from 'zod'

// Shared by actions/congregation.ts and CongregationSettingsForm's zodResolver.

// An invalid IANA zone name would otherwise pass validation here and only fail later, deep
// inside Reports/Assignment date math (Intl.DateTimeFormat throws a RangeError on a bad zone) —
// catching it at the settings form is both an earlier and a friendlier failure point.
function isValidTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const updateCongregationSchema = z.object({
  name: z.string().min(2).max(120),
  congregationNumber: z.string().min(1).max(20),
  timezone: z.string().min(1).max(60).refine(isValidTimezone, { message: 'Enter a valid IANA timezone, e.g. Asia/Manila.' }),
})
export type UpdateCongregationInput = z.input<typeof updateCongregationSchema>
