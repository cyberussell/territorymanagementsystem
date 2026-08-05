import 'server-only'
import { createAdminSupabase } from './supabase-server'

const WINDOW_MS = 60_000

// Fixed-window counter backed by the `rate_limits` table (migration 016) — same pattern as the
// Appointment System's and LMS's own copies. Fails open — a missing table (migration not yet
// run) or a transient DB error never blocks a legitimate request; rate limiting degrading is
// far preferable to the publisher workflow breaking because of it.
export async function checkRateLimit(key: string, limit: number): Promise<boolean> {
  try {
    const db = createAdminSupabase()
    const now = Date.now()
    const { data: row } = await db.from('rate_limits').select('count, window_start').eq('key', key).maybeSingle()

    if (!row || now - new Date(row.window_start).getTime() > WINDOW_MS) {
      await db.from('rate_limits').upsert({ key, count: 1, window_start: new Date(now).toISOString() })
      return true
    }
    if (row.count >= limit) return false

    await db.from('rate_limits').update({ count: row.count + 1 }).eq('key', key)
    return true
  } catch {
    return true
  }
}

export function clientIp(headers: Headers): string {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headers.get('x-real-ip') ?? 'unknown'
}
