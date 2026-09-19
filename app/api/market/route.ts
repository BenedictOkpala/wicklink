import { getMarket } from '@/lib/market/client';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const market = await getMarket();
  return Response.json(market, { status: market.dataStatus === 'ERROR' && market.assets.length === 0 ? 502 : 200, headers: { 'Cache-Control': 'no-store' } });
}
