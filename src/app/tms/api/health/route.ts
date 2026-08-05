import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'

export const dynamic = 'force-dynamic'

// GET /territory-management-system/api/health — for uptime monitors. Confirms the app can
// actually reach the dedicated TMS Supabase project, not just that the process is alive.
export async function GET() {
  try {
    const db = createAdminSupabase()
    const { error } = await db.from('congregations').select('id', { head: true, count: 'exact' }).limit(1)
    if (error) throw error
    return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'error', timestamp: new Date().toISOString() }, { status: 503 })
  }
}
