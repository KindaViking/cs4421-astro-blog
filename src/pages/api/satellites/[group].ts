import type { APIRoute } from 'astro';
import { GROUPS, getGroup, isGroup } from '../../../utils/celestrak';

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

// The static site has no server, so this route is left out of its build.
export const getStaticPaths = import.meta.env.STATIC_BUILD ? () => [] : undefined;

export const GET: APIRoute = async ({ params }) => {
  const group = params.group ?? '';

  if (!isGroup(group)) {
    return json({ error: `Unknown group "${group}"`, groups: Object.keys(GROUPS) }, 404);
  }

  try {
    const data = await getGroup(group);
    // Let browsers reuse the data for 10 minutes; positions are computed client-side.
    return json(data, 200, { 'Cache-Control': 'public, max-age=600' });
  } catch (err) {
    console.error('CelesTrak fetch failed:', err);
    return json({ error: 'Satellite data is temporarily unavailable' }, 502);
  }
};
