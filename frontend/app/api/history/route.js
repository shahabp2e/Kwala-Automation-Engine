import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const qs   = req.nextUrl.searchParams.toString();
  const res  = await fetch(`${API}/history${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
