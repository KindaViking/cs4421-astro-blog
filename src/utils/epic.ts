export interface EpicFrame {
  src: string;
  time: string;
  date: string;
}

const TTL_MS = 60 * 60 * 1000; // refetch at most once an hour
let cache: { at: number; frames: EpicFrame[] } | null = null;

export async function getEpicFrames(): Promise<EpicFrame[]> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.frames;
  }

  const res = await fetch('https://epic.gsfc.nasa.gov/api/natural');
  if (!res.ok) {
    throw new Error(`EPIC API returned ${res.status}`);
  }

  const data: { image: string; date: string }[] = await res.json();

  const frames = data.slice(0, 10).map((item) => {
    const [day, time] = item.date.split(' ');
    const [year, month, d] = day.split('-');
    return {
      src: `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${d}/jpg/${item.image}.jpg`,
      time: `${time} UTC`,
      date: day,
    };
  });

  cache = { at: Date.now(), frames };
  return frames;
}
