import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import stations from './fixtures/stations.json' with { type: 'json' };

const pages = [
  { name: 'home page', path: '/' },
  { name: 'blog index', path: '/blog' },
  { name: 'blog post', path: '/blog/sojourner/' },
  { name: 'about page', path: '/about' },
];

for (const { name, path } of pages) {
  test(`${name} has no accessibility violations`, async ({ page }) => {
    // Same mocks as the tracker tests, so no page depends on CelesTrak or map tiles.
    await page.route('**/api/satellites/*', (route) => route.fulfill({ json: stations }));
    await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());

    await page.goto(path);
    if (path === '/') {
      // Wait for the satellite tracker to finish loading before checking.
      await expect(page.getByRole('status')).toHaveText(/Tracking/);
    }

    // Check against WCAG 2.1 levels A and AA.
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // One readable line per problem: rule, what it means, and how many elements.
    const problems = results.violations.map(
      (v) => `${v.id}: ${v.help} (${v.nodes.length} element${v.nodes.length === 1 ? '' : 's'})`
    );
    expect(problems).toEqual([]);
  });
}
