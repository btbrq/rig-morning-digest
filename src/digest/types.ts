export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: 'ok' | 'retry' | 'fail';
  lastError: string | null;
  // Original log timestamps, including their offsets; do not normalize to UTC.
  firstAt: string;
  lastAt: string;
};

// Contract only: the reader implementation will supply this function.
// Missing file: null. Empty file: no rows. Malformed lines: counted, not thrown.
export declare function readNight(
  runsDir: string,
  night: string,
): { rows: DigestRow[]; badLines: number } | null;
