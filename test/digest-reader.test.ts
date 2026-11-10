import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';

const night = '2026-10-28';
const temporaryDirs: string[] = [];

function runsWith(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  temporaryDirs.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), contents);
  return dir;
}

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('aggregates the real night into five jobs and counts its truncated line', () => {
    const digest = readNight('runs', night);
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows).toHaveLength(5);
    expect(digest?.rows).toEqual(expect.arrayContaining([
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
        lastStatus: 'ok', lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
        lastStatus: 'ok', lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
        lastStatus: 'fail', lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0,
        lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
    ]));
  });

  it('distinguishes missing nights from an empty file', () => {
    const dir = runsWith('');
    expect(readNight(dir, night)).toEqual({ rows: [], badLines: 0 });
    expect(readNight(dir, '2026-10-27')).toBeNull();
    expect(readNight(join(dir, 'missing'), night)).toBeNull();
  });

  it('uses log order, preserves timestamp offsets and updates null owners and the last error', () => {
    const firstAt = '2026-10-28T23:59:59.123-04:00';
    const lastAt = '2026-10-29T04:00:00.456+05:30';
    const dir = runsWith([
      { at: firstAt, job: 'job', owner: 'rook', status: 'retry', error: 'first error' },
      { at: lastAt, job: 'job', owner: null, status: 'fail', error: 'last error' },
    ].map((run) => JSON.stringify(run)).join('\r\n'));
    expect(readNight(dir, night)).toEqual({
      rows: [{
        job: 'job', owner: null, runs: 2, retries: 1,
        lastStatus: 'fail', lastError: 'last error', firstAt, lastAt,
      }],
      badLines: 0,
    });
  });

  it('counts invalid JSON and invalid records without losing later valid runs', () => {
    const valid = { at: '2026-10-28T23:00:00+01:00', job: '__proto__', owner: null, status: 'ok' };
    const invalid = [
      'not JSON', 'null', '[]', '42', '{}', '',
      JSON.stringify({ ...valid, at: 123 }),
      JSON.stringify({ ...valid, job: null }),
      JSON.stringify({ ...valid, owner: 123 }),
      JSON.stringify({ at: valid.at, job: valid.job, status: valid.status }),
      JSON.stringify({ ...valid, status: 'unknown' }),
      JSON.stringify({ ...valid, error: null }),
    ];
    const dir = runsWith([...invalid, JSON.stringify(valid), ''].join('\n'));
    expect(readNight(dir, night)).toEqual({
      rows: [{
        job: '__proto__', owner: null, runs: 1, retries: 0,
        lastStatus: 'ok', lastError: null, firstAt: valid.at, lastAt: valid.at,
      }],
      badLines: invalid.length,
    });
  });

  it('does not read paths outside the runs directory', () => {
    const dir = runsWith('');
    expect(readNight(dir, '../2026-10-28')).toBeNull();
  });

  it('does not hide filesystem errors other than a missing file', () => {
    const dir = runsWith('');
    mkdirSync(join(dir, '2026-10-29.jsonl'));
    expect(() => readNight(dir, '2026-10-29')).toThrow();
  });
});
