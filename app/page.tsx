import MarketMonitor from '@/components/MarketMonitor';
import { getMarket } from '@/lib/market/client';
export const dynamic = 'force-dynamic';
export default async function Page() { return <MarketMonitor initialData={await getMarket()} />; }
