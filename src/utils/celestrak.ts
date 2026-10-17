import type { OMMJsonObject } from 'satellite.js';

// CelesTrak groups the app exposes. Anything else is rejected before it
// reaches CelesTrak, so the API route can't be used as an open proxy.
export const GROUPS = {
  stations: 'Space stations',
  visual: '100 brightest',
  'gps-ops': 'GPS',
  weather: 'Weather',
  science: 'Science',
} as const;

export type Group = keyof typeof GROUPS;

export function isGroup(value: string): value is Group {
  return Object.hasOwn(GROUPS, value);
}

export interface GroupData {
  group: Group;
  fetchedAt: string;
  satellites: OMMJsonObject[];
}

// CelesTrak only updates GP data every few hours and asks clients not to
// request the same data more than once every 2 hours.
const TTL_MS = 2 * 60 * 60 * 1000;
const cache = new Map<Group, { at: number; data: GroupData }>();

export async function getGroup(group: Group): Promise<GroupData> {
  const hit = cache.get(group);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.data;
  }

  try {
    const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`CelesTrak returned ${res.status}`);
    }

    const satellites: OMMJsonObject[] = await res.json();
    const data = { group, fetchedAt: new Date().toISOString(), satellites };
    cache.set(group, { at: Date.now(), data });
    return data;
  } catch (err) {
    // Orbits change slowly, so stale data is far better than none.
    if (hit) {
      console.error(`CelesTrak fetch failed, serving cached ${group}:`, err);
      return hit.data;
    }
    throw err;
  }
}
