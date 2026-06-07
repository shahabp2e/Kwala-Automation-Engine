import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const search = req.nextUrl.searchParams.toString();
  const res    = await fetch(`${API}/call/history${search ? '?' + search : ''}`, { cache: 'no-store' });
  const data   = await res.json();
  return NextResponse.json(data, { status: res.status });
}
