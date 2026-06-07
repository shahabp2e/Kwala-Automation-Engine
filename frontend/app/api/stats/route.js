import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const res  = await fetch(`${API}/stats`, { cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
