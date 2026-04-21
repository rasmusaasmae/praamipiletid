import { HomeClient } from '@/components/home-client'
import { getAllSettings } from '@/lib/settings'

export default async function HomePage() {
  const { pollIntervalMs } = await getAllSettings()
  return <HomeClient pollIntervalMs={pollIntervalMs} />
}
