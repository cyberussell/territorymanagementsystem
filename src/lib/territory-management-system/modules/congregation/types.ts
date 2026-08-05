export interface Congregation {
  id: string
  name: string
  congregation_number: string
  timezone: string
  settings: Record<string, unknown>
  created_at: string
}
