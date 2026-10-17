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
