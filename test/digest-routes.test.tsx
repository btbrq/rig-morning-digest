import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

const night = '2026-11-09';
const entry = {
  at: '2026-11-09T23:15:00+01:00',
  job: 'notes/backup',
  status: 'fail',
  owner: 'lane-07',
  error: 'quota exceeded',
};
const expectedDigest = {
  rows: [
    {
      job: 'notes/backup',
      owner: 'lane-07',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-11-09T23:15:00+01:00',
      lastAt: '2026-11-09T23:15:00+01:00',
    },
  ],
  badLines: 0,
};

describe('digest routes', () => {
  let runsDir: string;
  let config: RigConfig;

  beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
    config = {
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    };
  });

  afterEach(async () => {
    await rm(runsDir, { recursive: true, force: true });
  });

  it('serves a populated night as HTML and JSON', async () => {
    await writeFile(join(runsDir, `${night}.jsonl`), `${JSON.stringify(entry)}\n`);
    const app = createApp(config);

    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);

    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('notes/backup');
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual(expectedDigest);
  });

  it('returns 404 from both routes when the night is missing', async () => {
    const app = createApp(config);

    expect((await app.request(`/digest/${night}`)).status).toBe(404);
    expect((await app.request(`/api/digest/${night}`)).status).toBe(404);
  });

  it('serves an empty night without treating it as missing', async () => {
    await writeFile(join(runsDir, `${night}.jsonl`), '');
    const app = createApp(config);

    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ rows: [], badLines: 0 });
  });

  it('keeps rendering valid entries when a line is malformed', async () => {
    await writeFile(
      join(runsDir, `${night}.jsonl`),
      `${JSON.stringify(entry)}\nthis is not json\n`,
    );
    const app = createApp(config);

    const page = await app.request(`/digest/${night}`);
    const api = await app.request(`/api/digest/${night}`);

    expect(page.status).toBe(200);
    expect(await page.text()).toContain('notes/backup');
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ ...expectedDigest, badLines: 1 });
  });
});
