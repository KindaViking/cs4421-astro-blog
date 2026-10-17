import { test, expect, type Page } from '@playwright/test';
import stations from './fixtures/stations.json' with { type: 'json' };

// Serve fixture data instead of hitting CelesTrak, and skip map tiles,
// so the tests don't depend on third-party services.
async function mockApis(page: Page, satellites: (group: string) => unknown = () => stations) {
  await page.route('**/api/satellites/*', (route) => {
    const group = new URL(route.request().url()).pathname.split('/').pop()!;
    return route.fulfill({ json: satellites(group) });
  });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
}

test.describe('satellite tracker', () => {
  test('shows every satellite that can be propagated', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');

    await expect(page.getByRole('status')).toHaveText(/Tracking 2 satellites/);
    await expect(page.locator('path.sat-marker')).toHaveCount(2);

    // The decayed object is filtered out of the list as well as the map.
    const options = page.getByLabel('Satellite', { exact: true }).locator('option');
    await expect(options).toHaveText(['CSS (TIANHE)', 'ISS (ZARYA)']);
  });

  test('selects the ISS by default and shows its details', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');

    await expect(page.getByLabel('Satellite', { exact: true })).toHaveValue('25544');
    const info = page.locator('#sat-info');
    await expect(info).toBeVisible();
    await expect(info.locator('[data-field="name"]')).toHaveText('ISS (ZARYA)');
    await expect(info.locator('[data-field="alt"]')).toHaveText(/\d+ km/);
    await expect(info.locator('[data-field="period"]')).toHaveText('93.0 min');
  });

  test('picking a satellite from the list updates the details', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');

    await page.getByLabel('Satellite', { exact: true }).selectOption('48274');

    await expect(page.locator('[data-field="name"]')).toHaveText('CSS (TIANHE)');
    await expect(page.locator('[data-field="norad"]')).toHaveText('48274');
  });

  test('clicking a marker selects that satellite', async ({ page }) => {
    await mockApis(page);
    await page.goto('/');
    await expect(page.locator('path.sat-marker')).toHaveCount(2);

    // Find the marker that isn't selected (the selected one is drawn larger, in orange).
    // It's CSS (TIANHE), whose 41.5° inclination keeps it inside the visible map.
    // Click its on-screen position: WebKit wrongly reports Leaflet's transformed
    // SVG paths as outside the viewport, so locator.click() fails there.
    const box = await page.locator('path.sat-marker:not([stroke="#ff9900"])').boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page.locator('[data-field="name"]')).toHaveText('CSS (TIANHE)');
  });

  test('changing group loads that group from the API', async ({ page }) => {
    const requested: string[] = [];
    await mockApis(page, (group) => {
      requested.push(group);
      return { ...stations, group, satellites: stations.satellites.slice(1, 2) };
    });
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText(/Tracking 1 satellites/);

    await page.getByLabel('Group', { exact: true }).selectOption('weather');

    await expect.poll(() => requested).toEqual(['stations', 'weather']);
    await expect(page.locator('path.sat-marker')).toHaveCount(1);
  });

  test('shows a message when the API is unavailable', async ({ page }) => {
    await page.route('**/api/satellites/*', (route) =>
      route.fulfill({ status: 502, json: { error: 'Satellite data is temporarily unavailable' } })
    );
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
    await page.goto('/');

    await expect(page.getByRole('status')).toHaveText(/unavailable right now/);
    await expect(page.locator('#sat-info')).toBeHidden();
  });
});

test('health endpoint reports ok', async ({ request }) => {
  const res = await request.get('/api/health');

  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: 'ok' });
});
