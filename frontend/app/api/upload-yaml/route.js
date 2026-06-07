export const dynamic = 'force-dynamic';

import { BACKEND_URL as API } from '@/lib/config';

export async function POST(request) {
  const body        = await request.blob();
  const contentType = request.headers.get('content-type') ?? '';
  const res = await fetch(`${API}/upload-yaml`, {
    method:  'POST',
    body,
    headers: { 'content-type': contentType },
  });
  const data = await res.json();
  return Response.json(data, { status: res.status });
}
