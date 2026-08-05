import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { listRecords } from '@/lib/territory-management-system/modules/records/queries'
import { recordsToCsv } from '@/lib/territory-management-system/modules/records/csv'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { supabase, congregation } = await requireAdmin()
  const { searchParams } = new URL(request.url)
  const territoryId = searchParams.get('territoryId') ?? undefined

  const records = await listRecords(supabase, congregation.id, territoryId)
  const csv = recordsToCsv(records)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="contact-records-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
