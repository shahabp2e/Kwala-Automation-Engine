export const dynamic = 'force-dynamic';

import { BACKEND_URL as API } from '@/lib/config';

export async function DELETE(_request, { params }) {
  const res  = await fetch(`${API}/workflows/${encodeURIComponent(params.filename)}`, { method: 'DELETE' });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
