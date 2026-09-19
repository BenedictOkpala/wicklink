import { executeInvestigation } from '@/lib/investigation/investigate';
import { isSupportedSymbol } from '@/lib/investigation/symbols';
import { isRecord } from '@/lib/bitget/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isRecord(body) || typeof body.symbol !== 'string') {
      return Response.json({ error: 'Missing or invalid symbol in request body.' }, { status: 400 });
    }

    const symbol = body.symbol.trim().toUpperCase();
    if (!isSupportedSymbol(symbol)) {
      return Response.json({ error: `Symbol '${body.symbol}' is not a supported Reality instrument. Supported: AAPL, NVDA, TSLA.` }, { status: 400 });
    }

    const report = await executeInvestigation(symbol);
    return Response.json(report, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal investigation failure';
    return Response.json({ error: message }, { status: 500 });
  }
}

export function GET() {
  return Response.json({ error: 'Method Not Allowed. Use POST with { symbol }.' }, {
    status: 405,
    headers: { Allow: 'POST' },
  });
}
