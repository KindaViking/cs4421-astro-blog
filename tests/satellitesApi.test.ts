import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIContext } from 'astro';

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: async () => body })
  );
}

async function get(group: string) {
  const { GET } = await import('../src/pages/api/satellites/[group]');
  const res = await GET({ params: { group } } as unknown as APIContext);
  return { res, body: await res.json() };
}

describe('GET /api/satellites/[group]', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns the group with a cache header', async () => {
    mockFetch([{ OBJECT_NAME: 'ISS (ZARYA)' }]);

    const { res, body } = await get('stations');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=600');
    expect(body.satellites).toEqual([{ OBJECT_NAME: 'ISS (ZARYA)' }]);
  });

  it('returns 404 with the valid groups for an unknown group, without calling CelesTrak', async () => {
    mockFetch([]);

    const { res, body } = await get('bogus');

    expect(res.status).toBe(404);
    expect(body.groups).toContain('stations');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 502 when CelesTrak is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch([], false, 503);

    const { res, body } = await get('stations');

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/unavailable/);
  });
});
