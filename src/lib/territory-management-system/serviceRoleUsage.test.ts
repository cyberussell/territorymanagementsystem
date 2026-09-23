import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

// The service-role client (createAdminSupabase) bypasses RLS, so tenant isolation on every path
// that uses it rests entirely on the code scoping each query to the right congregation — for
// publishers, the congregation resolved from their batch/partnership token. This list is every
// file reviewed for that. A new file using the client fails this test on purpose: check that
// every query it makes is filtered by a congregation id the caller has proven access to, then
// add it here.
const REVIEWED_SERVICE_ROLE_FILES = [
  'src/app/tms/actions/auth.ts',
  'src/app/tms/actions/group-leaders.ts',
  'src/app/tms/actions/password.ts',
  'src/app/tms/actions/platform.ts',
  'src/app/tms/actions/publisher.ts',
  'src/app/tms/api/health/route.ts',
  'src/app/tms/assignment/[batchToken]/[partnershipToken]/page.tsx',
  'src/app/tms/assignment/[batchToken]/page.tsx',
  'src/app/tms/assignment/[batchToken]/progress/page.tsx',
  'src/app/tms/dashboard/group-leaders/page.tsx',
  'src/app/tms/dashboard/territories/[territoryId]/page.tsx',
  'src/app/tms/platform/page.tsx',
  'src/lib/territory-management-system/errors.ts',
  'src/lib/territory-management-system/rateLimit.ts',
]

const ROOT = path.resolve(__dirname, '../../..')
const DEFINING_FILE = 'src/lib/territory-management-system/supabase-server.ts'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

describe('service-role client usage', () => {
  it('is limited to files reviewed for congregation scoping', () => {
    const users = sourceFiles(path.join(ROOT, 'src'))
      .filter((file) => readFileSync(file, 'utf8').includes('createAdminSupabase'))
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
      .filter((file) => file !== DEFINING_FILE)
      .sort()
    expect(users).toEqual([...REVIEWED_SERVICE_ROLE_FILES].sort())
  })
})
