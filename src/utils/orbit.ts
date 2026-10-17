import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  type OMMJsonObject,
} from 'satellite.js';

export interface Position {
  lat: number;
  lon: number;
  altKm: number;
  speedKps: number;
}

// Where the satellite is at `date`, or null if SGP4 can't propagate it
// (for example, it has decayed or its elements are too old).
export function positionAt(omm: OMMJsonObject, date: Date): Position | null {
  const satrec = json2satrec(omm);
  const result = propagate(satrec, date);
  if (!result) return null;

  const { position, velocity } = result;
  const geo = eciToGeodetic(position, gstime(date));

  return {
    lat: degreesLat(geo.latitude),
    lon: degreesLong(geo.longitude),
    altKm: geo.height,
    speedKps: Math.hypot(velocity.x, velocity.y, velocity.z),
  };
}

// Orbital period in minutes, from mean motion (revolutions per day).
export function periodMinutes(omm: OMMJsonObject): number {
  return 1440 / Number(omm.MEAN_MOTION);
}

export type LatLon = [lat: number, lon: number];

// The path the satellite traces over the ground for one orbit from `start`,
// sampled every `stepSeconds`. The path is split into segments wherever it
// crosses the 180° meridian, so a map doesn't draw a line across the world.
export function groundTrack(omm: OMMJsonObject, start: Date, stepSeconds = 30): LatLon[][] {
  const steps = Math.ceil((periodMinutes(omm) * 60) / stepSeconds);
  const segments: LatLon[][] = [[]];

  for (let i = 0; i <= steps; i++) {
    const pos = positionAt(omm, new Date(start.getTime() + i * stepSeconds * 1000));
    if (!pos) continue;

    const current = segments[segments.length - 1];
    const prev = current[current.length - 1];
    if (prev && Math.abs(pos.lon - prev[1]) > 180) {
      segments.push([]);
    }
    segments[segments.length - 1].push([pos.lat, pos.lon]);
  }

  return segments.filter((s) => s.length > 1);
}
