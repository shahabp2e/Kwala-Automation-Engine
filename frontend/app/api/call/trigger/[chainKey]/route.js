import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(_req, { params }) {
  const res  = await fetch(`${API}/call/trigger/${params.chainKey}`, { method: 'POST', cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
