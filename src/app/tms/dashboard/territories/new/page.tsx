import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import TerritoryForm from '@/components/territory-management-system/TerritoryForm'

export default function NewTerritoryPage() {
  return (
    <div>
      <PageHeader
        title="New Territory"
        subtitle="Set the section/block counts — you can add, rename, or remove them afterward."
      />
      <TerritoryForm />
    </div>
  )
}
