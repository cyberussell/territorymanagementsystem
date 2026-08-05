import { Toaster } from 'sonner'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import DashboardSidebar from '@/components/territory-management-system/dashboard/DashboardSidebar'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { congregation } = await requireAdmin()

  return (
    <div className="flex min-h-dvh flex-col bg-[#C9D8EE] lg:flex-row">
      <DashboardSidebar congregationName={congregation.name} />
      <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
