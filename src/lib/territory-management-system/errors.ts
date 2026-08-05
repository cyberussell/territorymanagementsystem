import 'server-only'
import { createAdminSupabase } from './supabase-server'

// Persists unexpected failures to the `error_logs` table (migration 017) so they're queryable
// after the fact instead of living only in Vercel's ephemeral function logs — best-effort and
// never throws, so a logging failure can never mask or replace the real error being reported.
export async function logError(congregationId: string | null, source: string, error: unknown): Promise<void> {
  try {
    const db = createAdminSupabase()
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? (error.stack ?? null) : null
    await db.from('error_logs').insert({ congregation_id: congregationId, source, message, stack })
  } catch {
    // Logging is best-effort — a broken logger should never take down the caller.
  }
}
