import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mockFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: async () => body })
  );
}

describe('getKp', () => {
  beforeEach(() => {
    vi.resetModules(); // clears the module-level cache between tests
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the latest row when rows are objects', async () => {
    mockFetch([
      { time_tag: '2026-10-07T03:00:00', Kp: 1.33 },
      { time_tag: '2026-10-07T06:00:00', Kp: 1.0 },
    ]);

    const { getKp } = await import('./spaceWeather');

    expect(await getKp()).toEqual({ time: '2026-10-07 06:00:00', kp: 1 });
  });

  it('reads the latest row when rows are arrays', async () => {
    mockFetch([
      ['time_tag', 'Kp'],
      ['2026-10-07 06:00:00.000', '1.00'],
    ]);

    const { getKp } = await import('./spaceWeather');

    expect(await getKp()).toEqual({ time: '2026-10-07 06:00:00.000', kp: 1 });
  });

  it('throws when the API returns an error status', async () => {
    mockFetch([], false, 500);

    const { getKp } = await import('./spaceWeather');

    await expect(getKp()).rejects.toThrow('NOAA SWPC returned 500');
  });

  it('caches the result so a second call does not refetch', async () => {
    mockFetch([{ time_tag: '2026-10-07T06:00:00', Kp: 1.0 }]);

    const { getKp } = await import('./spaceWeather');
    await getKp();
    await getKp();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
