import { describe, it, expect } from 'vitest';
import type { OMMJsonObject } from 'satellite.js';
import { periodMinutes, positionAt } from './orbit';

// Real CelesTrak elements for the ISS, so results are deterministic.
const ISS: OMMJsonObject = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-10-17T04:14:38.489568',
  MEAN_MOTION: 15.48906925,
  ECCENTRICITY: 0.00067762,
  INCLINATION: 51.6327,
  RA_OF_ASC_NODE: 56.4129,
  ARG_OF_PERICENTER: 273.6806,
  MEAN_ANOMALY: 86.3408,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 59066,
  BSTAR: 0.00016757209,
  MEAN_MOTION_DOT: 8.767e-5,
  MEAN_MOTION_DDOT: 0,
};

const EPOCH = new Date('2026-10-17T04:14:38.489Z');

describe('positionAt', () => {
  it('puts the ISS in low Earth orbit at its epoch', () => {
    const pos = positionAt(ISS, EPOCH);

    expect(pos).not.toBeNull();
    expect(pos!.altKm).toBeGreaterThan(400);
    expect(pos!.altKm).toBeLessThan(440);
    expect(pos!.speedKps).toBeCloseTo(7.66, 1);
    expect(pos!.lon).toBeGreaterThanOrEqual(-180);
    expect(pos!.lon).toBeLessThanOrEqual(180);
  });

  it('never goes further from the equator than the orbit inclination', () => {
    const lats = Array.from({ length: 100 }, (_, i) => {
      const date = new Date(EPOCH.getTime() + i * 60_000);
      return Math.abs(positionAt(ISS, date)!.lat);
    });

    expect(Math.max(...lats)).toBeLessThanOrEqual(52);
    expect(Math.max(...lats)).toBeGreaterThan(50); // 100 minutes covers a full orbit
  });

  it('moves between calls a minute apart', () => {
    const a = positionAt(ISS, EPOCH)!;
    const b = positionAt(ISS, new Date(EPOCH.getTime() + 60_000))!;

    expect(a.lat).not.toBeCloseTo(b.lat, 1);
  });

  it('returns null when the elements can no longer be propagated', () => {
    const decayed = { ...ISS, EPOCH: '2000-01-01T00:00:00', MEAN_MOTION: 16.5 };

    expect(positionAt(decayed, new Date('2026-10-17T00:00:00Z'))).toBeNull();
  });
});

describe('periodMinutes', () => {
  it('converts mean motion to an orbital period', () => {
    expect(periodMinutes(ISS)).toBeCloseTo(92.97, 1);
  });
});
