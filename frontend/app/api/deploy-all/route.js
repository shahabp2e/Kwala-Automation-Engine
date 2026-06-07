import { NextResponse } from 'next/server';
import { BACKEND_URL as API } from '@/lib/config';

export async function POST() {
  const res  = await fetch(`${API}/deploy-all`, { method: 'POST' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
