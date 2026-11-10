import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

type Run = {
  at: string;
  job: string;
  owner: string | null;
  status: DigestRow['lastStatus'];
  error?: string;
};

function isRun(value: unknown): value is Run {
  if (typeof value !== 'object' || value === null) return false;
  return 'at' in value && typeof value.at === 'string'
    && 'job' in value && typeof value.job === 'string'
    && 'owner' in value && (typeof value.owner === 'string' || value.owner === null)
    && 'status' in value && (value.status === 'ok' || value.status === 'retry' || value.status === 'fail')
    && (!('error' in value) || typeof value.error === 'string');
}

// Missing file: null. Empty file: no rows. Malformed lines: counted, not thrown.
export function readNight(
  runsDir: string,
  night: string,
): { rows: DigestRow[]; badLines: number } | null {
  // A night is a filename, never a path supplied by a route caller.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;

  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  const lines = contents === '' ? [] : contents.split('\n');
  // A final newline terminates the last record; it is not another malformed record.
  if (lines.at(-1) === '') lines.pop();

  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      badLines++;
      continue;
    }
    if (!isRun(value)) {
      badLines++;
      continue;
    }

    const row = rows.get(value.job);
    if (row) {
      row.owner = value.owner;
      row.runs++;
      row.retries += value.status === 'retry' ? 1 : 0;
      row.lastStatus = value.status;
      // Keep the most recent error, even when a later attempt succeeds.
      if (value.error !== undefined) row.lastError = value.error;
      row.lastAt = value.at;
    } else {
      rows.set(value.job, {
        job: value.job,
        owner: value.owner,
        runs: 1,
        retries: value.status === 'retry' ? 1 : 0,
        lastStatus: value.status,
        lastError: value.error ?? null,
        firstAt: value.at,
        lastAt: value.at,
      });
    }
  }

  return { rows: [...rows.values()], badLines };
}
