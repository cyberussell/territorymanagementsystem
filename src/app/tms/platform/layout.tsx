import { Toaster } from 'sonner'
import { LogOut } from 'lucide-react'
import { requireSuperAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { signOut } from '@/app/tms/actions/auth'

export const dynamic = 'force-dynamic'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { userName } = await requireSuperAdmin()

  return (
    <div className="min-h-dvh bg-[#C9D8EE]">
      <header className="flex items-center justify-between gap-4 border-b border-blue-100/60 bg-white px-4 py-3 sm:px-8">
        <div>
          <p className="font-bold text-[#0B1B33]">
            Territory <span className="text-[#2563EB]">Management System</span>
          </p>
          <p className="text-xs text-slate-500">Platform console · {userName}</p>
        </div>
        <form action={signOut}>
          <button type="submit" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-[#0B1B33]">
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </form>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
