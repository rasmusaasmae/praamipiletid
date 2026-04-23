import { HomeClient } from '@/components/home-client'
import { getMyTripCards } from '@/lib/queries'
import { getAllSettings } from '@/lib/settings'

export default async function HomePage() {
  const [{ pollIntervalMs }, cards] = await Promise.all([getAllSettings(), getMyTripCards()])
  return <HomeClient cards={cards} pollIntervalMs={pollIntervalMs} />
}
