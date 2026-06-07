import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(_req, { params }) {
  const res  = await fetch(`${API}/chains/${encodeURIComponent(params.chainKey)}/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
