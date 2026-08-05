import { z } from 'zod'

// tempPassword is optional — a blank field auto-generates a secure random one (the default,
// still recommended), but an Admin can override it with something easier for the Group Leader
// to actually type, since the generated ones (e.g. "gJTav9BQVsGh") were reported hard to relay
// to less tech-savvy users. Still held to the same 8-character minimum as every other password
// in this product (ChangePasswordForm, etc.) — "easier to type" isn't a reason to drop below
// that floor.
export const inviteGroupLeaderSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  tempPassword: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().min(8, 'Temporary password must be at least 8 characters.').max(72).optional()
  ),
})
export type InviteGroupLeaderInput = z.input<typeof inviteGroupLeaderSchema>

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
})
export type RequestPasswordResetInput = z.input<typeof requestPasswordResetSchema>
