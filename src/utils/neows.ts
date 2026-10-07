export interface Asteroid {
  name: string;
  hazardous: boolean;
  diameterM: number;
  missKm: number;
  missLunar: number;
  speedKps: number;
}

interface NeoRaw {
  name: string;
  is_potentially_hazardous_asteroid: boolean;
  estimated_diameter: { meters: { estimated_diameter_max: number } };
  close_approach_data: {
    relative_velocity: { kilometers_per_second: string };
    miss_distance: { kilometers: string; lunar: string };
  }[];
}

interface NeoFeed {
  near_earth_objects: Record<string, NeoRaw[]>;
}

const TTL_MS = 60 * 60 * 1000; // refetch at most once an hour
let cache: { at: number; day: string; items: Asteroid[] } | null = null;

export async function getAsteroids(): Promise<Asteroid[]> {
  const today = new Date().toISOString().slice(0, 10);

  if (cache && cache.day === today && Date.now() - cache.at < TTL_MS) {
    return cache.items;
  }

  const key = import.meta.env.NASA_API_KEY ?? 'DEMO_KEY';
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${today}&end_date=${today}&api_key=${key}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NeoWs API returned ${res.status}`);
  }

  const data: NeoFeed = await res.json();
  const raw = data.near_earth_objects[today] ?? [];

  const items = raw
    .flatMap((n) => {
      const approach = n.close_approach_data[0];
      if (!approach) return [];
      return [
        {
          name: n.name,
          hazardous: n.is_potentially_hazardous_asteroid,
          diameterM: n.estimated_diameter.meters.estimated_diameter_max,
          missKm: Number(approach.miss_distance.kilometers),
          missLunar: Number(approach.miss_distance.lunar),
          speedKps: Number(approach.relative_velocity.kilometers_per_second),
        },
      ];
    })
    .sort((a, b) => a.missKm - b.missKm)
    .slice(0, 5);

  cache = { at: Date.now(), day: today, items };
  return items;
}
