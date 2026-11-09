import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/reader.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestMissing, DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const data = readNight(config.runsDir, night);
    if (data === null) {
      return c.html(
        <Layout title={`digest · ${night}`} lane={lane()}>
          <DigestMissing night={night} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={data} />
      </Layout>,
    );
  });

  // Plan morning-digest § 2b. Same reader, same row order as the page (ADR 0001): no reshaping here.
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const found = readNight(config.runsDir, night);
    if (found === null) return c.json({ error: 'no run log', night }, 404);
    return c.json(found);
  });

  return app;
}
