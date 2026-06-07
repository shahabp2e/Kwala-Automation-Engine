export const dynamic = 'force-dynamic';

import { BACKEND_URL as API } from '@/lib/config';

export async function GET(_request, { params }) {
  const res = await fetch(`${API}/workflows/${encodeURIComponent(params.filename)}/yaml`);
  if (!res.ok) return Response.json({ error: 'Not found' }, { status: 404 });
  const text = await res.text();
  return new Response(text, { headers: { 'Content-Type': 'text/plain' } });
}
