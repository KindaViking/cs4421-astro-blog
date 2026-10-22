import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import type { APIContext } from 'astro';
import { server } from './server';

const CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php';
const SATELLITES = [{ OBJECT_NAME: 'NOAA 19', NORAD_CAT_ID: 33591 }];

// Every URL the fake CelesTrak receives, so tests can check what was sent.
let calls: URL[] = [];

function celestrakReturns(status: number) {
  server.use(
    http.get(CELESTRAK, ({ request }) => {
      calls.push(new URL(request.url));
      return status === 200
        ? HttpResponse.json(SATELLITES)
        : new HttpResponse(null, { status });
    })
  );
}

async function get(group: string) {
  const { GET } = await import('../../src/pages/api/satellites/[group]');
  const res = await GET({ params: { group } } as unknown as APIContext);
  return { res, body: await res.json() };
}

describe('GET /api/satellites/[group] with CelesTrak', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    calls = [];
    // Fresh modules each test, so the CelesTrak cache starts empty.
    vi.resetModules();
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  it('asks CelesTrak for the requested group as JSON', async () => {
    celestrakReturns(200);

    const { res, body } = await get('weather');

    expect(res.status).toBe(200);
    expect(body.group).toBe('weather');
    expect(body.satellites).toEqual(SATELLITES);
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('GROUP')).toBe('weather');
    expect(calls[0].searchParams.get('FORMAT')).toBe('json');
  });

  it('serves a repeat request from the cache without calling CelesTrak again', async () => {
    celestrakReturns(200);

    await get('stations');
    const { res } = await get('stations');

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('serves stale cached data when CelesTrak fails after the cache expires', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    celestrakReturns(200);
    await get('stations');

    // Move the clock past the 2-hour cache lifetime, then break CelesTrak.
    const threeHoursLater = Date.now() + 3 * 60 * 60 * 1000;
    vi.spyOn(Date, 'now').mockReturnValue(threeHoursLater);
    celestrakReturns(503);

    const { res, body } = await get('stations');

    expect(res.status).toBe(200);
    expect(body.satellites).toEqual(SATELLITES);
    expect(calls).toHaveLength(2);
    expect(console.error).toHaveBeenCalled();
  });
});
