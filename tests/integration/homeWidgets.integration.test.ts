import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { http, HttpResponse } from 'msw';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { server } from './server';

const NEOWS = 'https://api.nasa.gov/neo/rest/v1/feed';
const NOAA = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const EPIC = 'https://epic.gsfc.nasa.gov/api/natural';

// Fresh imports each test, so each widget's API cache starts empty.
const widgets = {
  NearEarthObjects: () => import('../../src/components/NearEarthObjects.astro'),
  SpaceWeather: () => import('../../src/components/SpaceWeather.astro'),
  EpicEarth: () => import('../../src/components/EpicEarth.astro'),
};

async function render(name: keyof typeof widgets) {
  const { default: component } = await widgets[name]();
  const container = await AstroContainer.create();
  return container.renderToString(component);
}

function asteroid(name: string, missKm: number, hazardous: boolean) {
  return {
    name,
    is_potentially_hazardous_asteroid: hazardous,
    estimated_diameter: { meters: { estimated_diameter_max: 120 } },
    close_approach_data: [
      {
        relative_velocity: { kilometers_per_second: '12.5' },
        miss_distance: { kilometers: String(missKm), lunar: String(missKm / 384400) },
      },
    ],
  };
}

describe('home page widgets', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });
  afterAll(() => server.close());

  describe('NearEarthObjects (NASA NeoWs)', () => {
    it("lists today's asteroids, closest first, and credits NASA", async () => {
      const today = new Date().toISOString().slice(0, 10);
      let requestedDate: string | null = null;
      server.use(
        http.get(NEOWS, ({ request }) => {
          requestedDate = new URL(request.url).searchParams.get('start_date');
          return HttpResponse.json({
            near_earth_objects: {
              [today]: [asteroid('Far Rock', 9_000_000, false), asteroid('Near Rock', 1_000_000, true)],
            },
          });
        })
      );

      const html = await render('NearEarthObjects');

      expect(requestedDate).toBe(today);
      expect(html).toContain('Asteroids passing Earth today');
      expect(html.indexOf('Near Rock')).toBeLessThan(html.indexOf('Far Rock'));
      expect(html).toContain('potentially hazardous');
      expect(html).toContain('Data: NASA NeoWs');
    });

    it('is hidden and logs an error when NeoWs is rate-limited', async () => {
      server.use(http.get(NEOWS, () => new HttpResponse(null, { status: 429 })));

      const html = await render('NearEarthObjects');

      expect(html).not.toContain('Asteroids passing Earth today');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('SpaceWeather (NOAA SWPC)', () => {
    it('shows the latest Kp reading with its storm level', async () => {
      server.use(
        http.get(NOAA, () =>
          HttpResponse.json([
            ['time_tag', 'Kp'],
            ['2026-10-22 06:00:00.000', '2.00'],
            ['2026-10-22 09:00:00.000', '5.33'],
          ])
        )
      );

      const html = await render('SpaceWeather');

      expect(html).toContain('Kp 5.3');
      expect(html).toContain('Geomagnetic storm (G1)');
      expect(html).toContain('NOAA Space Weather Prediction Center');
    });

    it('is hidden and logs an error when NOAA is down', async () => {
      server.use(http.get(NOAA, () => new HttpResponse(null, { status: 500 })));

      const html = await render('SpaceWeather');

      expect(html).not.toContain('Space weather');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('EpicEarth (NASA EPIC)', () => {
    it('builds image URLs from the EPIC response', async () => {
      server.use(
        http.get(EPIC, () =>
          HttpResponse.json([{ image: 'epic_1b_20261021003633', date: '2026-10-21 00:36:33' }])
        )
      );

      const html = await render('EpicEarth');

      expect(html).toContain('Earth right now');
      expect(html).toContain(
        'https://epic.gsfc.nasa.gov/archive/natural/2026/10/21/jpg/epic_1b_20261021003633.jpg'
      );
    });

    it('is hidden and logs an error when EPIC is down', async () => {
      server.use(http.get(EPIC, () => new HttpResponse(null, { status: 503 })));

      const html = await render('EpicEarth');

      expect(html).not.toContain('Earth right now');
      expect(console.error).toHaveBeenCalled();
    });
  });
});
