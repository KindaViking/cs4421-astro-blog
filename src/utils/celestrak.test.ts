import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: async () => body })
  );
}

const SATS = [{ OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544 }];
const HOUR = 60 * 60 * 1000;

describe('isGroup', () => {
  it('accepts known groups and rejects everything else', async () => {
    const { isGroup } = await import('./celestrak');

    expect(isGroup('stations')).toBe(true);
    expect(isGroup('bogus')).toBe(false);
    expect(isGroup('toString')).toBe(false); // not fooled by Object.prototype
  });
});

describe('getGroup', () => {
  beforeEach(() => {
    vi.resetModules(); // clears the module-level cache between tests
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches the group from CelesTrak as JSON', async () => {
    mockFetch(SATS);

    const { getGroup } = await import('./celestrak');
    const data = await getGroup('stations');

    expect(fetch).toHaveBeenCalledWith(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json'
    );
    expect(data).toEqual({
      group: 'stations',
      fetchedAt: '2026-10-17T12:00:00.000Z',
      satellites: SATS,
    });
  });

  it('caches each group for 2 hours', async () => {
    mockFetch(SATS);

    const { getGroup } = await import('./celestrak');
    await getGroup('stations');
    vi.setSystemTime(Date.now() + 1.9 * HOUR);
    await getGroup('stations');
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 0.2 * HOUR);
    await getGroup('stations');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches groups separately', async () => {
    mockFetch(SATS);

    const { getGroup } = await import('./celestrak');
    await getGroup('stations');
    await getGroup('weather');

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('throws when CelesTrak fails and nothing is cached', async () => {
    mockFetch([], false, 503);

    const { getGroup } = await import('./celestrak');

    await expect(getGroup('stations')).rejects.toThrow('CelesTrak returned 503');
  });

  it('serves stale data when CelesTrak fails after the cache expires', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch(SATS);

    const { getGroup } = await import('./celestrak');
    const first = await getGroup('stations');

    mockFetch([], false, 503);
    vi.setSystemTime(Date.now() + 3 * HOUR);

    expect(await getGroup('stations')).toEqual(first);
  });
});
