
import { getStore } from '@netlify/blobs';

// Serves the saved snapshot data to the page at /api/history
export default async () => {
  const st = await getStore('risers').get('state', { type: 'json' });
  return new Response(JSON.stringify(st || {}), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' }
  });
};

export const config = { path: '/api/history' };
