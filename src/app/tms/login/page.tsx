import LoginForm from '@/components/territory-management-system/LoginForm'

const NOTICES: Record<string, string> = {
  not_provisioned: "Your account isn't linked to a congregation yet — contact your administrator.",
  revoked: 'Your Group Leader access has been revoked — contact your administrator.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  return <LoginForm notice={params.error ? NOTICES[params.error] : undefined} />
}
