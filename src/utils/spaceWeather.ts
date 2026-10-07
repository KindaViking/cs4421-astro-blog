export interface KpReading {
  time: string;
  kp: number;
}

const TTL_MS = 10 * 60 * 1000; // refetch at most every 10 minutes
let cache: { at: number; reading: KpReading } | null = null;

export async function getKp(): Promise<KpReading> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.reading;
  }

  const res = await fetch(
    'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
  );
  if (!res.ok) {
    throw new Error(`NOAA SWPC returned ${res.status}`);
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Unexpected Kp data format');
  }

  // The feed has used both array rows and object rows, so handle either.
  const last: unknown = data[data.length - 1];
  let time: string;
  let kp: number;

  if (Array.isArray(last)) {
    time = String(last[0]);
    kp = Number(last[1]);
  } else if (typeof last === 'object' && last !== null) {
    const row = last as Record<string, unknown>;
    time = String(row.time_tag);
    kp = Number(row.Kp ?? row.kp_index);
  } else {
    throw new Error('Unexpected Kp row format');
  }

  if (Number.isNaN(kp)) {
    throw new Error('Could not read Kp value');
  }

  const reading = { time: time.replace('T', ' '), kp };
  cache = { at: Date.now(), reading };
  return reading;
}
