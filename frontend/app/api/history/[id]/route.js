import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export async function GET(_req, { params }) {
  const res  = await fetch(`${API}/history/${params.id}`, { cache: 'no-store' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
