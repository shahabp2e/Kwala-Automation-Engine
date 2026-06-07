import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  const body = await req.text();
  const res  = await fetch(`${API}/call/${params.chainKey}/dagRuns`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return new NextResponse(await res.text(), { status: res.status });
}
