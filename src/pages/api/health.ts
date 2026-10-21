import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      status: 'broken',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
};
