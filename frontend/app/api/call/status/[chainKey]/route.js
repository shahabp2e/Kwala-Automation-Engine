import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const ts  = req.nextUrl.searchParams.get('timestamp') ?? '';
  const res = await fetch(`${API}/call/status/${params.chainKey}?timestamp=${ts}`, { cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
