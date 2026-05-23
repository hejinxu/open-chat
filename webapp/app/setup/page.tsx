import { redirect } from 'next/navigation'
import { getDatabaseProvider } from '@/lib/db'
import SetupForm from './setup-form'

export default async function SetupPage() {
  const db = getDatabaseProvider()
  await db.ensureReady()
  const users = await db.getUsers()

  if (users.length > 0) {
    redirect('/login')
  }

  return <SetupForm />
}
