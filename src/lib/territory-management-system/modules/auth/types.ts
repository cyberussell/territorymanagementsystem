export type UserRole = 'admin' | 'group_leader'

export interface Profile {
  id: string
  role: UserRole
  congregation_id: string | null
  full_name: string
  email: string | null
  revoked_at: string | null
  created_at: string
}
