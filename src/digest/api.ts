import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from './types.js';

export function digestApi(config: Pick<RigConfig, 'runsDir'>) {
  const app = new Hono();

  app.get('/:night', (c) => {
    const digest = readNight(config.runsDir, c.req.param('night'));

    if (digest === null) {
      return c.json({ error: 'night not found' }, 404);
    }

    const rows = digest.rows.toSorted((left, right) => left.job.localeCompare(right.job));
    return c.json({ rows, badLines: digest.badLines });
  });

  return app;
}
