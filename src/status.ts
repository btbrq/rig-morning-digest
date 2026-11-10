import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { readNight, type DigestRow } from './digest/types.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type NightStatus = {
  night: string;
  counts: Record<DigestRow['lastStatus'], number> | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightStatus[];
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => {
      const digest = readNight(config.runsDir, night);
      const counts = digest
        ? digest.rows.reduce<Record<DigestRow['lastStatus'], number>>(
            (total, row) => ({
              ok: total.ok + (row.lastStatus === 'ok' ? 1 : 0),
              retry: total.retry + row.retries,
              fail: total.fail + (row.lastStatus === 'fail' ? 1 : 0),
            }),
            { ok: 0, retry: 0, fail: 0 },
          )
        : null;

      return { night, counts };
    }),
  };
}
